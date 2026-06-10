# Platform RBAC — Backend (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for a new, self-contained "platform RBAC" (dynamic roles → `resource.action` permissions, assigned to users with a platform/cluster scope, with server-resolved effective permissions), namespaced under `/api-system/platform/`, without touching the existing tenant-ERP application-role RBAC.

**Architecture:** Follows the repo's gateway→microservice TCP pattern. New Prisma tables live in `prisma-shared-schema-platform`. Microservice logic (Prisma CRUD + permission resolution) lives in **micro-business** (`apps/micro-business/src/authen/`), reached over TCP via `@MessagePattern({ cmd, service })`. Thin gateway controllers under `apps/backend-gateway/src/platform/` proxy to it via `@Inject('BUSINESS_SERVICE')`. Effective permissions are injected into the login response (micro-business `auth.service`) and the profile response (gateway `user.service`). A new permission guard enforces platform permissions on the gateway routes.

**Tech Stack:** NestJS, Prisma (Postgres), `nestjs-zod` (`createZodDto`) DTOs, `@nestjs/microservices` (TCP), Bun, ts-node seeds, `@nestjs/testing` (Jest) smoke tests.

**Repo:** All work is in `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`. Paths below are relative to that repo root unless noted.

---

## Conventions to follow (read before starting)

- **Soft delete + audit:** every table has `created_at/created_by_id/updated_at/updated_by_id/deleted_at/deleted_by_id`; uniqueness includes `deleted_at`; "delete" means set `deleted_at = new Date()`. Active rows filter `deleted_at: null`.
- **Microservice service:** inject `@Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM`; wrap methods with `@TryCatch`; return `Result.ok(...)` / `Result.error(msg, ErrorCode.X)`; use the `QueryParams` helper for pagination (`q.findMany()`, `q.where()`, `q.page`, `q.perpage`).
- **Microservice controller:** `@MessagePattern({ cmd: '<x>.<verb>', service: '<x>' })`; build audit context via `this.createAuditContext(payload)` + `runWithAuditContext(...)`; wrap with `this.handleResult(result)` or `this.handlePaginatedResult(result)`; extend `BaseMicroserviceController`.
- **Gateway service:** inject `@Inject('BUSINESS_SERVICE') private readonly authService: ClientProxy`; `firstValueFrom(this.authService.send({ cmd, service }, { ...payload, ...getGatewayRequestContext() }))`; map non-OK status to `Result.error(...)` else `Result.ok({ data, paginate })`.
- **Gateway controller:** extend `BaseHttpController`; `@Controller('api-system/platform/<x>')`; `@UseGuards(KeycloakGuard)`, `@ApiBearerAuth()`, `@ApiHeaderRequiredXAppId()`; respond via `this.respond(res, result[, status])`.
- **MicroserviceResponse shape:** `{ data?, paginate?, response: { status, message, timestamp } }`.
- **DTOs:** Zod via `createZodDto` (see `application-role.create.dto.ts` for the exact style) for role/assignment; class-validator style (see `application-permission.dto.ts`) is also acceptable but prefer Zod for consistency with roles.
- **Naming:** all new identifiers use a `platform`/`platform-role`/`platform-permission` prefix so nothing collides with the existing application-role modules. TCP cmds use the `platform-roles.*`, `platform-permissions.*`, `user-platform-roles.*` namespaces.

## Build/verify commands (used throughout)

```bash
# from repo root, once, if shared packages not built yet:
bun run build:package

# Prisma (from packages/prisma-shared-schema-platform):
bun run db:migrate        # prisma migrate dev --skip-generate  (creates + applies migration)
bun run db:generate       # prisma generate

# Seeds (from packages/prisma-shared-schema-platform):
bun run db:seed.platform-permission
bun run db:seed.platform-role-permission

# Tests (from a service dir, e.g. apps/micro-business):
bun run test

# Run a service locally for manual endpoint checks (from repo root):
bun run dev               # boots gateway + microservices
```

When a step says "verify endpoint", use the gateway HTTP port (4000) with a valid Bearer token and `x-app-id` header, e.g.:
```bash
curl -s http://localhost:4000/api-system/platform/permissions \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq .
```

---

## File Map (what gets created/modified)

**Prisma (`packages/prisma-shared-schema-platform/`)**
- Modify: `prisma/schema.prisma` — add 4 models
- Create (generated): `prisma/migrations/<ts>_platform_rbac/migration.sql`
- Create: `prisma/seed.platform-permission.ts`
- Create: `prisma/seed.platform-role-permission.ts`
- Modify: `package.json` — 2 seed scripts

**micro-business (`apps/micro-business/src/authen/`)**
- Create: `platform_permission/{platform_permission.module,controller,service}.ts` (+ `interface/platform_permission.interface.ts`)
- Create: `platform_role/{platform_role.module,controller,service}.ts` (+ interface)
- Create: `user_platform_role/{user_platform_role.module,controller,service}.ts` (+ interface)
- Create: `platform_permission/effective_permissions.service.ts` (resolver shared by login + assignment modules)
- Create smoke tests: `*.service.spec.ts` next to each service
- Modify: `apps/micro-business/src/authen/auth/auth.service.ts` — attach `effective_permissions` to login result
- Modify: `apps/micro-business/src/app.module.ts` — register the 3 new modules

**backend-gateway (`apps/backend-gateway/src/`)**
- Create DTOs: `common/dto/platform-role/{create,update,index}.ts`, `common/dto/user-platform-role/{assign,index}.ts`
- Create: `platform/platform-roles/{module,controller,service}.ts` (+ `swagger/{request,response}.ts`)
- Create: `platform/platform-permissions/{module,controller,service}.ts`
- Create: `platform/user-platform-roles/{module,controller,service}.ts`
- Create: `auth/decorators/platform-permission.decorator.ts`
- Create: `auth/guards/platform-permission.guard.ts` (+ `auth/services/platform-permission.service.ts`)
- Modify: `application/user/user.service.ts` — attach `effective_permissions` to profile
- Modify: `app.module.ts` (or the relevant module aggregator) — register the 3 new gateway modules
- Modify: `auth/swagger/response.ts` — add `effective_permissions` to `LoginResponseDto`

---

## Task 1: Add Prisma models for platform RBAC

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (append after the last model)

- [ ] **Step 1: Add the 4 models**

Append to `schema.prisma`:

```prisma
model tb_platform_permission {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  resource    String   @db.VarChar
  action      String   @db.VarChar
  description String?

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_platform_role_tb_permission tb_platform_role_tb_permission[]

  @@unique([resource, action, deleted_at], map: "platform_permission_resource_action_deleted_at_u")
}

model tb_platform_role {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   @db.VarChar
  description String?
  is_active   Boolean? @default(true) @db.Boolean

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_platform_role_tb_permission tb_platform_role_tb_permission[]
  tb_user_tb_platform_role       tb_user_tb_platform_role[]

  @@unique([name, deleted_at], map: "platform_role_name_deleted_at_u")
}

model tb_platform_role_tb_permission {
  id                     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  platform_role_id       String   @db.Uuid
  platform_permission_id String   @db.Uuid
  is_active              Boolean? @default(true) @db.Boolean

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_platform_role       tb_platform_role       @relation(fields: [platform_role_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
  tb_platform_permission tb_platform_permission @relation(fields: [platform_permission_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([platform_role_id, platform_permission_id, deleted_at], map: "platform_role_permission_deleted_at_u")
}

model tb_user_tb_platform_role {
  id               String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id          String  @db.Uuid
  platform_role_id String  @db.Uuid
  cluster_id       String? @db.Uuid // null = platform-wide scope; set = scoped to this cluster

  created_at    DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id String?   @db.Uuid
  updated_at    DateTime? @default(now()) @db.Timestamptz(6)
  updated_by_id String?   @db.Uuid
  deleted_at    DateTime? @db.Timestamptz(6)
  deleted_by_id String?   @db.Uuid

  tb_platform_role tb_platform_role @relation(fields: [platform_role_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([user_id, platform_role_id, cluster_id, deleted_at], map: "user_platform_role_deleted_at_u")
  @@index([user_id, deleted_at], map: "user_platform_role_user_deleted_at_idx")
}
```

> Note: `tb_user_tb_platform_role` deliberately does NOT add a relation onto `tb_user` (to avoid editing the large `tb_user` model and to keep the feature self-contained). Queries join by `user_id` explicitly. If Prisma requires the back-relation, add `tb_user_tb_platform_role tb_user_tb_platform_role[]` to `tb_user` and the matching `tb_user @relation(fields:[user_id]...)` here — but prefer the relation-less form first.

- [ ] **Step 2: Create + apply the migration**

Run:
```bash
cd packages/prisma-shared-schema-platform
bun run db:migrate
```
When prompted for a name, enter: `platform_rbac`.
Expected: a new folder `prisma/migrations/<timestamp>_platform_rbac/` with `migration.sql` creating the 4 tables; command exits 0.

- [ ] **Step 3: Regenerate the client + rebuild the package**

