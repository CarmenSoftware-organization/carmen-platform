import type { FeatureState } from '../constants/featureFlags';

export interface PaginateParams {
  page?: number;
  perpage?: number;
  search?: string;
  searchfields?: string[];
  filter?: Record<string, unknown> | unknown[];
  sort?: string;
  advance?: string;
}

export interface PaginateInfo {
  total: number;
  page: number;
  perpage: number;
  totalPages?: number;
}

export interface ApiListResponse<T> {
  data: T[];
  paginate?: PaginateInfo;
  total?: number;
}

export interface Cluster {
  id: string;
  code: string;
  name: string;
  description?: string;
  alias_name?: string;
  logo?: PresignedImage | null;   // resolved presigned logo (list + detail)
  avatar?: PresignedImage | null; // resolved presigned avatar (list + detail)
  /** โควตา BU จากใบที่ชนะ — 0 เมื่อไม่มีใบที่คุ้มครองอยู่ (ไม่ใช่ "ไม่จำกัด") */
  bu_cap?: number;
  /** จำนวน BU ที่ยังไม่ถูกลบ — รวม BU ที่ปิดใช้งาน */
  bu_used?: number;
  /** วันหมดอายุของใบที่ชนะ — null เมื่อไม่มีใบที่คุ้มครองอยู่ (ต่างจาก perpetual sentinel 2099) */
  bu_cap_end_date?: string | null;
  info?: unknown;
  is_active: boolean;
  bu_count?: number;
  users_count?: number;
  total_max_license_users?: number;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  deleted_at?: string;
  deleted_by_name?: string;
  doc_version?: number; // optimistic-lock token (read model)
}

export type DeviceType = 'mobile' | 'web' | 'desktop' | 'pos';
export const DEVICE_OPTIONS: DeviceType[] = ['mobile', 'web', 'desktop', 'pos'];

export interface Application {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  device?: DeviceType;
  api_names?: string[]; // read model (flat list of api_name strings)
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  doc_version?: number; // optimistic-lock token (read model)
}

// A module group of api_names, e.g. { module: 'cluster', api_names: ['cluster.create', ...] }.
// Returned by the api-catalog endpoint (or derived client-side from a flat api_names list).
export interface ApiCatalogGroup {
  module: string;
  api_names: string[];
}

// Write payload for create/update. The backend is asymmetric to the read model:
// selected api_names are sent through details.add[]. Update uses replace semantics
// (send the full desired set).
export interface ApplicationWritePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  device?: DeviceType;
  details?: { add: { api_name: string }[] };
  doc_version?: number;
}

export interface BusinessUnitConfig {
  id?: string;
  key: string;
  label: string;
  datatype?: string;
  value?: unknown;
}

export interface PresignedImage {
  url: string;
  expires_at?: string;
}

export interface BusinessUnit {
  id: string;
  cluster_id?: string;
  code: string;
  name: string;
  logo?: PresignedImage | null;   // resolved presigned brand logo (list + detail)
  avatar?: PresignedImage | null; // resolved presigned square avatar (list + detail)
  alias_name?: string;
  description?: string;
  is_hq?: boolean;
  is_active: boolean;
  // Hotel Information
  hotel_name?: string;
  hotel_tel?: string;
  hotel_email?: string;
  hotel_address_line1?: string;
  hotel_address_line2?: string;
  hotel_sub_district?: string;
  hotel_district?: string;
  hotel_city?: string;
  hotel_province?: string;
  hotel_postal_code?: string;
  hotel_country?: string;
  hotel_latitude?: string;
  hotel_longitude?: string;
  // Company Information
  company_name?: string;
  company_tel?: string;
  company_email?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_sub_district?: string;
  company_district?: string;
  company_city?: string;
  company_province?: string;
  company_postal_code?: string;
  company_country?: string;
  company_latitude?: string;
  company_longitude?: string;
  // Tax Information
  tax_no?: string;
  branch_no?: string;
  // Date/Time Formats
  date_format?: string;
  date_time_format?: string;
  time_format?: string;
  long_time_format?: string;
  short_time_format?: string;
  timezone?: string;
  // Number Formats
  perpage_format?: string;
  amount_format?: string;
  quantity_format?: string;
  recipe_format?: string;
  // Calculation Settings
  calculation_method?: string;
  default_currency_id?: string;
  // Config & Connection
  database_pool_id?: string | null;
  db_schema?: string | null;
  database_pool?: { id: string; name: string } | null;
  config?: BusinessUnitConfig[] | null;
  cluster_name?: string;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  deleted_at?: string;
  deleted_by_name?: string;
  // `@EnrichAuditUsers()` on `GET /api-system/business-units` deletes the flat `created_at`
  // (and the other audit-timestamp fields) off every list row and re-nests it here as
  // `audit.created.at` instead — same rewrite as `PlatformUserRoleAssignment`/`SuperAdmin`
  // above. Both `created_at` and `audit` are kept on this type because which shape a given
  // response actually carries depends on the route; read `created_at ?? audit?.created?.at`.
  audit?: Audit;
  doc_version?: number; // optimistic-lock token (read model)
}

// Platform database migration (super-admin หรือ deploy token) — /api-system/platform/migrations/*
// ฝั่ง backend คืน stdout ดิบของ prisma มาใน `raw` หลัง sanitize แล้ว ฟิลด์ทั้งหมดเป็น optional
// เพราะ controller ห่อด้วย Result<unknown> — สัญญาไม่ได้การันตีว่าจะมีครบทุกครั้ง
/**
 * หนึ่งรายการในทะเบียนของคอนโซล seed — `/api-system/platform/seeds/catalog`
 * One entry in the platform seed console catalog.
 *
 * ไม่มี label เพราะ backend ส่งแค่ id ชื่อและคำอธิบายอยู่ใน i18n ของหน้าเว็บ เนื่องจากต้องแปลสองภาษา
 * No label: the backend sends ids only; user-facing copy lives in i18n.
 *
 * `missing` เป็นจริงเมื่อไฟล์สคริปต์ไม่มีใน image ที่ deploy อยู่ — ปุ่มต้องถูกปิดตั้งแต่แรก
 * ไม่ใช่ปล่อยให้กดแล้วค่อยพัง
 */
export interface PlatformSeedOp {
  id: string;
  group: 'seed' | 'check';
  script: string;
  writes: boolean;
  readonly: boolean;
  missing: boolean;
}

/** เหตุการณ์ที่สตรีมกลับระหว่างรัน op หนึ่งตัว — รูปเดียวกับ SeedRunEvent ฝั่ง micro-business */
export type SeedRunEvent =
  | { type: 'start'; op_id: string; command: string }
  | { type: 'log'; line: string; stream: 'out' | 'err' }
  | { type: 'done'; success: boolean; exit_code: number }
  | { type: 'error'; message: string };

export interface PlatformMigrationStatus {
  has_pending?: boolean;
  pending?: string[];
  up_to_date?: boolean;
  raw?: string;
}

