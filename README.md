# Anugat AI Samyak Admin — Academic Operations & Analytics System

> A full-stack academic scheduling, room utilization, and curriculum analytics engine for universities (configured for BIT Mesra), built with Next.js 15, Express, Prisma ORM, PostgreSQL, Redis, BullMQ, and Tesseract.js OCR.

---

## Architecture Overview

Samyak Admin is engineered to handle complex, resource-intensive PDF parsing and OCR ingestion flows asynchronously. By decoupling file ingestion from the HTTP request-response cycle, the system ensures that academic coordinators never experience a frozen UI or gateway timeouts while massive timetable documents are parsed, structured, and integrated.

<img width="1536" height="1024" alt="System-Architecture-SamayakAdmin" src="https://github.com/user-attachments/assets/989e8bc3-e53d-421e-a429-fd0a706416dc" />


---

## Tech Stack & Key Features

* **Monorepo Architecture**: Managed with `pnpm` workspaces separating frontend, backend, and a shared `@samayak/types` package.
* **Frontend UI**: Built with **Next.js 15**, **TanStack React Query** (for cache handling and auto-polling), **Zustand** (for authentication stores), and **Recharts** (for rendering room utilisation bars, heatmap grids, and probability distributions).
* **Styling**: Sleek, responsive, and custom Vanilla CSS system incorporating custom variables, visual cards, loading skeletons, and interactive heatmaps.
* **Backend API**: Engineered with **Node.js**, **Express**, **Prisma ORM**, and **PostgreSQL**.
* **Asynchronous Jobs**: High-performance task execution powered by **Redis** and **BullMQ**.
* **Ingestion Pipeline**: Dual-parsing framework utilizing **PDF.js** (`pdf-parse`) for digital vector text extraction and **Tesseract.js** for scanned image document OCR, backed by **Sharp** image processors.
* **Curriculum Analytics**: Automated pre-computation system tracking overall university room utilisation, schedule gaps (under-running courses), and empty room-hours.

---

## Key Technical Challenges & Approach