Run:
```bash
bun run db:generate
cd ../../
bun run build:package
```
Expected: both exit 0; the generated client now exposes `tb_platform_permission`, `tb_platform_role`, `tb_platform_role_tb_permission`, `tb_user_tb_platform_role`.

- [ ] **Step 4: Verify the models compile (type check)**

Run from repo root:
```bash
bun run check-types
```
Expected: exits 0 (no type errors introduced).

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma packages/prisma-shared-schema-platform/prisma/migrations
git commit -m "feat(platform-rbac): add tb_platform_* prisma models + migration"
```

---

## Task 2: Seed the platform permission catalog

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/package.json` (scripts)

- [ ] **Step 1: Write the seed script**

Create `prisma/seed.platform-permission.ts`:

```typescript
import { PrismaClient } from "@repo/prisma-shared-schema-platform";
import * as dotenv from "dotenv";

dotenv.config();

const prisma_platform = new PrismaClient({
  datasources: { db: { url: process.env.SYSTEM_DIRECT_URL } },
});

type PlatformPermissionSeed = { resource: string; action: string; description: string };

// 8 resources × actions. Keys are "<resource>.<action>".
const PLATFORM_PERMISSIONS: PlatformPermissionSeed[] = [
  // cluster (covers business units)
  { resource: "cluster", action: "read", description: "View clusters and their business units" },
  { resource: "cluster", action: "create", description: "Create clusters and business units" },
  { resource: "cluster", action: "update", description: "Update clusters and business units" },
  { resource: "cluster", action: "delete", description: "Delete clusters and business units" },
  // user
  { resource: "user", action: "read", description: "View platform users" },
  { resource: "user", action: "create", description: "Create platform users" },
  { resource: "user", action: "update", description: "Update platform users" },
  { resource: "user", action: "delete", description: "Delete platform users" },
  { resource: "user", action: "manage_roles", description: "Assign or remove platform roles for users" },
  // report_template
  { resource: "report_template", action: "read", description: "View report templates" },
  { resource: "report_template", action: "create", description: "Create report templates" },
  { resource: "report_template", action: "update", description: "Update report templates" },
  { resource: "report_template", action: "delete", description: "Delete report templates" },
  // print_template_mapping
  { resource: "print_template_mapping", action: "read", description: "View print template mappings" },
  { resource: "print_template_mapping", action: "create", description: "Create print template mappings" },
  { resource: "print_template_mapping", action: "update", description: "Update print template mappings" },
  { resource: "print_template_mapping", action: "delete", description: "Delete print template mappings" },
  // application
  { resource: "application", action: "read", description: "View applications" },
  { resource: "application", action: "create", description: "Create applications" },
  { resource: "application", action: "update", description: "Update applications" },
  { resource: "application", action: "delete", description: "Delete applications" },
  // news
  { resource: "news", action: "read", description: "View news" },
  { resource: "news", action: "create", description: "Create news" },
  { resource: "news", action: "update", description: "Update news" },
  { resource: "news", action: "delete", description: "Delete news" },
  // broadcast
  { resource: "broadcast", action: "read", description: "View broadcast notifications" },
  { resource: "broadcast", action: "send", description: "Send broadcast notifications" },
  // role (the platform RBAC itself)
  { resource: "role", action: "read", description: "View platform roles and permission catalog" },
  { resource: "role", action: "create", description: "Create platform roles" },
  { resource: "role", action: "update", description: "Update platform roles" },
  { resource: "role", action: "delete", description: "Delete platform roles" },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const p of PLATFORM_PERMISSIONS) {
    const existing = await prisma_platform.tb_platform_permission.findFirst({
      where: { resource: p.resource, action: p.action, deleted_at: null },
    });
    if (existing) {
      await prisma_platform.tb_platform_permission.update({
        where: { id: existing.id },
        data: { description: p.description, updated_at: new Date() },
      });
      updated++;
    } else {
      await prisma_platform.tb_platform_permission.create({
        data: { resource: p.resource, action: p.action, description: p.description },
      });
      created++;
    }
  }
  console.log(`Platform permissions seeded. created=${created} updated=${updated} total=${PLATFORM_PERMISSIONS.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma_platform.$disconnect(); });
```

- [ ] **Step 2: Add the seed script to package.json**

In `packages/prisma-shared-schema-platform/package.json`, add to `"scripts"`:
```json
"db:seed.platform-permission": "ts-node -r tsconfig-paths/register prisma/seed.platform-permission.ts",
```

- [ ] **Step 3: Run the seed**

```bash
cd packages/prisma-shared-schema-platform
bun run db:seed.platform-permission
```
Expected: prints `Platform permissions seeded. created=31 updated=0 total=31` on first run (idempotent: re-running prints `created=0 updated=31`).

- [ ] **Step 4: Verify the rows**

```bash
bun run db:seed.platform-permission   # second run must not error and must show updated=31
```
Expected: exit 0, `created=0 updated=31`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.platform-permission.ts package.json
git commit -m "feat(platform-rbac): seed platform permission catalog"
```

---

## Task 3: Seed the 5 default platform roles

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.ts`
- Modify: `packages/prisma-shared-schema-platform/prisma/package.json` (scripts)

- [ ] **Step 1: Write the seed script**

Create `prisma/seed.platform-role-permission.ts`:

```typescript
import { PrismaClient } from "@repo/prisma-shared-schema-platform";
import * as dotenv from "dotenv";

dotenv.config();

const prisma_platform = new PrismaClient({
  datasources: { db: { url: process.env.SYSTEM_DIRECT_URL } },
});

// Permission keys are "<resource>.<action>". "*" expands to every action seeded for that resource.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"], // all permissions
  platform_admin: [
    "cluster.*", "user.*", "report_template.*", "print_template_mapping.*",
    "application.*", "news.*", "broadcast.*", "role.*",
  ],
  support_manager: [
    "cluster.read", "user.read", "user.update", "user.manage_roles",
    "report_template.read", "print_template_mapping.read", "application.read",
    "news.read", "news.create", "news.update", "broadcast.read", "broadcast.send", "role.read",
  ],
  support_staff: [
    "cluster.read", "user.read", "report_template.read",
    "print_template_mapping.read", "application.read", "news.read", "broadcast.read", "role.read",
  ],
  security_officer: [
    "user.read", "user.manage_roles", "role.read", "role.create", "role.update", "role.delete", "cluster.read",
  ],
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Full access to every platform capability",
  platform_admin: "Manage all platform resources",
  support_manager: "Support operations with limited write access",
  support_staff: "Read-only support access",
  security_officer: "Manage roles and user role assignments",
};