export interface PlatformMigrationDeployResult {
  success?: boolean;
  already_up_to_date?: boolean;
  applied_migrations?: string[];
  raw?: string;
}

/** 'applied' = ทำเครื่องหมายว่ารันสำเร็จแล้ว · 'rolled-back' = ทำเครื่องหมายว่าย้อนกลับแล้ว */
export type PlatformMigrationResolveAction = 'applied' | 'rolled-back';

export interface PlatformMigrationResolveResult {
  success?: boolean;
  migration_name?: string;
  action?: string;
  raw?: string;
}

// Tenant database migration (super-admin) — /api-system/tenant/migrations/:bu_id/*
export interface TenantMigrationStatus {
  bu_id: string;
  bu_code: string;
  has_pending: boolean;
  pending: string[];
  up_to_date: boolean;
  raw: string;
}

export interface TenantMigrationDeployResult {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
  raw: string;
}

export interface SingleDeploySummary {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
}

export interface BatchDeploySummary {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}

export type DeploySummary = SingleDeploySummary | BatchDeploySummary;

export type ProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'applying'; bu_id: string; bu_code: string; name: string; index: number; total: number }
  | {
      type: 'bu-complete';
      bu_id: string;
      bu_code: string;
      success: boolean;
      applied: string[];
      already_up_to_date: boolean;
      error?: string;
    }
  | { type: 'log'; message: string }
  | { type: 'done'; success: boolean; summary: DeploySummary }
  | { type: 'error'; message: string };

// Tenant seed data (super-admin) — /api-system/tenant/seeds/:bu_id/*
export interface SeedSetStatus {
  key: string;
  label: string;
  defined: number;
  present: number;
  missing: string[];
}

export interface TenantSeedStatus {
  bu_id: string;
  bu_code: string;
  sets: SeedSetStatus[];
  all_seeded: boolean;
}

export interface SeedDeploySummary {
  bu_id: string;
  bu_code: string;
  created: number;
  skipped: number;
}

export type SeedProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'seeding'; bu_id: string; bu_code: string; key: string; row_type: string; index: number; total: number }
  | { type: 'done'; success: boolean; summary: SeedDeploySummary }
  | { type: 'error'; message: string };

export type PreconfigDuplicateMode = 'skip' | 'upsert' | 'error';

export interface PreconfigStepMeta {
  id: string;
  sheet_name: string;
  table_name: string;
  display_name: string;
  description: string;
  target: 'tenant' | 'platform';
  required_columns: string[];
  optional_columns: string[];
  duplicate_key: string[];
  default_duplicate_mode: PreconfigDuplicateMode;
  supports_clear: boolean;
  creates_lookups: string[];
}

export interface PreconfigCheckStep {
  step_id: string;
  sheet_present: boolean;
  row_count: number;
  missing_required_columns: string[];
  missing_optional_columns: string[];
  status: 'ready' | 'sheet_missing' | 'columns_missing';
}

export interface PreconfigCheckReport {
  file_name: string;
  sheets_found: string[];
  steps: PreconfigCheckStep[];
}

export interface PreconfigPreviewRow {
  row_number: number;
  verdict: 'new' | 'duplicate' | 'error';
  values: Record<string, unknown>;
  errors: Array<{ column: string; message: string }>;
}

export interface PreconfigLookupCreation {
  table: string;
  column: string;
  values: string[];
}

export interface PreconfigPreview {
  step_id: string;
  total_rows: number;
  counts: { new: number; duplicate: number; error: number };
  clear_will_soft_delete: number;
  clear_will_soft_delete_related: number;
  lookups_to_create: PreconfigLookupCreation[];
  rows: PreconfigPreviewRow[];
  rows_truncated: boolean;
  /**
   * How many rows of each verdict are in `rows` — `counts` is the whole sheet. Optional so this
   * app still type-checks when deployed ahead of the backend that added it; StepPanel counts the
   * rows itself when it is absent.
   */
  sampled?: { new: number; duplicate: number; error: number };
}

export interface PreconfigImportSummary {
  step_id: string;
  bu_id: string;
  bu_code: string;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  lookups_created: number;
  errors: Array<{ row_number: number; message: string }>;
}

export type PreconfigImportEvent =
  | { type: 'start'; step_id: string; bu_code: string; total: number }
  | { type: 'cleared'; step_id: string; soft_deleted: number; related_soft_deleted: number }
  | { type: 'progress'; step_id: string; index: number; total: number; inserted: number; updated: number; skipped: number; failed: number }
  | { type: 'done'; success: boolean; summary: PreconfigImportSummary }
  | { type: 'error'; message: string };

export interface PreconfigImportOptions {
  duplicate_mode?: PreconfigDuplicateMode;
  clear_existing?: boolean;
  accept_lookup_creation?: boolean;
}

export interface UserInfo {
  firstname?: string;
  middlename?: string;
  lastname?: string;
  telephone?: string;
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role?: string;
  status?: string;
  alias_name?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
  telephone?: string;
  user_info?: UserInfo;
  business_unit?: BusinessUnit[];
  created_at?: string;
  updated_at?: string;
  doc_version?: number; // optimistic-lock token (read model)
}

// Row returned by GET /api-system/user/clusters/:clusterId — a tb_cluster_user
// join row, not a plain User. Carries cluster-membership fields plus a
// nested userInfo (note the camelCase shape from the backend).
export interface ClusterUser {
  id: string;          // tb_cluster_user.id (membership row id, NOT the user's id)
  user_id?: string;    // links to User.id
  cluster_id?: string;
  role?: string;
  is_active?: boolean;
  username?: string;
  email?: string;
  name?: string;
  userInfo?: {
    firstname?: string;
    middlename?: string;
    lastname?: string;
  };
  created_at?: string;
  updated_at?: string;
}

/** A cluster the signed-in user administers, as returned by GET /api-system/me/admin-clusters. */
export interface AdminCluster {
  id: string;
  name: string;
  code: string;
  is_active?: boolean;
  /** Resolved presigned square avatar — absent until the gateway can reach the file service. */
  avatar?: PresignedImage | null;
}

/**
 * The caller's cluster-admin reach. Mirrors the backend's adminClusterScope: `all` is true
 * only for platform super admins, for whom `clusters` is a searchable page rather than the
 * complete set. For everyone else `clusters` is the whole truth.
 */
export interface AdminScope {
  all: boolean;
  clusters: AdminCluster[];
}

/** One business unit an invitation grants access to, and the role granted there on accept. */
export interface InvitationBusinessUnit {
  business_unit_id: string;
  role: string;              // enum_user_business_unit_role
  is_default?: boolean;
}

/** Request body for POST /api-system/clusters/:cluster_id/invitations. */
export interface InvitationCreatePayload {
  email: string;
  cluster_role: string;      // enum_cluster_user_role
  business_units: InvitationBusinessUnit[];
}

/** An issued invitation, with the status the backend computes from its expiry and acceptance. */
export interface ClusterInvitation {
  id: string;
  email: string;
  cluster_role?: string;
  status?: string;
  expires_at?: string;
  created_at?: string;
  business_units?: InvitationBusinessUnit[];
}

