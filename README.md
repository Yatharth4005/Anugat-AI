# Samayak Admin Panel

A full-stack academic operations management system for BIT Mesra.

## Architecture

```
samayak-admin/
├── apps/
│   ├── api/          # Express + Prisma + BullMQ backend (port 4000)
│   └── web/          # Next.js 15 admin panel (port 3000)
└── packages/
    └── types/        # Shared TypeScript types
```

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **PostgreSQL** 15+
- **Redis** 7+

## Quick Start

### 1. Clone and install
```bash
pnpm install
```

### 2. Configure environment
```bash
# Copy and edit API env
copy apps\api\.env apps\api\.env.local
# Edit DATABASE_URL and REDIS_URL as needed
```

### 3. Start PostgreSQL + Redis (via Docker)
```bash
docker-compose up -d postgres redis
```

### 4. Run migrations and seed
```bash
cd apps/api
npx prisma migrate dev
pnpm db:seed
```

### 5. Generate Prisma client
```bash
npx prisma generate
```

### 6. Start the API
```bash
pnpm dev    # from apps/api
```

### 7. Start the worker
```bash
pnpm worker  # from apps/api, in a separate terminal
```

### 8. Start the web app
```bash
pnpm dev     # from apps/web
```

## Demo Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@samayak.edu | Admin@2024 | ADMIN |
| coordinator@samayak.edu | Coord@2024 | COORDINATOR |
| vkb@samayak.edu | Samayak@2024 | PROFESSOR |

## Features

- **Dashboard** — Live analytics: room utilisation %, P(empty room|slot) heatmap, under-running courses
- **Departments** — CRUD with CSV import
- **Rooms** — Classroom/Lab management with utilisation tracking
- **Courses** — Branch-scoped with credit and type tracking
- **Faculty** — RBAC roles, soft delete with 30-day recovery, two-step import
- **PDF Ingestion** — Drag-drop upload → OCR → entity extraction → DB integration

## API Endpoints

```
GET    /api/health
POST   /api/auth/login
GET    /api/auth/me
GET    /api/departments
POST   /api/departments
PATCH  /api/departments/:id
DELETE /api/departments/:id
GET    /api/rooms
POST   /api/rooms
PATCH  /api/rooms/:id
DELETE /api/rooms/:id
GET    /api/courses
POST   /api/courses
PATCH  /api/courses/:id
DELETE /api/courses/:id
GET    /api/faculty
POST   /api/faculty
PATCH  /api/faculty/:id
DELETE /api/faculty/:id
POST   /api/faculty/:id/restore
POST   /api/timetable/ingest
GET    /api/timetable/job/:id
GET    /api/timetable/jobs
GET    /api/analytics/dashboard
POST   /api/analytics/recompute
```