async function main() {
  const allPerms = await prisma_platform.tb_platform_permission.findMany({ where: { deleted_at: null } });
  const byKey = new Map<string, string>(); // "resource.action" -> permission id
  const byResource = new Map<string, string[]>(); // resource -> [keys]
  for (const p of allPerms) {
    const key = `${p.resource}.${p.action}`;
    byKey.set(key, p.id);
    byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), key]);
  }

  const expand = (patterns: string[]): string[] => {
    const out = new Set<string>();
    for (const pat of patterns) {
      if (pat === "*") { for (const k of byKey.keys()) out.add(k); continue; }
      if (pat.endsWith(".*")) {
        const res = pat.slice(0, -2);
        for (const k of byResource.get(res) ?? []) out.add(k);
        continue;
      }
      out.add(pat);
    }
    return [...out];
  };

  let rolesCreated = 0, rolesUpdated = 0, linksCreated = 0;
  for (const [roleName, patterns] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await prisma_platform.tb_platform_role.findFirst({ where: { name: roleName, deleted_at: null } });
    if (role) {
      role = await prisma_platform.tb_platform_role.update({
        where: { id: role.id }, data: { description: ROLE_DESCRIPTIONS[roleName], is_active: true },
      });
      rolesUpdated++;
    } else {
      role = await prisma_platform.tb_platform_role.create({
        data: { name: roleName, description: ROLE_DESCRIPTIONS[roleName], is_active: true },
      });
      rolesCreated++;
    }

    for (const key of expand(patterns)) {
      const permId = byKey.get(key);
      if (!permId) { console.warn(`Permission not found: ${key}`); continue; }
      const link = await prisma_platform.tb_platform_role_tb_permission.findFirst({
        where: { platform_role_id: role.id, platform_permission_id: permId, deleted_at: null },
      });
      if (link) continue;
      await prisma_platform.tb_platform_role_tb_permission.create({
        data: { platform_role_id: role.id, platform_permission_id: permId, is_active: true },
      });
      linksCreated++;
    }
  }
  console.log(`Platform roles seeded. rolesCreated=${rolesCreated} rolesUpdated=${rolesUpdated} linksCreated=${linksCreated}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma_platform.$disconnect(); });
```

- [ ] **Step 2: Add the seed script to package.json**

Add to `"scripts"`:
```json
"db:seed.platform-role-permission": "ts-node -r tsconfig-paths/register prisma/seed.platform-role-permission.ts",
```

- [ ] **Step 3: Run the seed (after permission seed)**

```bash
cd packages/prisma-shared-schema-platform
bun run db:seed.platform-role-permission
```
Expected: `rolesCreated=5 rolesUpdated=0 linksCreated=<N>` first run; re-run shows `rolesCreated=0 rolesUpdated=5 linksCreated=0`. No "Permission not found" warnings.

- [ ] **Step 4: Verify idempotency**

Re-run the command; expected exit 0 and `linksCreated=0`.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.platform-role-permission.ts package.json
git commit -m "feat(platform-rbac): seed 5 default platform roles"
```

---

## Task 4: micro-business — platform permission catalog (read-only) module

**Files:**
- Create: `apps/micro-business/src/authen/platform_permission/platform_permission.service.ts`
- Create: `apps/micro-business/src/authen/platform_permission/platform_permission.controller.ts`
- Create: `apps/micro-business/src/authen/platform_permission/platform_permission.module.ts`
- Create test: `apps/micro-business/src/authen/platform_permission/platform_permission.service.spec.ts`
- Modify: `apps/micro-business/src/app.module.ts` (register module)

> Use `apps/micro-business/src/authen/permission/` as the structural template (same imports, base classes, `Result`, `@TryCatch`, `BackendLogger`). Replace `tb_permission` with `tb_platform_permission`.

- [ ] **Step 1: Write the service**

Create `platform_permission.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient as PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { Result } from '@/common';
import { TryCatch } from '@/common'; // use the same import path the existing permission.service.ts uses
import { BackendLogger } from 'src/common/helpers/backend.logger';

@Injectable()
export class PlatformPermissionService {
  private readonly logger = new BackendLogger(PlatformPermissionService.name);

  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM,
  ) {}

  @TryCatch
  async findAll(): Promise<Result<unknown>> {
    const permissions = await this.prismaSystem.tb_platform_permission.findMany({
      where: { deleted_at: null },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: { id: true, resource: true, action: true, description: true },
    });
    // Surface the catalog with a derived "key" so the frontend can use "resource.action" directly.
    const data = permissions.map((p) => ({ ...p, key: `${p.resource}.${p.action}` }));
    return Result.ok({ data, paginate: { total: data.length, page: 1, perpage: data.length, pages: 1 } });
  }
}
```

> Confirm the exact import path for `TryCatch`, `Result`, and `PrismaClient_SYSTEM` token by opening `apps/micro-business/src/authen/permission/permission.service.ts` and copying its imports verbatim. The token name is `'PRISMA_SYSTEM'` (per `role.service.ts`).

- [ ] **Step 2: Write the controller**

Create `platform_permission.controller.ts`:

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformPermissionService } from './platform_permission.service';
import { BaseMicroserviceController } from '@/common'; // match the import used by role.controller.ts
import type { MicroservicePayload } from '@/common';

@Controller()
export class PlatformPermissionController extends BaseMicroserviceController {
  constructor(private readonly service: PlatformPermissionService) { super(); }

  @MessagePattern({ cmd: 'platform-permissions.find-all', service: 'platform-permissions' })
  async findAll(@Payload() _payload: MicroservicePayload) {
    const result = await this.service.findAll();
    return this.handlePaginatedResult(result);
  }
}
```

> Open `apps/micro-business/src/authen/role/role.controller.ts` and copy the exact base-class import path and the `handlePaginatedResult` usage.

- [ ] **Step 3: Write the module**

Create `platform_permission.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PlatformPermissionService } from './platform_permission.service';
import { PlatformPermissionController } from './platform_permission.controller';

@Module({
  controllers: [PlatformPermissionController],
  providers: [PlatformPermissionService],
  exports: [PlatformPermissionService],
})
export class PlatformPermissionModule {}
```

> If `role.module.ts` provides `PRISMA_SYSTEM` locally (rather than via a global module), copy that provider block into this module too. Check `role.module.ts` first.

- [ ] **Step 4: Register in app.module.ts**

In `apps/micro-business/src/app.module.ts`, add `PlatformPermissionModule` to the `imports` array (next to the existing authen modules).

- [ ] **Step 5: Write the smoke test**

Create `platform_permission.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformPermissionService } from './platform_permission.service';

describe('PlatformPermissionService', () => {
  let service: PlatformPermissionService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformPermissionService,
        { provide: 'PRISMA_SYSTEM', useValue: { tb_platform_permission: { findMany: async () => [] } } },
      ],
    }).compile();
    service = module.get(PlatformPermissionService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('returns an empty catalog when no permissions exist', async () => {
    const result: any = await service.findAll();
    expect(result.value.data).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the test**

```bash
cd apps/micro-business
bun run test -- platform_permission
```
Expected: 2 passing tests. (If `Result.ok` wraps under a different property than `.value`, adjust the assertion to match `Result`'s actual shape — check `@/common` Result.)

- [ ] **Step 7: Commit**

```bash
git add apps/micro-business/src/authen/platform_permission apps/micro-business/src/app.module.ts
git commit -m "feat(platform-rbac): micro-business platform permission catalog handler"
```

---

## Task 5: micro-business — platform role CRUD module

**Files:**
- Create: `apps/micro-business/src/authen/platform_role/platform_role.service.ts`
- Create: `apps/micro-business/src/authen/platform_role/platform_role.controller.ts`
- Create: `apps/micro-business/src/authen/platform_role/platform_role.module.ts`
- Create: `apps/micro-business/src/authen/platform_role/interface/platform_role.interface.ts`
- Create test: `apps/micro-business/src/authen/platform_role/platform_role.service.spec.ts`
- Modify: `apps/micro-business/src/app.module.ts`

> Template: `apps/micro-business/src/authen/role/role.service.ts` + `role.controller.ts` + `role.module.ts`. Differences: table `tb_platform_role`; no `business_unit_id`; permissions live in `tb_platform_role_tb_permission` keyed by `platform_permission_id`; create/update accept `permissions: { add: string[]; remove?: string[] }` where the array entries are **permission keys** (`"resource.action"`), which the service resolves to permission ids.

- [ ] **Step 1: Define the interface**

Create `interface/platform_role.interface.ts`:

```typescript
export interface IPlatformRoleCreate {
  name: string;
  description?: string;
  is_active?: boolean;
  permissions?: { add: string[] }; // permission keys "resource.action"
}