export type Scope = { type: 'platform' } | { type: 'cluster'; cluster_id: string };

export interface EffectivePermissions {
  platform: string[];                    // permission keys "resource.action"
  clusters: Record<string, string[]>;    // clusterId -> permission keys
  is_super_admin?: boolean;              // god-mode bypass flag from the backend
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: string[];                 // permission keys
  doc_version?: number; // optimistic-lock token (read model)
  permission_count?: number; // list read model only — absent on the detail read
}

export interface PermissionCatalogItem {
  key: string;                           // "resource.action"
  resource: string;
  action: string;
  description?: string;
  // `tb_permission` is seed data today (created_by_id null throughout) so these are always
  // absent in practice — kept optional so the mapper in permissionService can pass audit
  // fields through instead of silently dropping them if the backend ever populates them.
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  audit?: unknown;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  role_name?: string;
  scope: Scope;
}

/** Scope of a platform-role assignment as returned by the registry endpoint, with the cluster's display name resolved server-side. */
export type PlatformUserScope =
  | { type: 'platform' }
  | { type: 'cluster'; cluster_id: string; cluster_name?: string | null };

export interface PlatformUserRoleAssignment {
  id: string;
  role_id: string;
  role_name?: string | null;
  scope: PlatformUserScope;
  // The gateway's @EnrichAuditUsers rewrites created_at/created_by_id into this shape.
  // `audit.created.name` is absent when the grant predates actor recording, and is the
  // literal "Unknown" when an id was recorded but no longer resolves to a user.
  audit?: Audit;
}

export interface PlatformUserRow {
  user_id: string;
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  is_active: boolean;
  roles: PlatformUserRoleAssignment[];
  last_granted_at?: string | null;
}

/**
 * Registry-wide aggregate for `GET /api-system/platform/users`: describes every holder
 * matching the current `advance` filter + `search`, not just the loaded page — so it stays
 * correct however pagination sorts the results (e.g. the one inactive holder landing on
 * page 3 must not make page 1 look clean). `holders` duplicates `paginate.total`
 * deliberately, per the design doc, so the summary band reads one coherent block instead
 * of stitching two response fields together.
 *
 * Optional on `PlatformUsersResponse` because it ships in a later backend deploy than this
 * frontend change — every request made against the current backend omits it, and callers
 * must render an explicit "unavailable" state rather than defaulting fields to 0, which
 * would misreport (e.g.) inactive holders as zero.
 */
export interface PlatformUserRegistrySummary {
  holders: number;
  platform_wide: number;
  cluster_only: number;
  assignments: number;
  inactive: number;
}

/** Response shape for `GET /api-system/platform/users` — `ApiListResponse` plus the filter-consistent `summary` block (see `PlatformUserRegistrySummary`). */
export interface PlatformUsersResponse extends ApiListResponse<PlatformUserRow> {
  summary?: PlatformUserRegistrySummary;
}

/** Capped/uncapped rollup for one license dimension of the fleet. A cap of 0/null/absent all mean uncapped. */
export interface FleetCapacityTotals {
  used: number;
  cap: number;
  uncapped_count: number;
  uncapped_used: number;
}

/**
 * Fleet aggregate from `GET /api-system/clusters/summary` — the unfiltered, fleet-wide endpoint.
 * It takes no `search`/`advance` params; it counts every cluster in the caller's platform scope,
 * period. (The `summary` block that `GET /api-system/clusters` also attaches to its list
 * response shares this same shape but is filter-scoped to that request — no frontend code reads
 * it any more; see `ClustersResponse.summary` below.) Field names are the API's `snake_case` on
 * purpose; this is a wire type, not a view model.
 */
export interface FleetSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
  near_limit: number;
  /**
   * cluster ที่ใบโควตา BU ที่ชนะจะหมดอายุใน 30 วัน — คนละเรื่องกับ `near_limit` (ใกล้เต็มโควตา)
   * และคนละเรื่องกับ `bu_cap = 0` (ไม่มีใบแล้ว = หมดไปแล้ว ไม่ใช่ "ใกล้หมด") · ใบตลอดชีพไม่นับ
   * นับเฉพาะมิติ BU ไม่รวมใบที่นั่ง · backend คำนวณให้ frontend ห้ามคำนวณเองจากแถวในหน้าปัจจุบัน
   * เพราะตารางเป็น serverSide จึงเห็นแค่หน้าเดียว
   */
  expiring_soon?: number;
  bu: FleetCapacityTotals;
  users: FleetCapacityTotals;
}

/** Response shape for `GET /api-system/clusters` — `ApiListResponse` plus the `summary` block. */
export interface ClustersResponse extends ApiListResponse<Cluster> {
  /**
   * The backend still sends this — it is filter-scoped to `search`/`advance` on this request,
   * NOT fleet-wide — but no frontend code reads it any more. Fleet capacity bands call
   * `clusterService.getFleetSummary()` (`GET /api-system/clusters/summary`) instead, which is
   * unfiltered. Do NOT wire this field into a capacity band; typing in the search box would
   * change its numbers, which is the exact bug that endpoint was added to fix.
   */
  summary?: FleetSummary;
}

/**
 * Overview aggregate for the business-unit band.
 *
 * Two routes return this shape and their scope is NOT the same — pick deliberately:
 * - `GET /api-system/business-units/summary` (`businessUnitService.getSummary`) — the whole
 *   registry the caller may read, ignoring `advance`/`search`. This is what the band renders.
 * - `GET /api-system/business-units` → `summary` — filter-consistent: only the rows matching the
 *   active `advance`/`search`. Nothing reads it today. Wiring it into the band is the bug the
 *   dedicated endpoint exists to fix: the numbers would move as the user types.
 *
 * Both are scope-aware — neither counts clusters the caller may not read.
 * `snake_case` because this is a wire type, not a view model.
 */
export interface BuSummaryData {
  total: number;
  active: number;
  inactive: number;
  /** Soft-deleted rows matching the same filter. The band labels these "Archived". */
  deleted: number;
  /** Distinct clusters the matched business units span — a count query cannot express this. */
  clusters: number;
}

/** Response shape for `GET /api-system/business-units` — `ApiListResponse` plus `summary`. */
export interface BusinessUnitsResponse extends ApiListResponse<BusinessUnit> {
  summary?: BuSummaryData;
}

/**
 * One newest-member row inside the directory summary.
 *
 * `avatar_url` is already presigned by the gateway — the same swap the table rows go through.
 * There is no token here to resolve.
 */
export interface NewestUser {
  id: string;
  username?: string | null;
  email?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  avatar_url?: string | null;
}

/**
 * Directory aggregate for the user band.
 *
 * Two routes return this shape and their scope is NOT the same — pick deliberately:
 * - `GET /api-system/user/summary` (`userService.getDirectorySummary`) — the whole directory the
 *   caller may read, ignoring `advance`/`search`. This is what the band renders.
 * - `GET /api-system/user` → `summary` — filter-consistent: only the rows matching the active
 *   `advance`/`search`. Nothing reads it today. Wiring it into the band would make the numbers
 *   move as the user types, which is the bug the dedicated endpoint exists to fix.
 *
 * Both are scope-aware, and both exclude unverified accounts exactly as the table does.
 * `snake_case` because this is a wire type, not a view model.
 */