### 1. Scanned & Character-Corrupt Timetables (Fuzzy OCR Normalization)
* **Challenge**: Timetables uploaded by university departments are often low-quality scans without selectable vector text layers. Standard OCR engines frequently introduce character corruption (e.g., parsing the course code `CS2205` as `COSAS`, `CS24213` as `524213`, room `219` as `11219`, or teacher initials `VKB` as `tewhwr`).
* **Approach**: Engineered a dual-parsing pipeline in [pdfParser.ts](file:///f:/Anugat%20AI/samayak-admin/apps/api/src/services/pdfParser.ts). The service first attempts direct text extraction using `pdf-parse`. If text density is insufficient, it converts PDF pages into high-resolution screenshots and invokes `tesseract.js` for optical character recognition. The raw text is then piped through a regex-based **Normalizer Engine** that maps common OCR character glitches back to correct academic entity codes (e.g., resolving `€S` to `CS`, correcting room number strings, and translating fuzzy section names to semester integers).

### 2. CPU-Bound OCR Operations & Server Timeouts
* **Challenge**: Performing OCR on multi-page PDFs is extremely CPU-bound and can take anywhere from 15 to 60 seconds. Running this directly inside Express request handlers leads to blocked event loops and triggers 504 Gateway Timeouts on hosting platforms.
* **Approach**: Decoupled the ingestion process using a distributed worker architecture in [worker.ts](file:///f:/Anugat%20AI/samayak-admin/apps/api/src/worker.ts) backed by **BullMQ** and **Redis**. The ingestion endpoint instantly logs the job with a `QUEUED` state, pushes the file path into the queue, and returns `202 Accepted` with a `jobId`. The background worker processes jobs sequentially, reporting step-by-step progress percentages (from `5% - Initializing` to `90% - Ingestion complete`) back to the database, allowing the client frontend to poll and show real-time progress indicators.

### 3. Expensive Multi-Dimensional Analytics Computations
* **Challenge**: Calculating operations metrics—such as overall room utilisation rates, the probability of finding a free room per time slot across all weekdays $P(\text{Free Room} \mid \text{Slot})$, and curriculum coverage gaps—requires querying and joining multiple tables containing thousands of slots. Re-running these queries on every dashboard load severely degrades database performance.
* **Approach**: Implemented a **Write-Through Caching layer** in [analytics.ts](file:///f:/Anugat%20AI/samayak-admin/apps/api/src/services/analytics.ts) using Redis and a dedicated PostgreSQL table (`AnalyticsCache`). When a background ingestion worker completes a PDF parse or when an administrator updates a room, course, or slot, the system invalidates the cache. A background recomputation job is triggered to write the fresh JSON output back to the cache, resulting in sub-millisecond response times for client requests.

---

## Local Setup & Installation

Follow these steps to set up and run the project locally.

### 1. Prerequisites
Ensure you have the following installed:
* **Node.js** (v20 or higher)
* **pnpm** (v9 or higher)
* **Docker Desktop** (to run local databases and cache servers)

### 2. Start PostgreSQL & Redis Services
From the root directory, start the local PostgreSQL (v16) and Redis (v7) instances using Docker Compose:
```bash
docker compose up -d
```

### 3. Environment Variables Setup
Copy the environment variables from the `.env.example` file located in the root of the workspace into a new `.env` file in the root directory:
```bash
cp .env.example .env
```

Here are the environment variables configured for the project:
```env
# Database connection URI for Prisma (maps to the PostgreSQL Docker service)
DATABASE_URL=postgresql://samayak:samayak@localhost:5432/samayak?schema=public

# Redis cache and queue connection string
REDIS_URL=redis://localhost:6379

# JSON Web Token parameters for admin session validation
JWT_SECRET=samayak_super_secret_jwt_key_change_in_production_2024
JWT_EXPIRES_IN=7d

# Express API server configuration
API_PORT=4000
NODE_ENV=development
LOG_LEVEL=info

# Frontend client configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:3000
```

### 4. Install Dependencies & Build Workspace
Install workspace dependencies and link the shared typescript package (`@samayak/types`):
```bash
pnpm install
```

---

## How to Seed the CSE Data

The application provides a two-phase seeding process: seeding the initial database structure (baseline) and ingesting the full curriculum timetable PDF.

### Phase 1: Seed Baseline Database Entities
Before uploading timetables, the database needs core entities (Departments, default Rooms, and Admin/Faculty accounts) to map against. Run the Prisma seed command:
```bash
pnpm --filter @samayak/api db:generate
pnpm --filter @samayak/api db:migrate
pnpm --filter @samayak/api db:seed
```
This seeds the initial data:
* **Departments**: Computer Science & Engineering (CSE), IT, MCA.
* **Rooms**: 219, 220, 301, Lab 1, Lab 2, OOPDP Lab, etc.
* **Faculty accounts**: admin, coordinator, and professor accounts.
* **Timetable slots**: sample schedules for CSE VI A.

### Phase 2: Ingest the Full CSE Timetable PDF (`CSE(8).pdf`)
To populate the database with the complete semester layout:
1. Ensure the **Express Server** and **BullMQ worker** are running (see step below).
2. Open the browser panel at **http://localhost:3000** and log in using the Admin account (`admin@samayak.edu` / `Admin@2024`).
3. Navigate to the **PDF Ingestion** tab in the sidebar.
4. Drag and drop the file `CSE(8).pdf` (located in the workspace parent directory `f:\Anugat AI\CSE(8).pdf`).
5. The worker will trigger, process the pages via Tesseract OCR/Direct extraction, and compile the entire database entries in the background while displaying progress.

*(Alternatively, you can run the cURL commands in the E2E verification section below to trigger and poll the ingestion parser directly).*

---

## Start the Applications

Run the following scripts in separate terminals:

```bash
# Terminal 1: Spin up the API server (Port 4000) and Next.js UI (Port 3000)
pnpm dev

# Terminal 2: Spin up the BullMQ queue worker to process the timetable PDFs
pnpm --filter @samayak/api worker
```

---

## Demo Credentials

You can log in to the admin panel with the following seeded credentials:

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@samayak.edu` | `Admin@2024` | Complete system control (PDF upload, db resets, full analytics) |
| **COORDINATOR** | `coordinator@samayak.edu` | `Coord@2024` | Operations control (manage departments, courses, faculty, and rooms) |
| **PROFESSOR** | `vkb@samayak.edu` | `Samayak@2024` | View-only dashboard and schedule lists |

---

## E2E Verification & Ingestion Smoke Test

To verify the parser, worker, database transaction integrations, and analytics cache invalidation without running the frontend UI, follow these steps using `curl`:

### 1. Authenticate & Obtain Token
Log in as the admin user to retrieve your JWT access token:
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@samayak.edu",
    "password": "Admin@2024"
  }'
```
*Save the `token` string returned in the response.*

### 2. Ingest Timetable PDF
Queue the `CSE(8).pdf` timetable for ingestion (replace `YOUR_JWT_TOKEN` with the token from Step 1, and supply the path to the PDF):
```bash
curl -X POST http://localhost:4000/api/timetable/ingest \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "pdf=@../CSE(8).pdf"
```
You will receive an instant `202 Accepted` response:
```json
{
  "success": true,
  "data": {
    "jobId": "f7b0e12d-4c8d-4a11-b0db-6e691e84a2cb",
    "status": "QUEUED",
    "message": "PDF queued for processing. Poll /api/timetable/job/:id for status."
  }
}
```

### 3. Poll Ingestion Job Status
Check the progress and extraction reports of your job:
```bash
curl -X GET http://localhost:4000/api/timetable/job/JOB_ID_FROM_STEP_2 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
As the worker progresses, the state transitions from `QUEUED` $\rightarrow$ `PARSING` $\rightarrow$ `INTEGRATING` $\rightarrow$ `DONE` (along with a structured JSON report summarizing the new departments, rooms, faculty members, and timetables added to the database).

---

## Log of Key Design & Technical Decisions

Given the **five-day window** constraint for building this system, several key technical choices and trade-offs were made:

### 1. Monorepo Architecture with Shared Types
* **Decision**: Configured a single repository using `pnpm` workspaces, dividing the system into `@samayak/web`, `@samayak/api`, and `@samayak/types`.
* **Trade-off**: Managing monorepos adds slightly more build-tool configuration (such as workspace filters and path aliases), but it saved massive amounts of time during integration. By importing shared TypeScript interfaces and Enums directly from `@samayak/types`, contract mismatches between client requests and server routing were eliminated.

### 2. HTTP Polling over WebSockets (Socket.io)
* **Decision**: Utilized Next.js client-side polling powered by React Query (`refetchInterval` on job query hooks) instead of establishing full WebSockets.
* **Trade-off**: While WebSockets provide instantaneous client push notifications, configuring socket handshakes, heartbeat mechanisms, and origin checks across Vercel and Railway adds overhead. Short-interval HTTP polling (polling the database state every 2 seconds) provided a bulletproof, stateless, and simple architecture that works under standard API gateway rate limits with zero configuration.

### 3. Dual-Pipeline OCR Parser (Tesseract.js WebAssembly)
* **Decision**: Programmed a custom parsing pipeline that attempts vector PDF direct reading first and falls back to running `tesseract.js` directly within Node.js.
* **Trade-off**: External cloud OCR APIs (like Google Cloud Vision or AWS Textract) are significantly faster and highly optimized. However, integrating external cloud accounts introduces setup overhead, billing, and API credential management. Tesseract.js (running WebAssembly in local threads) was chosen to make the project self-contained and run locally on any developers' computer out of the box.

### 4. Custom CSS Layout System over Tailwind CSS or Component Libraries
* **Decision**: Designed the UI with a custom Vanilla CSS styling system (defined inside `globals.css`) rather than bringing in Tailwind CSS or UI component libraries (like shadcn/ui).
* **Trade-off**: Component libraries allow rapid component building, but often lead to large dependency footprints and a look that feels generic. Writing custom Vanilla CSS utilizing modern variables allowed the creation of custom visualizations (such as the room utilization heatmap grid and radial charts) with pixel-perfect aesthetics, zero configuration compiler struggles, and fast page load times.

### 5. PostgreSQL Database with Transaction Blocks
* **Decision**: Selected PostgreSQL over MongoDB, using relational constraints and Prisma transaction blocks (`tx`) to integrate entities.
* **Trade-off**: NoSQL databases handle raw JSON structures gracefully. However, timetable schedules are highly relational (slots depend on rooms, courses, branches, and faculty). If a parsing job fails halfway through, a relational transaction guarantees a clean rollback. Prisma `$transaction` blocks were utilized in `worker.ts` to ensure that data integration is atomic.

---

## Deployment Reference

| Service | Platform | Configuration Details |
| :--- | :--- | :--- |
| **Next.js Web App** | Vercel | Set root directory to `apps/web/`. Configure environment variables: `NEXT_PUBLIC_API_URL`. |
| **Express API Server** | Railway | Deploy using `apps/api/Dockerfile`. Expose port `4000`. Set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NODE_ENV=production`. |
| **BullMQ Worker** | Railway | Deploy as a separate service running the start script: `node dist/worker.js`. |
| **Database** | PostgreSQL | Deployed on AWS RDS, Supabase, or Railway. Run `prisma migrate deploy` in build hooks. |
| **Queue Store** | Upstash Redis | Secure `rediss://` TLS cluster connection string. |

---

## Repository Structure

```
samayak-admin/
├── docker-compose.yml       # Local PostgreSQL + Redis configurations
├── package.json             # Root monorepo workspace dependencies & commands
├── pnpm-workspace.yaml      # Monorepo packages layout configuration
├── apps/
│   ├── api/                 # Express REST API & Queue Workers
│   │   ├── prisma/          # Prisma schema definition & seed migrations
│   │   ├── src/
│   │   │   ├── index.ts     # API server bootstrap
│   │   │   ├── worker.ts    # BullMQ worker listening for PDF jobs
│   │   │   ├── routes/      # REST API endpoints (analytics, auth, timetable, etc.)
│   │   │   ├── services/    # Heavy lifters (pdfParser, analytics calculator)
│   │   │   ├── middleware/  # JWT Auth guards, error logs, request trackers
│   │   │   └── lib/         # Prisma client, Winston logger, Redis connection pools
│   │   └── package.json
│   └── web/                 # Next.js 15 Client Admin Dashboard
│       ├── src/
│       │   ├── app/         # App router pages (dashboard, pdf-ingestion, tables)
│       │   ├── components/  # Providers, Toast context elements
│       │   ├── lib/         # Axios wrapper config for backend routes
│       │   └── store/       # Zustand auth stores
│       └── package.json
└── packages/
    └── types/               # Shared TypeScript models (Room, Course, Job types)
```

---

## License

Private Repository. All Rights Reserved. © 2026 Anugat AI.