export interface IPlatformRoleUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
  permissions?: { add?: string[]; remove?: string[] };
}
```

- [ ] **Step 2: Write the service**

Create `platform_role.service.ts`. Mirror `role.service.ts` structure (constructor injecting `@Inject('PRISMA_SYSTEM')`, `QueryParams`, `@TryCatch`, `Result`). Implement:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient as PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { Result, ErrorCode, TryCatch, QueryParams } from '@/common'; // copy exact paths from role.service.ts
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { IPlatformRoleCreate, IPlatformRoleUpdate } from './interface/platform_role.interface';

@Injectable()
export class PlatformRoleService {
  private readonly logger = new BackendLogger(PlatformRoleService.name);
  constructor(@Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM) {}

  // Resolve "resource.action" keys -> permission ids (active only)
  private async resolveKeys(keys: string[]): Promise<Map<string, string>> {
    if (keys.length === 0) return new Map();
    const filters = keys.map((k) => {
      const idx = k.indexOf('.');
      return { resource: k.slice(0, idx), action: k.slice(idx + 1) };
    });
    const perms = await this.prismaSystem.tb_platform_permission.findMany({
      where: { deleted_at: null, OR: filters },
      select: { id: true, resource: true, action: true },
    });
    return new Map(perms.map((p) => [`${p.resource}.${p.action}`, p.id]));
  }

  @TryCatch
  async findAll(paginate: any): Promise<Result<unknown>> {
    const q = new QueryParams(
      paginate?.page ?? 1, paginate?.perpage ?? 100, paginate?.search ?? '',
      paginate?.searchFields ?? [], ['name', 'description'],
      paginate?.filter ?? {}, paginate?.sort ?? [], paginate?.advance ?? null,
    );
    const roles = await this.prismaSystem.tb_platform_role.findMany({
      ...q.findMany(),
      select: {
        id: true, name: true, description: true, is_active: true,
        created_at: true, updated_at: true,
        _count: { select: { tb_platform_role_tb_permission: { where: { deleted_at: null } } } },
      },
    });
    const total = await this.prismaSystem.tb_platform_role.count({ where: { ...q.where() } });
    const data = roles.map((r) => ({
      id: r.id, name: r.name, description: r.description, is_active: r.is_active,
      created_at: r.created_at, updated_at: r.updated_at,
      permission_count: r._count.tb_platform_role_tb_permission,
    }));
    return Result.ok({
      data,
      paginate: { total, page: q.page, perpage: q.perpage, pages: total === 0 ? 1 : Math.ceil(total / q.perpage) },
    });
  }

  @TryCatch
  async findOne(id: string): Promise<Result<unknown>> {
    const role = await this.prismaSystem.tb_platform_role.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true, name: true, description: true, is_active: true,
        tb_platform_role_tb_permission: {
          where: { deleted_at: null },
          select: { tb_platform_permission: { select: { resource: true, action: true } } },
        },
      },
    });
    if (!role) return Result.error('Role not found', ErrorCode.NOT_FOUND);
    const permissions = role.tb_platform_role_tb_permission
      .map((l) => `${l.tb_platform_permission.resource}.${l.tb_platform_permission.action}`);
    return Result.ok({
      id: role.id, name: role.name, description: role.description, is_active: role.is_active, permissions,
    });
  }

  @TryCatch
  async create(data: IPlatformRoleCreate): Promise<Result<unknown>> {
    const existing = await this.prismaSystem.tb_platform_role.findFirst({
      where: { name: data.name, deleted_at: null },
    });
    if (existing) return Result.error('Role with this name already exists', ErrorCode.ALREADY_EXISTS);

    const role = await this.prismaSystem.tb_platform_role.create({
      data: { name: data.name, description: data.description, is_active: data.is_active ?? true },
    });
    const addKeys = data.permissions?.add ?? [];
    const resolved = await this.resolveKeys(addKeys);
    for (const key of addKeys) {
      const permId = resolved.get(key);
      if (!permId) return Result.error(`Unknown permission: ${key}`, ErrorCode.BAD_REQUEST);
      await this.prismaSystem.tb_platform_role_tb_permission.create({
        data: { platform_role_id: role.id, platform_permission_id: permId, is_active: true },
      });
    }
    return Result.ok({ id: role.id });
  }

  @TryCatch
  async update(id: string, data: IPlatformRoleUpdate): Promise<Result<unknown>> {
    const role = await this.prismaSystem.tb_platform_role.findFirst({ where: { id, deleted_at: null } });
    if (!role) return Result.error('Role not found', ErrorCode.NOT_FOUND);

    await this.prismaSystem.tb_platform_role.update({
      where: { id },
      data: {
        name: data.name ?? role.name,
        description: data.description ?? role.description,
        is_active: data.is_active ?? role.is_active,
        updated_at: new Date(),
      },
    });

    const addKeys = data.permissions?.add ?? [];
    const removeKeys = data.permissions?.remove ?? [];
    const resolved = await this.resolveKeys([...addKeys, ...removeKeys]);

    for (const key of addKeys) {
      const permId = resolved.get(key);
      if (!permId) return Result.error(`Unknown permission: ${key}`, ErrorCode.BAD_REQUEST);
      const link = await this.prismaSystem.tb_platform_role_tb_permission.findFirst({
        where: { platform_role_id: id, platform_permission_id: permId, deleted_at: null },
      });
      if (!link) {
        await this.prismaSystem.tb_platform_role_tb_permission.create({
          data: { platform_role_id: id, platform_permission_id: permId, is_active: true },
        });
      }
    }
    for (const key of removeKeys) {
      const permId = resolved.get(key);
      if (!permId) continue;
      await this.prismaSystem.tb_platform_role_tb_permission.updateMany({
        where: { platform_role_id: id, platform_permission_id: permId, deleted_at: null },
        data: { deleted_at: new Date() },
      });
    }
    return Result.ok({ id });
  }

  @TryCatch
  async delete(id: string): Promise<Result<unknown>> {
    const role = await this.prismaSystem.tb_platform_role.findFirst({ where: { id, deleted_at: null } });
    if (!role) return Result.error('Role not found', ErrorCode.NOT_FOUND);
    await this.prismaSystem.tb_platform_role.update({ where: { id }, data: { deleted_at: new Date() } });
    return Result.ok({ id });
  }
}
```

> Verify `ErrorCode` member names (`NOT_FOUND`, `ALREADY_EXISTS`, `BAD_REQUEST`) against the enum in `@/common` — `role.service.ts` uses `ErrorCode.ALREADY_EXISTS`. Adjust to the real names if different.

- [ ] **Step 3: Write the controller**

Create `platform_role.controller.ts` mirroring `role.controller.ts`. Handlers (note `cmd` namespace `platform-roles`):

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformRoleService } from './platform_role.service';
import { BaseMicroserviceController } from '@/common';
import type { MicroservicePayload } from '@/common';

@Controller()
export class PlatformRoleController extends BaseMicroserviceController {
  constructor(private readonly service: PlatformRoleService) { super(); }

  @MessagePattern({ cmd: 'platform-roles.find-all', service: 'platform-roles' })
  async findAll(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.findAll(payload.paginate));
    return this.handlePaginatedResult(result);
  }

  @MessagePattern({ cmd: 'platform-roles.find-one', service: 'platform-roles' })
  async findOne(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.findOne(payload.id));
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'platform-roles.create', service: 'platform-roles' })
  async create(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.create(payload.data));
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'platform-roles.update', service: 'platform-roles' })
  async update(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.update(payload.id, payload.data));
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'platform-roles.delete', service: 'platform-roles' })
  async delete(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.delete(payload.id));
    return this.handleResult(result);
  }
}
```

> Copy the `runWithAuditContext` import line from `role.controller.ts` verbatim.

- [ ] **Step 4: Write the module + register**

Create `platform_role.module.ts` (same shape as Task 4 Step 3, with `PlatformRole*`). Add `PlatformRoleModule` to `apps/micro-business/src/app.module.ts` imports.

- [ ] **Step 5: Write the smoke test**

Create `platform_role.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformRoleService } from './platform_role.service';

describe('PlatformRoleService', () => {
  let service: PlatformRoleService;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformRoleService,
        { provide: 'PRISMA_SYSTEM', useValue: {} },
      ],
    }).compile();
    service = module.get(PlatformRoleService);
  });
  it('should be defined', () => { expect(service).toBeDefined(); });
});
```

- [ ] **Step 6: Run tests + typecheck**

```bash
cd apps/micro-business && bun run test -- platform_role
cd ../../ && bun run check-types
```
Expected: test passes; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/micro-business/src/authen/platform_role apps/micro-business/src/app.module.ts
git commit -m "feat(platform-rbac): micro-business platform role CRUD handler"
```

---

## Task 6: micro-business — user↔platform-role assignment module

**Files:**
- Create: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.ts`
- Create: `apps/micro-business/src/authen/user_platform_role/user_platform_role.controller.ts`
- Create: `apps/micro-business/src/authen/user_platform_role/user_platform_role.module.ts`
- Create test: `apps/micro-business/src/authen/user_platform_role/user_platform_role.service.spec.ts`
- Modify: `apps/micro-business/src/app.module.ts`

> Template: `apps/micro-business/src/authen/user_application_role/`. Assignment carries scope via `cluster_id` (null = platform).

- [ ] **Step 1: Write the service**

Create `user_platform_role.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient as PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';
import { Result, ErrorCode, TryCatch } from '@/common';

interface AssignInput { role_id: string; scope: { type: 'platform' } | { type: 'cluster'; cluster_id: string }; }

@Injectable()
export class UserPlatformRoleService {
  constructor(@Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM) {}

  @TryCatch
  async list(userId: string): Promise<Result<unknown>> {
    const rows = await this.prismaSystem.tb_user_tb_platform_role.findMany({
      where: { user_id: userId, deleted_at: null },
      select: {
        id: true, user_id: true, platform_role_id: true, cluster_id: true,
        tb_platform_role: { select: { name: true } },
      },
    });
    const data = rows.map((r) => ({
      id: r.id, user_id: r.user_id, role_id: r.platform_role_id, role_name: r.tb_platform_role?.name,
      scope: r.cluster_id ? { type: 'cluster', cluster_id: r.cluster_id } : { type: 'platform' },
    }));
    return Result.ok({ data });
  }

  @TryCatch
  async assign(userId: string, input: AssignInput): Promise<Result<unknown>> {
    const role = await this.prismaSystem.tb_platform_role.findFirst({
      where: { id: input.role_id, deleted_at: null },
    });
    if (!role) return Result.error('Role not found', ErrorCode.NOT_FOUND);
    const clusterId = input.scope.type === 'cluster' ? input.scope.cluster_id : null;

    const existing = await this.prismaSystem.tb_user_tb_platform_role.findFirst({
      where: { user_id: userId, platform_role_id: input.role_id, cluster_id: clusterId, deleted_at: null },
    });
    if (existing) return Result.error('Assignment already exists', ErrorCode.ALREADY_EXISTS);

    const created = await this.prismaSystem.tb_user_tb_platform_role.create({
      data: { user_id: userId, platform_role_id: input.role_id, cluster_id: clusterId },
    });
    return Result.ok({ id: created.id });
  }