export interface UserSummaryData {
  total: number;
  active: number;
  inactive: number;
  /** Soft-deleted rows matching the same filter. The band labels these "Archived". */
  deleted: number;
  /** Distinct business units the matched users belong to — a count query cannot express this. */
  business_units: number;
  /** Newest matched users, most recent first. The band renders these as the presence stack. */
  newest: NewestUser[];
}

/** Response shape for the platform user list — `ApiListResponse` plus `summary`. */
export interface UsersResponse extends ApiListResponse<User> {
  summary?: UserSummaryData;
}

/** One spotlighted role in the access band's breadth ranking. */
export interface TopRole {
  id: string;
  name: string;
  permission_count: number;
}

/**
 * RBAC aggregate for the `/platform-roles` band.
 *
 * The page (`RoleManagement.tsx`) reads this from the dedicated, unfiltered endpoint
 * `GET /api-system/platform/roles/summary` via `roleService.getAccessSummary()` — not the
 * `summary` block `RolesResponse` carries (that one is filter-scoped to whatever `advance`/
 * `search` the list request used). The bar scale (`maxCount` in the old client-side shape) is
 * `top_roles[0].permission_count`, derived at render time rather than sent twice.
 */
export interface RolesSummaryData {
  total: number;
  active: number;
  inactive: number;
  /** Soft-deleted roles, fleet-wide (not filter-scoped — see the class doc above). */
  deleted: number;
  /** Broadest first, at most three entries. */
  top_roles: TopRole[];
}

/** Response shape for `GET /api-system/platform/roles` — `ApiListResponse` plus `summary`. */
export interface RolesResponse extends ApiListResponse<Role> {
  summary?: RolesSummaryData;
}

/** One bar of the application band's device-platform histogram. */
export interface DeviceCount {
  device: string;
  count: number;
}

/**
 * Registry aggregate for the `/applications` band.
 *
 * The page (`ApplicationManagement.tsx`) reads this from the dedicated, unfiltered endpoint
 * `GET /api-system/applications/summary` via `applicationService.getRegistrySummary()` — not
 * the `summary` block `ApplicationsResponse` carries (that one is filter-scoped to whatever
 * `advance`/`search` the list request used). `devices` arrives busiest-first; that is NOT the
 * display order — `ApplicationRegistrySummary.byPlatform` applies its own platform ranking at
 * render, in one place, regardless of which source filled this object.
 */
export interface ApplicationSummaryData {
  total: number;
  active: number;
  inactive: number;
  /** Soft-deleted applications, fleet-wide (not filter-scoped — see the class doc above). */
  deleted: number;
  /** allow_all — can call every endpoint (audit-worthy). */
  full_access: number;
  /** Restricted to a named api set. */
  scoped: number;
  devices: DeviceCount[];
}

/** Response shape for `GET /api-system/applications` — `ApiListResponse` plus `summary`. */
export interface ApplicationsResponse extends ApiListResponse<Application> {
  summary?: ApplicationSummaryData;
}

/** The lead story shown in the newsroom masthead. */
export interface LatestNews {
  id: string;
  title: string;
  /** Presigned by the gateway — there is no token here to resolve. */
  image_url?: string | null;
  published_at?: string | null;
  /** How many business units the article targets; 0 means global. */
  bu_count: number;
}

/**
 * Newsroom aggregate for the `/news` masthead.
 *
 * The page (`NewsManagement.tsx`) reads this from the dedicated, unfiltered endpoint
 * `GET /api/news/summary` via `newsService.getNewsroomSummary()` — not the `summary` block
 * `NewsResponse` carries (that one is filter-scoped to whatever `advance`/`search` the list
 * request used). Has NO active/inactive split, unlike every other summary block: `tb_news` has
 * no `is_active` column, so an article's lifecycle is its `status`. This is also the only place
 * in the contract where `archived` means a **status** — a live row — rather than a deletion.
 */
export interface NewsSummaryData {
  total: number;
  /** Soft-deleted articles, fleet-wide (not filter-scoped — see the class doc above). */
  deleted: number;
  draft: number;
  published: number;
  /** status === 'archived' — a live row, NOT a soft-deleted one. */
  archived: number;
  latest: LatestNews | null;
}

/** Response shape for the news list — `ApiListResponse` plus `summary`. */
export interface NewsResponse extends ApiListResponse<News> {
  summary?: NewsSummaryData;
}

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

