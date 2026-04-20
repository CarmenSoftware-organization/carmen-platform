# Carmen Platform

React + TypeScript admin dashboard for managing clusters, business units, users, and report templates. Backed by a separate NestJS/Prisma API.

## Quick start

```bash
git clone <repo-url> carmen-platform
cd carmen-platform
cp .env.example .env          # edit REACT_APP_API_BASE_URL and REACT_APP_API_APP_ID
bun install                   # or: npm install
bun start                     # dev server at http://localhost:3001
```

## Tech stack

- React 18 + TypeScript 5 (strict), react-scripts 5, react-router-dom 6
- Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives)
- TanStack Table v8 + React Virtual
- CodeMirror 6 for XML editing
- Axios, Sonner, lucide-react
- Bun (primary) / npm, Node 20.x
- Playwright for e2e tests

## Docs

| Document | What it covers |
|---|---|
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | Product, architecture, entities, project structure |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, env, API, auth, Docker, CI, troubleshooting |
| [CLAUDE.md](CLAUDE.md) | Code conventions and patterns (primary source of truth) |
| [SITEMAP.md](SITEMAP.md) | Routes and navigation |

## Deployment

Docker (multi-stage, nginx on port 3001) → AWS ECR → EC2 via GitHub Actions + SSM. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#docker-and-deployment).

---

© Carmen Software