  @TryCatch
  async remove(userId: string, assignmentId: string): Promise<Result<unknown>> {
    const row = await this.prismaSystem.tb_user_tb_platform_role.findFirst({
      where: { id: assignmentId, user_id: userId, deleted_at: null },
    });
    if (!row) return Result.error('Assignment not found', ErrorCode.NOT_FOUND);
    await this.prismaSystem.tb_user_tb_platform_role.update({
      where: { id: assignmentId }, data: { deleted_at: new Date() },
    });
    return Result.ok({ id: assignmentId });
  }
}
```

- [ ] **Step 2: Write the controller**

Create `user_platform_role.controller.ts`:

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UserPlatformRoleService } from './user_platform_role.service';
import { BaseMicroserviceController } from '@/common';
import type { MicroservicePayload } from '@/common';

@Controller()
export class UserPlatformRoleController extends BaseMicroserviceController {
  constructor(private readonly service: UserPlatformRoleService) { super(); }

  @MessagePattern({ cmd: 'user-platform-roles.list', service: 'user-platform-roles' })
  async list(@Payload() payload: MicroservicePayload) {
    const result = await this.service.list(payload.user_id);
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'user-platform-roles.assign', service: 'user-platform-roles' })
  async assign(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.assign(payload.user_id, payload.data));
    return this.handleResult(result);
  }

  @MessagePattern({ cmd: 'user-platform-roles.remove', service: 'user-platform-roles' })
  async remove(@Payload() payload: MicroservicePayload) {
    const ctx = this.createAuditContext(payload);
    const result = await runWithAuditContext(ctx, () => this.service.remove(payload.user_id, payload.assignment_id));
    return this.handleResult(result);
  }
}
```

> `payload.user_id` here is the **target** user being assigned (passed explicitly from the gateway), not the caller. The caller id for audit comes from the audit context the gateway forwards.

- [ ] **Step 3: Module + register + smoke test**

Create `user_platform_role.module.ts` (same shape), register in `app.module.ts`, and add a `service.spec.ts` smoke test asserting `toBeDefined()` (mirror Task 5 Step 5).

- [ ] **Step 4: Run test + typecheck**

```bash
cd apps/micro-business && bun run test -- user_platform_role
cd ../../ && bun run check-types
```
Expected: pass; exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/user_platform_role apps/micro-business/src/app.module.ts
git commit -m "feat(platform-rbac): micro-business user-platform-role assignment handler"
```

---

## Task 7: micro-business — effective-permissions resolver

**Files:**
- Create: `apps/micro-business/src/authen/platform_permission/effective_permissions.service.ts`
- Create test: `apps/micro-business/src/authen/platform_permission/effective_permissions.service.spec.ts`
- Modify: `apps/micro-business/src/authen/platform_permission/platform_permission.module.ts` (provide + export the resolver)

This service resolves a user's platform-role assignments into the scope-grouped shape the spec defines:
```ts
{ platform: string[]; clusters: Record<string, string[]> }
```

- [ ] **Step 1: Write the resolver**

Create `effective_permissions.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient as PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';

export interface EffectivePermissions { platform: string[]; clusters: Record<string, string[]>; }

@Injectable()
export class EffectivePermissionsService {
  constructor(@Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM) {}

  async resolve(userId: string): Promise<EffectivePermissions> {
    const assignments = await this.prismaSystem.tb_user_tb_platform_role.findMany({
      where: { user_id: userId, deleted_at: null },
      select: {
        cluster_id: true,
        tb_platform_role: {
          select: {
            is_active: true,
            tb_platform_role_tb_permission: {
              where: { deleted_at: null, is_active: true },
              select: { tb_platform_permission: { select: { resource: true, action: true, deleted_at: true } } },
            },
          },
        },
      },
    });

    const platform = new Set<string>();
    const clusters: Record<string, Set<string>> = {};

    for (const a of assignments) {
      if (a.tb_platform_role?.is_active === false) continue;
      const keys = (a.tb_platform_role?.tb_platform_role_tb_permission ?? [])
        .filter((l) => l.tb_platform_permission && l.tb_platform_permission.deleted_at === null)
        .map((l) => `${l.tb_platform_permission.resource}.${l.tb_platform_permission.action}`);
      if (a.cluster_id === null) {
        keys.forEach((k) => platform.add(k));
      } else {
        clusters[a.cluster_id] = clusters[a.cluster_id] ?? new Set<string>();
        keys.forEach((k) => clusters[a.cluster_id]!.add(k));
      }
    }

    return {
      platform: [...platform].sort(),
      clusters: Object.fromEntries(Object.entries(clusters).map(([k, v]) => [k, [...v].sort()])),
    };
  }
}
```

- [ ] **Step 2: Provide + export from the module**

In `platform_permission.module.ts`, add `EffectivePermissionsService` to `providers` and `exports` so other modules (auth) can inject it.

- [ ] **Step 3: Write the unit test (real logic, mocked Prisma)**

Create `effective_permissions.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EffectivePermissionsService } from './effective_permissions.service';

const fakePrisma = (rows: any[]) => ({
  tb_user_tb_platform_role: { findMany: async () => rows },
});