export interface AuthContextValue {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  refreshUser: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  loginResponse: LoginResponse | null;
  userCount: number | null;
  effectivePermissions: EffectivePermissions | null;
  hasPermission: (key: string, opts?: { clusterId?: string }) => boolean;
  isSuperAdmin: boolean;
  adminScope: AdminScope | null;
  isClusterAdminOf: (clusterId: string) => boolean;
  /** May this user use the platform-administration view at all? See checkPlatformAuthority. */
  hasPlatformAuthority: boolean;
  /** Does this user administer at least one cluster (or all of them)? */
  hasClusterAdminScope: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export type NewsStatus = 'draft' | 'published' | 'archived';

export interface AuditEntry {
  at?: string;
  id?: string;
  name?: string;
  avatar?: string;
}

export interface Audit {
  created?: AuditEntry;
  updated?: AuditEntry;
  deleted?: AuditEntry;
}

export interface News {
  id: string;
  title: string;
  contents?: string;            // Markdown body
  url?: string;                 // source URL
  image_url?: string;           // presigned image URL returned by list + detail
  image?: string;               // legacy field name (older payloads); kept as fallback
  business_unit_ids?: string[]; // [] = global (all BUs); non-empty = those BUs
  tags?: string[];              // free-form tags (lowercased, de-duplicated by server)
  status?: NewsStatus;
  published_at?: string;
  audit?: Audit;                // enriched audit object (from getById)
  deleted_at?: string;          // set on soft-deleted records (present in the list payload)
  doc_version?: number; // optimistic-lock token (read model)
}

// ===== Broadcasts =====

export type BroadcastTargetMode = 'system_all' | 'system_users' | 'bu';

export type BroadcastTypePreset = 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'OTHER';

export interface BroadcastSystemPayload {
  title: string;
  message: string;
  end_at: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
  userIds?: string[];    // UUIDs; when present, fans out as personal rows
}

export interface BroadcastBuPayload {
  bu_code: string;
  title: string;
  message: string;
  end_at: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
}

export type BroadcastStatus = 'active' | 'scheduled' | 'expired' | 'deleted';

export interface BroadcastListItem {
  id: string;
  title: string | null;
  message: string | null;
  scope: 'system' | 'business_unit';
  bu_code: string | null;
  severity: string | null;
  metadata?: Record<string, unknown>;
  event: string;
  scheduled_at: string | null;
  end_at: string | null;
  status: BroadcastStatus;
  doc_version: number;
  created_at: string;
  created_by?: { id: string; name?: string };
  deleted_at?: string | null;
}

export interface BroadcastListParams {
  page?: number;
  perpage?: number;
  search?: string;
  sort?: string;
  status?: string;
  scope?: string;
  include_deleted?: boolean;
}

export interface BroadcastUpdatePayload {
  title?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string | null;
  end_at?: string;
  doc_version: number;
}

export interface BroadcastSummary {
  all: number;
  active: number;
  scheduled: number;
  expired: number;
  deleted: number;
}

export interface BroadcastsResponse extends ApiListResponse<BroadcastListItem> {
  summary: BroadcastSummary;
}

/**
 * A row of the platform super-admin allowlist as returned by
 * GET /api-system/platform/super-admins.
 *
 * `email` and `name` are joined server-side. They are optional because a
 * frontend deployed ahead of its backend still has to render the table — and
 * they can be empty/null for a real reason too: the user record behind
 * `user_id` may no longer exist. `user_id` is therefore the only field that
 * always identifies the row.
 */
export interface SuperAdmin {
  id: string;
  user_id: string;
  created_at?: string;
  is_active?: boolean;
  email?: string | null;
  name?: string | null;
  audit?: Audit; // gateway's @EnrichAuditUsers() nests created_at here as audit.created.at
}

export interface UserOption {
  id: string;
  name: string;
  email?: string;
}

// ===== Changelog =====

export type ChangelogCategory =
  | 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

export type ChangelogChanges = Partial<Record<ChangelogCategory, string[]>>;

export interface ChangelogVersion {
  version: string;            // semver, e.g. "0.1.0"
  date: string;               // "YYYY-MM-DD"
  changes: ChangelogChanges;
}

export interface Changelog {
  unreleased: ChangelogChanges;
  versions: ChangelogVersion[];
}

// --- SQL Workbench ---
export interface DbObject {
  schema: string;
  name: string;
  kind?: string;
}

export interface DbColumn {
  table: string;
  column: string;
  data_type: string;
}

export interface DbObjectsResponse {
  tables: DbObject[];
  views: DbObject[];
  procedures: DbObject[];
  columns: DbColumn[];
}

export interface DbObjectDefinition {
  type: string;
  schema: string;
  name: string;
  definition: string;
}

export interface SqlExecuteResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export interface SaveDdlInput {
  name?: string;
  sql_text: string;
  query_type: 'view' | 'stored_procedure' | 'function';
}

export interface SaveDdlResult {
  type: string;
  name: string;
  schema: string;
  executed_sql: string;
}

export interface TenantCurrency {
  id: string;
  code: string;
  name: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
  description?: string;
}

/**
 * เส้นทางอีเมลที่เลือกโปรไฟล์ผู้ส่งได้ — ไม่ใช่คุณสมบัติของโปรไฟล์อีกต่อไป
 * โปรไฟล์เป็นรายการหลักที่ตั้งชื่อได้ ส่วนการจับคู่อยู่ใน platform config คีย์ `email_routing`
 * A mail flow that can be routed to a sender profile; profiles themselves are a named master list.
 */
export type EmailFlow =
  | 'register'
  | 'verify_email'
  | 'invitation'
  | 'forgot_password'
  | 'notification';

/** mapping เส้นทาง → id ของโปรไฟล์ผู้ส่ง · `default` ใช้กับ flow ที่ไม่ได้ระบุ */
export interface EmailRoutingConfig {
  default: string;
  register?: string;
  verify_email?: string;
  invitation?: string;
  forgot_password?: string;
  notification?: string;
}

/**
 * Platform-wide outbound email sender profile.
 * `smtp_password` is ALWAYS the mask (`••••••`) when it comes from the API —
 * the real value is never returned. See docs/superpowers/specs/2026-07-30-*.
 */
export interface EmailSetting {
  id: string;
  doc_version?: number;
  name: string;
  from_email: string;
  from_name?: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username?: string | null;
  smtp_password?: string | null;
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailSettingTestResult {
  sent: boolean;
  reason?: string;
}

// ==================== Database Pool (tb_database_pool) ====================

export interface DatabasePool {
  id: string;
  doc_version?: number;
  name: string;
  description?: string | null;
  host: string;
  port: number;
  database: string;
  username: string;
  /** มาสก์เสมอ (`••••••`) — ไม่มี endpoint ไหนคืนค่าจริง */
  password?: string | null;
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export type DatabasePoolsResponse = ApiListResponse<DatabasePool>;

/** สิ่งที่ส่งไปเขียน — ไม่ใช่รูปที่อ่านกลับมา (ไม่มี id/doc_version/audit) */
export interface DatabasePoolWriteInput {
  name: string;
  description?: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  is_active: boolean;
  note?: string;
}

// ==================== Platform Config (tb_platform_config) ====================

/**
 * ค่า config ของคีย์ `invitation` — ใช้ประกอบลิงก์คำเชิญและกำหนดอายุคำเชิญ
 * backend ตรวจค่านี้ด้วย Zod ก่อนบันทึกเสมอ FE ตรวจซ้ำเพื่อ UX เท่านั้น
 */
export interface InvitationConfig {
  base_url: string;
  expiry_days: number;
  /**
   * เพดานคำเชิญต่อผู้ดูแลหนึ่งคนต่อชั่วโมง (backend default 100)
   * optional เพราะแถวที่บันทึกก่อน backend PR #318 ไม่มีฟิลด์นี้
   */
  max_per_admin_per_hour?: number;
  /** เพดานคำเชิญต่อ cluster ต่อวัน (backend default 500) */
  max_per_cluster_per_day?: number;
}

/**
 * ค่าตั้งของการสมัคร — ปลายทางของลิงก์ยืนยันอีเมลที่ส่งก่อนสร้างบัญชี
 * เดิมเป็น env `SIGNUP_VERIFY_BASE_URL` ของ micro-business ย้ายมาที่นี่เพื่อให้แก้ได้โดยไม่ต้อง deploy
 */
export interface SignupConfig {
  verify_base_url: string;
  link_expiry_hours: number;
}

/**
 * ค่าตั้งที่มีรูปร่าง "ปลายทางลิงก์ + อายุลิงก์" — ใช้กับคีย์ email_verification และ password_reset
 * ทั้งคู่เคยเป็น env ของ micro-business ย้ายมาที่นี่เพื่อให้แก้ได้โดยไม่ต้อง deploy
 */
export interface LinkConfig {
  base_url: string;
  expiry_hours: number;
}

/**
 * ผู้รับอีเมลแจ้งเตือนภายในและคำนำหน้าหัวเรื่อง — เป็น "นโยบาย" ไม่ใช่ความลับ
 * ค่า SMTP (host / user / password) ไม่ได้อยู่ที่นี่ มันอยู่ที่ tb_email_sender_profile
 * (หน้า Email Setting) ซึ่งเข้ารหัสรหัสผ่านและแยกโปรไฟล์ตามวัตถุประสงค์ได้
 */
export interface NotificationEmailConfig {
  /** สวิตช์เปิด/ปิดการส่งอีเมลแจ้งเตือนภายใน — เดิมคือ env SMTP_ENABLED ของ micro-notification */
  enabled: boolean;
  recipients: string[];
  cc: string[];
  subject_prefix: string;
}

/**
 * สวิตช์เดียวที่ตัดสินว่า licensing "บังคับใช้" จริงหรือแค่บันทึก (shadow mode)
 *
 * ไม่ได้อ่านผ่าน service ของ platform config — backend-gateway (`LicenseInterceptor`) และ
 * micro-cluster (`assertSeatAvailable`) อ่าน `tb_platform_config` ตรง ๆ คนละ process
 * ต่างมี cache 60 วิของตัวเอง การบันทึกจากหน้านี้จึงมีผลภายในราวหนึ่งนาที ไม่ใช่ทันที
 * และไม่ต้อง deploy ใหม่
 *
 * ตัวเดียวกันนี้เปิด **ทั้ง** การบังคับใช้ license รายฟีเจอร์ และเพดานที่นั่งพร้อมกัน
 */
export interface LicenseConfig {
  enforcement_enabled: boolean;
}

/**
 * สวิตช์เปิด/ปิด API migration ของฐานข้อมูลแพลตฟอร์ม — คีย์ `platform_migration` ใน Platform Config
 * The on/off switch for the platform-database migration API.
 *
 * เคยเป็น env `PLATFORM_MIGRATION_API_ENABLED` ของ backend-gateway ย้ายมาเป็น config เพราะเป็นค่าที่
 * ผู้ดูแลระบบเปิด/ปิดเอง แต่ **เขียนได้เฉพาะ super-admin** ไม่ใช่ผู้ถือ `platform_config.manage`
 * ต่างจากคีย์อื่นทุกตัวในหน้านี้ — สิ่งที่มันเปิดคือ endpoint ที่บังคับ super-admin อยู่แล้ว
 *
 * guard ฝั่ง backend cache ไว้ 60 วินาที การสลับค่าจึงมีผลภายในหนึ่งนาที ไม่ใช่ทันที
 */
export interface PlatformMigrationConfig {
  api_enabled: boolean;
}

/**
 * เกณฑ์ "ใกล้หมดอายุ" ของใบแต่ละชนิด หน่วยเป็นวัน — คีย์ `expiry_thresholds` ใน Platform Config
 * The per-kind "expiring soon" windows, in days.
 *
 * เป็นเกณฑ์ **แสดงผล** ไม่ใช่เกณฑ์บังคับใช้ — เปลี่ยนแล้วไม่มีใครถูกบล็อกเพิ่มหรือลด
 * อ่านผ่าน `useExpiryThresholds()` ไม่ใช่ผ่าน `platformConfigService` เพราะ GET ของเส้นทางนั้น
 * บังคับ `platform_config.read` ซึ่งผู้ใช้ที่เปิดหน้ารายการใบทั่วไปไม่มี
 * A display threshold, read through the dedicated open endpoint, not /platform/configs.
 */
export interface ExpiryThresholdsConfig {
  /** ใบสัญญา (subscription) */
  subscription_days: number;
  /** ใบโควตา BU ระดับ cluster */
  bu_quota_days: number;
  /** ใบที่นั่งของ BU */
  seat_days: number;
}

/**
 * หนึ่งรายการจาก /api-system/platform/configs
 * `id` เป็น null เมื่อยังไม่เคยบันทึกคีย์นี้ และ backend กำลังคืนค่าเริ่มต้นในตัวมาแทน
 */
export interface PlatformConfig {
  id: string | null;
  key: string;
  value: Record<string, unknown>;
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
}

// ==================== Record Audit Trail (tb_activity) ====================
// คนละตารางกับ Usage Analytics ด้านล่าง: ตรงนั้นคือ tb_activity_event (คลิก/เปิดหน้า)
// ส่วนนี่คือประวัติการแก้เรคอร์ดจริง พร้อมค่าก่อน/หลังรายฟิลด์

/** ฟิลด์หนึ่งที่ค่าเปลี่ยนระหว่างภาพก่อนกับภาพหลัง */
export interface ActivityFieldChange {
  field: string;
  /** ค่าที่ถูกปิดบังตอนบันทึกจะมาเป็นสตริง "[REDACTED]" */
  old?: unknown;
  new?: unknown;
}

/** แถวในตารางลูกที่ถูกเพิ่ม ลบ หรือแก้ */
export interface ActivityChildChange {
  relation: string;
  added?: Record<string, unknown>[];
  removed?: Record<string, unknown>[];
  updated?: { id: string; fields: ActivityFieldChange[] }[];
}

export interface ActivityDiff {
  fields?: ActivityFieldChange[];
  children?: ActivityChildChange[];
  /** false เมื่อต่างกันเฉพาะฟิลด์ระบบ (updated_at, updated_by_id, doc_version) */
  has_changes?: boolean;
}

/**
 * หนึ่งรายการในประวัติการเปลี่ยนแปลงของเรคอร์ด
 *
 * เวลาและชื่อผู้ทำอ่านจาก `audit.created` ไม่ใช่ `created_at` — backend ไม่ส่ง `created_at`
 * มาเลย แต่ส่ง `audit` ที่ @EnrichAuditUsers() ประกอบชื่อเต็มให้แล้ว ส่วน actor_* ที่ยัง
 * ส่งมาด้วยเป็นวัตถุดิบก่อนประกอบ ใช้เป็นทางสำรองได้
 */
export interface ActivityLogEntry {
  id: string;
  action?: string;
  /** ชื่อตารางที่ตัด prefix tb_ ออกแล้ว เช่น "cluster" */
  entity_type?: string;
  entity_id?: string;
  actor_id?: string | null;
  actor_username?: string | null;
  actor_firstname?: string | null;
  actor_middlename?: string | null;
  actor_lastname?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  description?: string | null;
  audit?: Audit;
  /**
   * metadata ที่ผู้บันทึกใส่ไว้ — รูปไม่คงที่ ขึ้นกับว่าโค้ดจุดไหนเป็นคนเขียน
   * แถวการเปลี่ยนสมาชิกมี `event_type` ขึ้นต้นด้วย `membership.`
   */
  meta_data?: Record<string, unknown>;
  /**
   * ชื่อของคนที่ถูกเพิ่ม/ถอดในแถว membership — ต่างจาก audit.created ที่เป็นคนลงมือ
   * null เมื่อแถวไม่ใช่ membership event หรือ backend หาผู้ใช้ไม่เจอ
   * (แถวที่มาจากคำเชิญไม่มี subject_user_id ให้ resolve ตั้งแต่ต้น)
   */
  subject_name?: string | null;
}

export type ActivityLogDetail = ActivityLogEntry & { changes?: ActivityDiff };

export type ActivityLogsResponse = ApiListResponse<ActivityLogEntry>;

// ==================== Usage Analytics (tb_activity_event) ====================

export interface AnalyticsSummary {
  events: number;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface AnalyticsDaily {
  /** 'YYYY-MM-DD' ตาม Asia/Bangkok — backend เป็นผู้ตัดขอบวัน */
  day: string;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface AnalyticsTopPage {
  page_path: string;
  events: number;
  sessions: number;
  users: number;
}

export interface AnalyticsTopElement {
  element_id: string;
  element_text?: string | null;
  page_path?: string | null;
  clicks: number;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  daily: AnalyticsDaily[];
  top_pages: AnalyticsTopPage[];
  top_elements: AnalyticsTopElement[];
}

export interface ActivityEvent {
  id: string;
  event_id: string;
  session_id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  bu_code?: string | null;
  app_id?: string | null;
  app_name?: string | null;
  domain?: string | null;
  user_agent?: string | null;
  event_type: string;
  page_path: string;
  element_id?: string | null;
  element_text?: string | null;
  props?: unknown;
  client_ts: string;
  server_ts: string;
}

/** ตัวกรองที่ใช้ร่วมทั้งหน้า dashboard และหน้า raw explorer */
export interface AnalyticsFilterParams {
  /** ISO 8601 UTC */
  from: string;
  /** ISO 8601 UTC */
  to: string;
  bu_code?: string;
  app_id?: string;
  event_type?: string;
  user_id?: string;
  session_id?: string;
  page_path?: string;
}

// ==================== Subscriptions / License Features (tb_subscription) ====================

/** สถานะที่เก็บใน DB — ห้ามใช้ตัดสินสถานะที่แสดงผล ใช้ `state` แทนเสมอ */
export type SubscriptionStatus = 'active' | 'inactive' | 'expired';

/**
 * สถานะที่แสดงผล — backend คำนวณให้แล้วจาก status + end_date และคืนมาในทุก response
 * (row ของ list และ detail) ห้าม frontend คำนวณเอง (swagger: "The frontend must not
 * recompute this from status/end_date — use this field directly")
 */
export type SubscriptionState = 'active' | 'expired' | 'inactive';

export interface Subscription {
  id: string;
  cluster_id: string;
  cluster_name: string;
  cluster_code: string;
  subscription_number: string;
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
  state: SubscriptionState;
  /**
   * BU ที่สัญญานี้ออกให้ — หนึ่งใบผูกหนึ่ง BU เสมอ (backend บังคับด้วย partial unique index)
   * แทนที่ `bu_count` เดิมซึ่งจะเป็น 1 ตลอดกาลแล้ว · สตริงว่าง = ข้อมูลผิดรูปจากยุคก่อน migration
   */
  bu_code: string;
  bu_name: string;
  feature_count: number;
  seat_used: number;
  /** จำนวนเต็มเสมอ ไม่มี null — ไม่มีคำว่า "ไม่จำกัด" ในระบบที่นั่ง 0 คือศูนย์ที่นั่งจริงๆ */
  seat_cap: number;
  doc_version: number;
}

/** ที่นั่งของ **cluster** ทั้งก้อน ไม่ใช่ของ BU — seat เป็น pool ร่วมระดับ cluster (สเปก §6.1) */
export interface SubscriptionSeat {
  used: number;
  /** จำนวนเต็มเสมอ ไม่มีค่า "ไม่จำกัด" ในระบบที่นั่ง */
  cap: number;
  /** invitation ที่ยัง pending แบบ distinct ต่อ cluster ไม่ใช่ต่อ BU link */
  pending_invites: number;
}

export interface SubscriptionBu {
  business_unit_id: string;
  bu_code: string;
  bu_name: string;
  /**
   * สิทธิ์ที่คลี่เป็นราย feature — ยังคืนมาระหว่างเฟสย้ายข้อมูล แต่**ไม่ใช่สิ่งที่หน้าขายแก้อีกแล้ว**
   * หน้าขายแก้ `group_ids` ส่วนนี้ใช้แสดงผลว่าสรุปแล้วลูกค้าได้อะไรบ้าง
   */
  feature_keys: string[];
  /** กลุ่มสิทธิ์ที่ใบนี้ถืออยู่ — ว่างสำหรับใบที่ยังไม่ถูก backfill เข้าระบบกลุ่ม */
  group_ids?: string[];
  /** กลุ่มเดียวกันพร้อม code/name สำหรับแสดงผลโดยไม่ต้องยิงซ้ำ */
  groups?: { id: string; code: string; name: string }[];
  /** ใบนี้ซื้อไปเท่าไร (สมทบ pool) — แทนที่ `seat` เดิม ผลรวมทุกใบ = SubscriptionDetail.seat.cap */
  licensed_users: number;
}

export interface SubscriptionDetail
  extends Omit<Subscription, 'bu_code' | 'bu_name' | 'feature_count' | 'seat_used' | 'seat_cap'> {
  /** ระดับ cluster — ไม่ใช่ของ BU ใด BU หนึ่ง เพราะ seat เป็น pool ร่วมทั้ง cluster */
  seat: SubscriptionSeat;
  /**
   * BU เดียวของสัญญา — เดิมเป็น `bus[]` สมัยที่หนึ่งใบผูกได้หลาย BU
   * `null` เฉพาะข้อมูลผิดรูปจากยุคก่อน migration · ใบที่สร้างใหม่มี BU เสมอ
   */
  bu: SubscriptionBu | null;
}

export interface LicenseFeature {
  key: string;
  /** null = เป็น module ระดับบน */
  parent_key: string | null;
  label: string;
  description: string | null;
  sort_order: number;
  /**
   * สถานะในแค็ตตาล็อก — `hide` ไม่ถูกส่งมาจาก endpoint นี้ ค่าที่เห็นจริงมีแค่ active / inactive
   * `inactive` แปลว่ากลุ่มที่ผูกคีย์นี้ไว้แล้วเก็บไว้ได้ แต่เพิ่มเข้ากลุ่มใหม่ไม่ได้
   */
  state: FeatureState;
}

/**
 * แถวแค็ตตาล็อกสำหรับหน้าจัดการ `/license-features` — ต่างจาก `LicenseFeature` ตรงที่มี `id`
 * กับ `doc_version` และ **รวมแถวที่ `hide` ด้วย** เพราะหน้าที่ซ่อน feature ได้ต้องหามันเจอเพื่อเอากลับ
 */
export interface LicenseFeatureAdminRow extends LicenseFeature {
  id: string;
  doc_version: number;
  /**
   * BU ที่จะเสียเมนูนี้ไปถ้าตั้งเป็น `hide` — นับหัวไม่ซ้ำ รวมสัญญาที่หมดอายุด้วย
   *
   * `state` เป็นค่า global ไม่แยกตาม BU การซ่อนจึงกระทบทุกคนที่ถือคีย์นี้พร้อมกัน
   * รวมลูกค้าที่จ่ายเงินไปแล้ว ตัวเลขนี้มีไว้เตือนก่อนกดบันทึกเท่านั้น
   *
   * **optional** — gateway รุ่นเก่ายังไม่ส่ง ค่า `undefined` ถือเป็น 0 (ไม่เตือน)
   * ซึ่งเป็นพฤติกรรมเดิมทุกประการ
   */
  affected_bu_count?: number;
}

export interface SubscriptionSummary {
  total: number;
  active: number;
  expired: number;
  expiring_soon: number;
  deleted: number;
}

export interface SubscriptionsResponse {
  data: Subscription[];
  paginate: { total: number; page: number; perpage: number; pages: number };
  summary?: SubscriptionSummary;
}

// ==================== BU User License (tb_business_unit_license) ====================

/** สถานะของใบ — คำนวณจากวันที่ทุกครั้งที่อ่าน ไม่เก็บใน DB */
export type BuLicenseStatus = 'active' | 'scheduled' | 'expired';

/** ใบซื้อที่นั่งหนึ่งใบของ BU — ผลรวมของใบที่ active คือที่นั่งที่ BU สมทบเข้า pool ของ cluster */
export interface BusinessUnitLicense {
  id: string;
  business_unit_id: string;
  license_number: string;
  licensed_users: number;
  /** ISO 8601 พร้อม Z — แปลงเป็นเวลาท้องถิ่นตอนแสดงผลเท่านั้น */
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
  doc_version: number;
}

// ==================== Cluster BU License (tb_cluster_license) ====================

/**
 * สถานะของใบที่ผู้ใช้เห็น — คำนวณตอนอ่าน ไม่เก็บใน DB (ยกเว้น `cancelled` ที่มาจาก `cancelled_at`)
 *
 * `superseded` = ใบยังอยู่ในช่วงวันจริง แต่แพ้ใบที่ใหม่กว่า จึงไม่ให้โควตาแล้ว — เดิมใบพวกนี้
 * ขึ้นป้าย `active` ปนกับใบที่ให้โควตาจริง ทำให้แยกไม่ออกว่าโควตามาจากใบไหน
 * `cancelled` = ถูกยกเลิกด้วยมือ ไม่มีวันกลับมาให้โควตาอีก
 */
export type ClusterLicenseStatus = 'active' | 'superseded' | 'scheduled' | 'expired' | 'cancelled';

/**
 * ใบซื้อโควตาจำนวน BU หนึ่งใบของ cluster
 *
 * ต่างจาก `BusinessUnitLicense` ตรงที่ **ไม่บวกกัน** — โควตาที่มีผลคือใบที่ชนะใบเดียว
 * (`activeLicense()` ใน `utils/clusterLicense.ts`) การบวกผลรวมที่นี่คือบั๊ก
 */
export interface ClusterLicense {
  id: string;
  cluster_id: string;
  license_number: string;
  /** จำนวน BU ที่ใบนี้ให้สิทธิ์ — จำนวนเต็มเสมอ ไม่มีค่าที่แปลว่า "ไม่จำกัด" */
  licensed_bus: number;
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
  doc_version: number;
  /** tie-break ลำดับที่สองของ "ใบที่ชนะ" รองจาก start_date (ดู `activeLicense` ใน utils/clusterLicense.ts) */
  created_at?: string | null;

  /** ถูกยกเลิกเมื่อไร — null/undefined = ยังไม่ถูกยกเลิก · ใบที่ยกเลิกแล้วไม่ให้โควตาอีก */
  cancelled_at?: string | null;
  cancelled_by_id?: string | null;
  cancel_reason?: string | null;

  /**
   * ใบนี้คือใบที่ backend view เลือกให้คลัสเตอร์นี้หรือไม่ — **backend เป็นคนตอบ ไม่ใช่ฝั่งนี้**
   *
   * `undefined` แปลว่าเส้นทางที่โหลดมาไม่ได้ถาม (เช่น `getAll` ราย cluster) **ห้ามอ่านเป็น false**
   * ผู้เรียกที่มีใบครบทั้งคลัสเตอร์อยู่แล้วใช้ `statusMap()` ซึ่งตกไปที่ `activeLicense()` ให้เอง
   */
  is_in_force?: boolean;
}

// ==================== Fleet-wide license views (platform, cross-BU/cross-cluster) ====================

/** แถวในมุมมองรายใบทั้ง fleet — มีเจ้าของพ่วงมาเพราะผู้ดูอยู่นอกบริบทของ BU/cluster ใดตัวหนึ่ง */
export interface SeatLicenseRow extends BusinessUnitLicense {
  business_unit_code: string;
  business_unit_name: string;
  cluster_id: string;
  cluster_code: string;
  cluster_name: string;
}

export interface BuQuotaLicenseRow extends ClusterLicense {
  cluster_code: string;
  cluster_name: string;
}

export interface SeatLicensesResponse {
  data: SeatLicenseRow[];
  paginate: { total: number; page: number; perpage: number; pages: number };
}

export interface BuQuotaLicensesResponse {
  data: BuQuotaLicenseRow[];
  paginate: { total: number; page: number; perpage: number; pages: number };
}

// ==================== License Feature Groups (tb_license_feature_group) ====================

/**
 * กลุ่ม feature ที่ผู้ดูแลจัดเอง — หน่วยของการขายที่จะมาแทนการติ๊ก feature ทีละตัว
 *
 * ต่างจาก "module" ซึ่งมาจาก key prefix ของ `LicenseFeature` (`moduleOf()` ใน
 * `pages/licenses/subscriptionEdit/featureSelection.ts`): group ข้าม module ได้อย่างอิสระ
 * หยิบ `inventory.count` กับ `report.daily` มาอยู่กลุ่มเดียวกันได้
 */
export interface LicenseFeatureGroup {
  id: string;
  /** ห้ามซ้ำ และแก้ไม่ได้หลังสร้าง — การเปลี่ยนรหัสคือการเปลี่ยนตัวตนของกลุ่ม ไม่ใช่การแก้ชื่อ */
  code: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  /** จำนวน feature ในกลุ่ม — backend นับให้ */
  feature_count: number;
  /**
   * จำนวนสัญญาที่อ้างกลุ่มนี้ — เคยเป็น 0 เสมอในเฟสก่อน แต่**ตอนนี้เป็นค่าจริงแล้ว** (DEV คืน
   * 14/1/1) นี่คือรัศมีความเสียหายของการแก้กลุ่ม หน้าที่แสดงกลุ่มจึงต้องวาดมันให้ต่างจากเลขนับ
   */
  subscription_count: number;
  doc_version: number;
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
}

export interface LicenseFeatureGroupDetail extends LicenseFeatureGroup {
  /** เรียงจากน้อยไปมาก · รวม module แม่ที่ backend เติมให้เองด้วย ไม่ใช่เฉพาะที่ผู้ใช้ติ๊ก */
  feature_keys: string[];
}

export interface LicenseFeatureGroupsResponse {
  data: LicenseFeatureGroup[];
  paginate: { total: number; page: number; perpage: number; pages: number };
}

/** ฟิลด์ที่แก้ได้ — `code` ตั้งได้ตอนสร้างเท่านั้น backend ไม่รับใน PATCH */
export interface LicenseFeatureGroupWriteInput {
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}