describe('EffectivePermissionsService', () => {
  async function build(rows: any[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectivePermissionsService,
        { provide: 'PRISMA_SYSTEM', useValue: fakePrisma(rows) },
      ],
    }).compile();
    return module.get(EffectivePermissionsService);
  }

  it('groups platform-scoped permissions under platform', async () => {
    const svc = await build([
      { cluster_id: null, tb_platform_role: { is_active: true, tb_platform_role_tb_permission: [
        { tb_platform_permission: { resource: 'user', action: 'read', deleted_at: null } },
      ] } },
    ]);
    const res = await svc.resolve('u1');
    expect(res.platform).toEqual(['user.read']);
    expect(res.clusters).toEqual({});
  });

  it('groups cluster-scoped permissions under that cluster id', async () => {
    const svc = await build([
      { cluster_id: 'c1', tb_platform_role: { is_active: true, tb_platform_role_tb_permission: [
        { tb_platform_permission: { resource: 'cluster', action: 'update', deleted_at: null } },
      ] } },
    ]);
    const res = await svc.resolve('u1');
    expect(res.platform).toEqual([]);
    expect(res.clusters).toEqual({ c1: ['cluster.update'] });
  });

  it('skips inactive roles', async () => {
    const svc = await build([
      { cluster_id: null, tb_platform_role: { is_active: false, tb_platform_role_tb_permission: [
        { tb_platform_permission: { resource: 'user', action: 'delete', deleted_at: null } },
      ] } },
    ]);
    const res = await svc.resolve('u1');
    expect(res.platform).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the test**

```bash
cd apps/micro-business
bun run test -- effective_permissions
```
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/platform_permission
git commit -m "feat(platform-rbac): effective permissions resolver (scope-grouped)"
```

---

## Task 8: Gateway DTOs

**Files:**
- Create: `apps/backend-gateway/src/common/dto/platform-role/platform-role.create.dto.ts`
- Create: `apps/backend-gateway/src/common/dto/platform-role/platform-role.update.dto.ts`
- Create: `apps/backend-gateway/src/common/dto/platform-role/index.ts`
- Create: `apps/backend-gateway/src/common/dto/user-platform-role/user-platform-role.assign.dto.ts`
- Create: `apps/backend-gateway/src/common/dto/user-platform-role/index.ts`
- Modify: the `@/common` barrel that re-exports DTOs (find where `ApplicationRoleCreateDto` is exported and add the new ones alongside)

> Template: `application-role.create.dto.ts` / `application-role.update.dto.ts` (Zod + `createZodDto`). Difference: `name` (not `application_role_name`), and `permissions.add/remove` are **permission key strings** (`"resource.action"`), not UUIDs.

- [ ] **Step 1: Create the role DTOs**

`platform-role.create.dto.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const PlatformRoleCreateSchema = z.object({
  name: z.string({ required_error: 'Role name is required' }).openapi({ example: 'Regional Support' }),
  description: z.string().optional().openapi({ example: 'Read-only support for assigned clusters' }),
  is_active: z.boolean().optional().openapi({ example: true }),
  permissions: z.object({ add: z.array(z.string()) }).optional()
    .openapi({ example: { add: ['cluster.read', 'user.read'] }, description: 'Permission keys "resource.action"' }),
});
export type IPlatformRoleCreate = z.infer<typeof PlatformRoleCreateSchema>;
export class PlatformRoleCreateDto extends createZodDto(PlatformRoleCreateSchema) {}
```

`platform-role.update.dto.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const PlatformRoleUpdateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  permissions: z.object({
    add: z.array(z.string()).optional(),
    remove: z.array(z.string()).optional(),
  }).optional().openapi({ example: { add: ['cluster.update'], remove: ['cluster.delete'] } }),
});
export type IPlatformRoleUpdate = z.infer<typeof PlatformRoleUpdateSchema>;
export class PlatformRoleUpdateDto extends createZodDto(PlatformRoleUpdateSchema) {}
```

`index.ts`: re-export both.

- [ ] **Step 2: Create the assignment DTO**

`user-platform-role.assign.dto.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UserPlatformRoleAssignSchema = z.object({
  role_id: z.string().uuid(),
  scope: z.discriminatedUnion('type', [
    z.object({ type: z.literal('platform') }),
    z.object({ type: z.literal('cluster'), cluster_id: z.string().uuid() }),
  ]).openapi({ example: { type: 'cluster', cluster_id: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d' } }),
});
export type IUserPlatformRoleAssign = z.infer<typeof UserPlatformRoleAssignSchema>;
export class UserPlatformRoleAssignDto extends createZodDto(UserPlatformRoleAssignSchema) {}
```

`index.ts`: re-export.

- [ ] **Step 3: Wire into the `@/common` barrel**

Find the file that exports `ApplicationRoleCreateDto` (grep `apps/backend-gateway/src/common` for `application-role`) and add `export * from './dto/platform-role';` and `export * from './dto/user-platform-role';` in the same place/style.

- [ ] **Step 4: Typecheck**

```bash
cd apps/backend-gateway && bun run check-types || (cd ../../ && bun run check-types)
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/common/dto/platform-role apps/backend-gateway/src/common/dto/user-platform-role apps/backend-gateway/src/common
git commit -m "feat(platform-rbac): gateway DTOs for platform roles + assignment"
```

---

## Task 9: Gateway — platform-roles module (`/api-system/platform/roles`)

**Files:**
- Create: `apps/backend-gateway/src/platform/platform-roles/platform-roles.service.ts`
- Create: `apps/backend-gateway/src/platform/platform-roles/platform-roles.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform-roles/platform-roles.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts` (register module)

> Template: `apps/backend-gateway/src/platform/application-roles/` (controller + service + module) read in full earlier. Differences below.

- [ ] **Step 1: Write the service**

Create `platform-roles.service.ts` mirroring `application-roles.service.ts`, but with `cmd` namespace `platform-roles.*` and DTO types `PlatformRoleCreateDto`/`PlatformRoleUpdateDto`. Example for `findAll` and `create` (replicate `findOne/update/delete` the same way):

```typescript
import { Inject, HttpStatus, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { PlatformRoleCreateDto, PlatformRoleUpdateDto, Result, MicroserviceResponse } from '@/common';
import { httpStatusToErrorCode } from 'src/common/helpers/http-status-to-error-code';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

@Injectable()
export class PlatformRolesService {
  constructor(@Inject('BUSINESS_SERVICE') private readonly authService: ClientProxy) {}

  async findAll(version: string, paginate: unknown): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'platform-roles.find-all', service: 'platform-roles' },
      { version, paginate, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok({ data: response.data, paginate: response.paginate });
  }

  async findOne(id: string, version: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'platform-roles.find-one', service: 'platform-roles' },
      { id, version, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok(response.data);
  }

  async create(data: PlatformRoleCreateDto, version: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'platform-roles.create', service: 'platform-roles' },
      { data, version, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.CREATED && response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok(response.data);
  }

  async update(id: string, data: PlatformRoleUpdateDto, version: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'platform-roles.update', service: 'platform-roles' },
      { id, data, version, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok(response.data);
  }

  async delete(id: string, version: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'platform-roles.delete', service: 'platform-roles' },
      { id, version, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok(response.data);
  }
}
```

- [ ] **Step 2: Write the controller**

Create `platform-roles.controller.ts`. Copy `application-roles.controller.ts` structure (imports, `BaseHttpController`, `KeycloakGuard`, `@ApiHeaderRequiredXAppId`, `@EnrichAuditUsers`, `this.respond`). Changes: `@Controller('api-system/platform/roles')`, `@ApiTags('Platform: Roles')`, DTOs `PlatformRoleCreateDto/PlatformRoleUpdateDto`, pass `paginate` through `findAll` from `@Query()` (read pagination query params the same way other Management endpoints do — check how `application-roles` or a cluster controller reads `page/perpage/search/sort`; forward them as a `paginate` object to the service). Keep the `@UseGuards(new AppIdGuard('platform-role.<verb>'))` lines (these are the existing app-id-based guards; the new platform-permission guard is added in Task 14). Use these `operationId`s: `platformRbacRole_findAll/findOne/create/update/delete`.

- [ ] **Step 3: Write the module**

Create `platform-roles.module.ts` — identical to `application-roles.module.ts` but `PlatformRoles*` class names (keep the `BUSINESS_SERVICE` `ClientsModule.register` block exactly).

- [ ] **Step 4: Register + build**

Add `PlatformRolesModule` to the gateway `app.module.ts` imports. Then:
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run check-types
```
Expected: exit 0.

- [ ] **Step 5: Manual endpoint smoke test**

Boot the stack (`bun run dev`) and:
```bash
curl -s -X POST http://localhost:4000/api-system/platform/roles \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" -H "Content-Type: application/json" \
  -d '{"name":"Test Role","description":"tmp","is_active":true,"permissions":{"add":["cluster.read","user.read"]}}' | jq .
curl -s http://localhost:4000/api-system/platform/roles -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq '.data'
```
Expected: create returns `{ id }`; list includes "Test Role" with `permission_count: 2`. `GET /roles/:id` returns `permissions: ["cluster.read","user.read"]`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/platform/platform-roles apps/backend-gateway/src/app.module.ts
git commit -m "feat(platform-rbac): gateway platform-roles endpoints"
```

---

## Task 10: Gateway — platform-permissions module (`/api-system/platform/permissions`)

**Files:**
- Create: `apps/backend-gateway/src/platform/platform-permissions/platform-permissions.service.ts`
- Create: `apps/backend-gateway/src/platform/platform-permissions/platform-permissions.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform-permissions/platform-permissions.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`

> Read-only — only a `findAll`. Template: `application-permissions/` module.

- [ ] **Step 1: Service**

```typescript
import { Inject, HttpStatus, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { Result, MicroserviceResponse } from '@/common';
import { httpStatusToErrorCode } from 'src/common/helpers/http-status-to-error-code';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

@Injectable()
export class PlatformPermissionsService {
  constructor(@Inject('BUSINESS_SERVICE') private readonly authService: ClientProxy) {}
  async findAll(version: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'platform-permissions.find-all', service: 'platform-permissions' },
      { version, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok({ data: response.data, paginate: response.paginate });
  }
}
```

- [ ] **Step 2: Controller**

Create `platform-permissions.controller.ts`: `@Controller('api-system/platform/permissions')`, `@ApiTags('Platform: Permissions')`, a single `@Get()` `findAll` mirroring the application-permissions controller's `findAll` (guards, `@EnrichAuditUsers`, `this.respond`). `operationId: 'platformRbacPermission_findAll'`. `@UseGuards(new AppIdGuard('platform-permission.findAll'))`.

- [ ] **Step 3: Module + register**

Create `platform-permissions.module.ts` (BUSINESS_SERVICE register block). Add `PlatformPermissionsModule` to gateway `app.module.ts`.

- [ ] **Step 4: Typecheck + manual check**

```bash
bun run check-types
# after bun run dev:
curl -s http://localhost:4000/api-system/platform/permissions -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq '.data | length'
```
Expected: typecheck exit 0; the catalog returns 31 items, each with `key`, `resource`, `action`, `description`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/platform/platform-permissions apps/backend-gateway/src/app.module.ts
git commit -m "feat(platform-rbac): gateway platform-permissions catalog endpoint"
```

---

## Task 11: Gateway — user-platform-roles module (`/api-system/platform/users/:id/roles`)

**Files:**
- Create: `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.service.ts`
- Create: `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.controller.ts`
- Create: `apps/backend-gateway/src/platform/user-platform-roles/user-platform-roles.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts`

- [ ] **Step 1: Service**

```typescript
import { Inject, HttpStatus, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { UserPlatformRoleAssignDto, Result, MicroserviceResponse } from '@/common';
import { httpStatusToErrorCode } from 'src/common/helpers/http-status-to-error-code';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

@Injectable()
export class UserPlatformRolesService {
  constructor(@Inject('BUSINESS_SERVICE') private readonly authService: ClientProxy) {}

  async list(userId: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'user-platform-roles.list', service: 'user-platform-roles' },
      { user_id: userId, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    return Result.ok({ data: response.data });
  }

  async assign(userId: string, data: UserPlatformRoleAssignDto): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'user-platform-roles.assign', service: 'user-platform-roles' },
      { user_id: userId, data, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.CREATED && response.response.status !== HttpStatus.OK) {
      return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    }
    return Result.ok(response.data);
  }

  async remove(userId: string, assignmentId: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.authService.send(
      { cmd: 'user-platform-roles.remove', service: 'user-platform-roles' },
      { user_id: userId, assignment_id: assignmentId, ...getGatewayRequestContext() },
    );
    const response = await firstValueFrom(res);
    if (response.response.status !== HttpStatus.OK) return Result.error(response.response.message, httpStatusToErrorCode(response.response.status));
    return Result.ok(response.data);
  }
}
```

- [ ] **Step 2: Controller**

Create `user-platform-roles.controller.ts`: `@Controller('api-system/platform/users')`, `@ApiTags('Platform: User Roles')`, with:
- `@Get(':user_id/roles')` → `service.list(user_id)`
- `@Post(':user_id/roles')` `@Body() UserPlatformRoleAssignDto` → `service.assign(user_id, body)` (`@HttpCode(HttpStatus.CREATED)`)
- `@Delete(':user_id/roles/:assignment_id')` → `service.remove(user_id, assignment_id)`

Use `ParseUUIDPipe({ version: '4' })` on `user_id` and `assignment_id`, the same guard/`@ApiBearerAuth`/`@ApiHeaderRequiredXAppId`/`@EnrichAuditUsers`/`this.respond` conventions as the role controller. `@UseGuards(new AppIdGuard('user-platform-role.<verb>'))`.

- [ ] **Step 3: Module + register**

Create the module (BUSINESS_SERVICE register block), add to gateway `app.module.ts`.

- [ ] **Step 4: Typecheck + manual check**

```bash
bun run check-types
# after bun run dev — assign the seeded platform_admin role platform-wide to a known user id:
ROLE_ID=$(curl -s http://localhost:4000/api-system/platform/roles -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq -r '.data[] | select(.name=="platform_admin") | .id')
curl -s -X POST http://localhost:4000/api-system/platform/users/$USER_ID/roles \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" -H "Content-Type: application/json" \
  -d "{\"role_id\":\"$ROLE_ID\",\"scope\":{\"type\":\"platform\"}}" | jq .
curl -s http://localhost:4000/api-system/platform/users/$USER_ID/roles -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq '.data'
```
Expected: assign returns `{ id }`; list shows the assignment with `role_name: "platform_admin"` and `scope: { type: "platform" }`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/platform/user-platform-roles apps/backend-gateway/src/app.module.ts
git commit -m "feat(platform-rbac): gateway user-platform-role assignment endpoints"
```

---

## Task 12: Inject `effective_permissions` into the login response

**Files:**
- Modify: `apps/micro-business/src/authen/auth/auth.service.ts` (login method)
- Modify: `apps/micro-business/src/authen/auth/auth.module.ts` (import the providing module so the resolver injects)
- Modify: `apps/backend-gateway/src/auth/swagger/response.ts` (`LoginResponseDto`)

- [ ] **Step 1: Make the resolver available to auth**

In `apps/micro-business/src/authen/auth/auth.module.ts`, add `PlatformPermissionModule` to `imports` (it exports `EffectivePermissionsService` from Task 7 Step 2).

- [ ] **Step 2: Inject + call the resolver in login**

In `auth.service.ts`: add `private readonly effectivePermissions: EffectivePermissionsService` to the constructor (import from `../platform_permission/effective_permissions.service`). In the `login()` method, after the authenticated user id is known and just before returning the login payload, add:

```typescript
const effective_permissions = await this.effectivePermissions.resolve(userId);
// ...attach to the returned object:
return { ...existingLoginResult, effective_permissions };
```

> Open `auth.service.ts` first to find the exact local variable holding the user id (it may be `user.id`, `userId`, or from the token introspection result) and the exact return object. Attach `effective_permissions` onto that same returned object. If login resolves the user id asynchronously after token exchange, place the resolve call right after.

- [ ] **Step 3: Add the field to the Login DTO**

In `apps/backend-gateway/src/auth/swagger/response.ts`, add to `LoginResponseDto`:
```typescript
@ApiPropertyOptional({
  description: 'Resolved platform permissions, grouped by scope',
  example: { platform: ['user.read', 'role.update'], clusters: { '<clusterId>': ['cluster.update'] } },
})
effective_permissions?: { platform: string[]; clusters: Record<string, string[]> };
```

- [ ] **Step 4: Typecheck + manual check**

```bash
bun run check-types
# after bun run dev:
curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"<admin-user>","password":"<pwd>"}' | jq '.data.effective_permissions'
```
Expected: typecheck exit 0; login returns `effective_permissions` with the admin's `platform`/`clusters` keys populated (after Task 11 assigned them a role).

- [ ] **Step 5: Commit**

```bash
git add apps/micro-business/src/authen/auth apps/backend-gateway/src/auth/swagger/response.ts
git commit -m "feat(platform-rbac): include effective_permissions in login response"
```

---

## Task 13: Inject `effective_permissions` into the profile response

**Files:**
- Modify: `apps/backend-gateway/src/application/user/user.service.ts` (`getUserProfile`)
- Modify: `apps/backend-gateway/src/application/user/user.controller.ts` only if a response DTO/type needs the new field

The profile is assembled in the gateway `user.service.ts`. The gateway reaches micro-business; rather than duplicate the resolver in the gateway, request it over TCP.

- [ ] **Step 1: Add a resolver cmd handler in micro-business**

In `platform_permission.controller.ts` (Task 4), add:
```typescript
@MessagePattern({ cmd: 'platform-permissions.effective', service: 'platform-permissions' })
async effective(@Payload() payload: MicroservicePayload) {
  const data = await this.effectivePermissions.resolve(payload.user_id);
  return this.handleResult(Result.ok(data));
}
```
Inject `EffectivePermissionsService` into `PlatformPermissionController`'s constructor and ensure it's provided by `platform_permission.module.ts` (done in Task 7 Step 2). Import `Result` as used elsewhere in that file.

- [ ] **Step 2: Call it from the gateway profile service**

In `user.service.ts` `getUserProfile(id)`, after the existing BU-permission enrichment (around the `permissionService.getUserBusinessUnitPermissions(id)` call), add a TCP call via the existing `BUSINESS_SERVICE` client (the service already injects a `ClientProxy` for micro-business — reuse it; if not, add `@Inject('BUSINESS_SERVICE')`):

```typescript
const effRes = await firstValueFrom(this.authService.send(
  { cmd: 'platform-permissions.effective', service: 'platform-permissions' },
  { user_id: id, ...getGatewayRequestContext() },
));
const effective_permissions = effRes?.response?.status === HttpStatus.OK
  ? effRes.data
  : { platform: [], clusters: {} };
// attach to the assembled profile object:
profile.effective_permissions = effective_permissions;
```

> Match the existing variable name for the assembled profile object and the existing ClientProxy injection token in `user.service.ts`. If the profile object is strongly typed, extend that type with `effective_permissions?: { platform: string[]; clusters: Record<string, string[]> }`.

- [ ] **Step 3: Typecheck + manual check**

```bash
bun run check-types
# after bun run dev:
curl -s http://localhost:4000/api/user/profile -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq '.data.effective_permissions'
```
Expected: typecheck exit 0; profile returns the same `effective_permissions` shape as login.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-gateway/src/application/user apps/micro-business/src/authen/platform_permission
git commit -m "feat(platform-rbac): include effective_permissions in user profile"
```

---

## Task 14: Platform permission guard + decorator

**Files:**
- Create: `apps/backend-gateway/src/auth/decorators/platform-permission.decorator.ts`
- Create: `apps/backend-gateway/src/auth/services/platform-permission.service.ts`
- Create: `apps/backend-gateway/src/auth/guards/platform-permission.guard.ts`
- Create test: `apps/backend-gateway/src/auth/guards/platform-permission.guard.spec.ts`
- Modify: the platform controllers (Tasks 9–11) to add `@RequirePlatformPermission(...)` + `@UseGuards(PlatformPermissionGuard)`

> Template: `apps/backend-gateway/src/auth/decorators/permission.decorator.ts`, `auth/guards/permission.guard.ts`, `auth/services/permission.service.ts`. The platform guard checks against the caller's resolved platform `effective_permissions` (platform set, ignoring cluster scope for route-level gating — route gating is coarse; row/scope checks happen in the frontend + data filtering).

- [ ] **Step 1: Decorator**

```typescript
import { SetMetadata } from '@nestjs/common';
export const PLATFORM_PERMISSION_KEY = 'platform_permission';
// Single required permission key "resource.action"
export const RequirePlatformPermission = (permission: string) =>
  SetMetadata(PLATFORM_PERMISSION_KEY, permission);
```

- [ ] **Step 2: Service (pure check, unit-testable)**

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class PlatformPermissionService {
  // eff: the user's effective platform permissions; for route gating we accept if the
  // permission exists platform-wide OR in any cluster scope ("can do it somewhere").
  has(eff: { platform: string[]; clusters: Record<string, string[]> } | undefined, required: string): boolean {
    if (!eff) return false;
    if (eff.platform?.includes(required)) return true;
    return Object.values(eff.clusters ?? {}).some((keys) => keys.includes(required));
  }
}
```

- [ ] **Step 3: Guard**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_PERMISSION_KEY } from '../decorators/platform-permission.decorator';
import { PlatformPermissionService } from '../services/platform-permission.service';

@Injectable()
export class PlatformPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly perm: PlatformPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string>(PLATFORM_PERMISSION_KEY, context.getHandler());
    if (!required) return true; // no decorator → not gated by platform permission
    const request = context.switchToHttp().getRequest();
    // KeycloakGuard runs first and attaches the user; resolve their effective permissions.
    const eff = request.effective_permissions ?? request.user?.effective_permissions;
    if (this.perm.has(eff, required)) return true;
    throw new ForbiddenException(`Missing platform permission: ${required}`);
  }
}
```

> **Wiring note:** the guard needs the caller's `effective_permissions` on the request. Check how `KeycloakGuard` attaches user/permission context (the existing `permission.guard.ts` reads `x-bu-datas`). Mirror that: in `KeycloakGuard` (or a small interceptor registered before the platform guard), attach `request.effective_permissions` by calling the `platform-permissions.effective` TCP cmd with the token's user id, OR — simpler — decode it from the access token if the login already embedded it. Implement whichever matches the existing permission.guard.ts approach; document the chosen mechanism in the guard file header. If unsure, resolve via the same `BUSINESS_SERVICE` TCP call used in Task 13.

- [ ] **Step 4: Unit test the pure service**

Create `platform-permission.guard.spec.ts` (testing the service logic):
```typescript
import { PlatformPermissionService } from '../services/platform-permission.service';

describe('PlatformPermissionService', () => {
  const svc = new PlatformPermissionService();
  it('allows when permission is platform-wide', () => {
    expect(svc.has({ platform: ['role.read'], clusters: {} }, 'role.read')).toBe(true);
  });
  it('allows when permission exists in some cluster', () => {
    expect(svc.has({ platform: [], clusters: { c1: ['cluster.update'] } }, 'cluster.update')).toBe(true);
  });
  it('denies when missing', () => {
    expect(svc.has({ platform: [], clusters: {} }, 'role.delete')).toBe(false);
  });
  it('denies when eff is undefined', () => {
    expect(svc.has(undefined, 'role.read')).toBe(false);
  });
});
```

- [ ] **Step 5: Apply to platform controllers**

On each platform endpoint (Tasks 9–11), add `@UseGuards(PlatformPermissionGuard)` (after `KeycloakGuard`) and `@RequirePlatformPermission('<key>')`:
- roles: findAll/findOne → `role.read`; create → `role.create`; update → `role.update`; delete → `role.delete`
- permissions: findAll → `role.read`
- user roles: list → `user.read`; assign/remove → `user.manage_roles`

Register `PlatformPermissionGuard` + `PlatformPermissionService` as providers in each platform module (or a shared `PlatformAuthModule` imported by all three).

- [ ] **Step 6: Run test + typecheck + manual 403 check**

```bash
cd apps/backend-gateway && bun run test -- platform-permission
cd ../../ && bun run check-types
# after bun run dev, call with a token whose user lacks role.delete:
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:4000/api-system/platform/roles/<someId> \
  -H "Authorization: Bearer $LOW_PRIV_TOKEN" -H "x-app-id: $APP_ID"
```
Expected: 4 unit tests pass; typecheck exit 0; the DELETE returns `403`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend-gateway/src/auth apps/backend-gateway/src/platform
git commit -m "feat(platform-rbac): platform permission guard + decorator, applied to platform routes"
```

---

## Task 15: Scope-aware list filtering for platform resources

**Files:**
- Modify: the micro-cluster list services for scoped resources — start with `apps/micro-cluster/src/cluster/cluster/cluster.service.ts` and `apps/micro-cluster/src/cluster/user/user.service.ts`
- Create: `apps/micro-business/src/authen/platform_permission/scope.service.ts` (or a shared helper) exposing "which cluster ids may this user read for resource X"

The goal: a cluster-scoped user only sees rows within their cluster(s); a platform-scoped user sees everything. The caller's user id arrives in the microservice payload (audit context). Derive the allowed cluster set from `tb_user_tb_platform_role` (cluster_id values) + whether they hold the relevant `read` permission platform-wide.

- [ ] **Step 1: Write the scope helper**

Create `scope.service.ts`:
```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient as PrismaClient_SYSTEM } from '@repo/prisma-shared-schema-platform';

@Injectable()
export class PlatformScopeService {
  constructor(@Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaClient_SYSTEM) {}

  // Returns { all: true } if the user has the permission platform-wide,
  // else { all: false, clusterIds: [...] } for the clusters where they hold it.
  async clusterScopeFor(userId: string, permissionKey: string): Promise<{ all: boolean; clusterIds: string[] }> {
    const [resource, action] = [permissionKey.slice(0, permissionKey.indexOf('.')), permissionKey.slice(permissionKey.indexOf('.') + 1)];
    const rows = await this.prismaSystem.tb_user_tb_platform_role.findMany({
      where: {
        user_id: userId, deleted_at: null,
        tb_platform_role: {
          is_active: true,
          tb_platform_role_tb_permission: {
            some: { deleted_at: null, is_active: true, tb_platform_permission: { resource, action, deleted_at: null } },
          },
        },
      },
      select: { cluster_id: true },
    });
    if (rows.some((r) => r.cluster_id === null)) return { all: true, clusterIds: [] };
    return { all: false, clusterIds: [...new Set(rows.map((r) => r.cluster_id!).filter(Boolean))] };
  }
}
```
Provide + export it from `platform_permission.module.ts`, and import that module wherever it's consumed.

- [ ] **Step 2: Apply to the cluster list service**

In micro-cluster's cluster list service `findAll`, accept the caller `user_id` (already in the payload) and the scope service. Before the Prisma `findMany`, compute scope and add a `where` filter:
```typescript
const scope = await this.platformScope.clusterScopeFor(userId, 'cluster.read');
const scopeWhere = scope.all ? {} : { id: { in: scope.clusterIds } };
// merge scopeWhere into the existing where clause
```
> micro-cluster injects `PRISMA_SYSTEM` already (per the Explore report). Wire `PlatformScopeService` into the micro-cluster cluster module's providers, importing it from the shared location. If cross-app import is awkward, duplicate the tiny `scope.service.ts` into micro-cluster (it only needs `PRISMA_SYSTEM`).

- [ ] **Step 3: Apply to the user list service**

Same pattern in micro-cluster `user.service.ts` `findAll`, but filter by the user's cluster membership: a user is visible if they belong (via `tb_cluster_user`) to one of `scope.clusterIds`. Use permission key `user.read`. Build:
```typescript
const scope = await this.platformScope.clusterScopeFor(userId, 'user.read');
const scopeWhere = scope.all ? {} : {
  tb_cluster_user: { some: { cluster_id: { in: scope.clusterIds }, deleted_at: null } },
};
```
> Confirm the relation name from `tb_user` to `tb_cluster_user` in the generated client; adjust accordingly.

- [ ] **Step 4: Typecheck + manual check**

```bash
bun run check-types
# Log in as a cluster-scoped user (assigned a role only for cluster c1), then:
curl -s http://localhost:4000/api-system/clusters -H "Authorization: Bearer $CLUSTER_SCOPED_TOKEN" -H "x-app-id: $APP_ID" | jq '.data | map(.id)'
```
Expected: typecheck exit 0; the list contains only cluster `c1` (and a platform-scoped user still sees all clusters).

- [ ] **Step 5: Commit**

```bash
git add apps/micro-cluster/src/cluster apps/micro-business/src/authen/platform_permission
git commit -m "feat(platform-rbac): scope-aware list filtering for clusters and users"
```

---

## Final verification (after all tasks)

- [ ] **Full typecheck + build:**
```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
bun run build:package && bun run check-types && bun run lint
```
Expected: all exit 0.

- [ ] **All affected service tests:**
```bash
cd apps/micro-business && bun run test
cd ../backend-gateway && bun run test
```
Expected: no failures in the new specs.

- [ ] **End-to-end smoke (manual):** login as a seeded admin → confirm `effective_permissions` present; create a role with permissions; assign it to a user platform-wide; that user logs in and sees the permissions; a cluster-scoped user sees only their cluster in `GET /api-system/clusters`; a low-privilege user gets 403 on `DELETE /api-system/platform/roles/:id`.

- [ ] **Hand-off note:** record the final endpoint list + the `effective_permissions` shape in the spec's "contract" section so the frontend phases (Phase 1–4) build against the verified reality.

---

## Self-Review Notes (coverage vs spec §4)

- §4.1 Prisma tables → Task 1 ✓
- §4.2 Seeds (permission catalog + 5 roles) → Tasks 2, 3 ✓
- §4.3 HTTP API under `/api-system/platform/` (roles CRUD, permissions read, user-role assign/list/remove) → Tasks 9, 10, 11 ✓
- §4.4 effective_permissions in login + profile → Tasks 12, 13 (+ resolver Task 7) ✓
- §4.5 guard/decorator enforcement → Task 14 ✓
- §4.6 scope-aware list filtering → Task 15 ✓
- Microservice handlers backing the gateway → Tasks 4, 5, 6, 7 ✓

**Known assumptions to verify during execution (flagged inline):** exact import paths/`ErrorCode` member names from `@/common`; whether `PRISMA_SYSTEM` is provided globally or per-module; the precise login return object in `auth.service.ts`; how `KeycloakGuard` attaches request context for the platform guard; the `tb_user`↔`tb_cluster_user` relation name in the generated client.
