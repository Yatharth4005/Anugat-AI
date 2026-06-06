# Samayak Admin — Academic Operations & Analytics System

> A full-stack academic scheduling, room utilization, and curriculum analytics engine for universities, built with Next.js 15, Express, Prisma ORM, PostgreSQL, Redis, BullMQ, and Tesseract.js OCR.

---

Deployed Link: https://anugat-ai-nine.vercel.app/

## Architecture Overview

Samyak Admin is engineered to handle complex, resource-intensive PDF parsing and OCR ingestion flows asynchronously. Decoupling file ingestion from HTTP request-response cycles prevents server timeouts and ensures a smooth UI experience.

```mermaid
flowchart TD
    subgraph Client ["Next.js Frontend (Port 3000)"]
        UI["Admin Panel UI"]
        Poll["Job Progress Poller (every 2s)"]
    end

    subgraph API ["Express Server (Port 4000)"]
        Gateway["Express Router"]
        QueueClient["BullMQ Ingestion Queue Client"]
    end

    subgraph DB ["Data & Queue (Local Docker / Production)"]
        RedisDb[("Redis Queue Store")]
        PostgresDb[("PostgreSQL DB (Prisma)")]
        CacheTable[("Analytics Cache Table")]
    end

    subgraph Worker ["BullMQ Worker (Port 4000)"]
        Parser["PDF Parsing Pipeline"]
        Integrator["Entity Integration Router"]
    end

    UI -->|1. Upload Timetable PDF| Gateway
    Gateway -->|2. Create ImportJob (QUEUED)| PostgresDb
    Gateway -->|3. Enqueue Ingestion Job| QueueClient
    QueueClient -->|4. Store Job Payload| RedisDb
    Gateway -->|5. Respond 202 Accepted + Job ID| UI
    
    UI -->|6. Start Polling| Poll
    Poll -->|7. Query Job Status| Gateway
    Gateway -->|8. Fetch Job Record| PostgresDb
    
    RedisDb -.->|9. Dequeue Job| Parser
    Parser -->|10. Extract raw text & OCR| Parser
    Parser -->|11. Ingest & Upsert records| Integrator
    Integrator -->|12. Transaction commits| PostgresDb
    Integrator -->|13. Invalidate & Recompute| CacheTable
    Integrator -->|14. Mark Job as DONE/FAILED| PostgresDb
```

## Tech Stack & Key Features

* **Monorepo Structure**: Managed with `pnpm` workspaces (frontend, api, and shared `@samayak/types`).
* **Frontend**: Next.js 15, TanStack React Query, Zustand, and Recharts.
* **Backend**: Node.js, Express, Prisma ORM, and PostgreSQL.
* **Background Jobs**: BullMQ and Redis for asynchronous queue processing.
* **OCR & Ingestion**: Tesseract.js WebAssembly OCR, PDF.js, and Sharp.
* **Analytics**: Room utilization statistics, empty-hour calculations, and schedule gaps.

---

## Key Technical Challenges & Approach

* **Fuzzy OCR Normalization**:
  * *Challenge*: Timetable scans often suffer from character corruption (e.g. `CS2205` parsed as `COSAS`).
  * *Approach*: Built a regex-based Normalizer Engine that translates fuzzy OCR outputs back to correct academic codes.
* **CPU-Bound Ingestion & Timeouts**:
  * *Challenge*: OCR on multi-page PDFs blocks the Express event loop and triggers gateway timeouts.
  * *Approach*: Implemented a background job queue (Redis + BullMQ) responding instantly with `202 Accepted` while workers handle the PDF processing.
* **Expensive Dashboard Calculations**:
  * *Challenge*: Generating university-wide statistics across thousands of timetable slots is slow.
  * *Approach*: Designed a write-through caching layer using a dedicated PostgreSQL cache table, invalidating and recomputing analytics on data changes.

---

## Local Setup & Installation

### Prerequisites
- **Node.js** v20+
- **pnpm** v9+
- **Docker Desktop** (for running local PostgreSQL & Redis)

### 1. Launch Infrastructure
Run local PostgreSQL and Redis instances:
```bash
docker compose up -d
```

### 2. Configure Environment Variables
Copy the example variables file in the root directory:
```bash
cp .env.example .env
```

### 3. Install & Build
Install workspace dependencies and link packages:
```bash
pnpm install
```

### 4. Seed the Database
Initialize the database structure and populate core seed entities:
```bash
pnpm --filter @samayak/api db:generate
pnpm --filter @samayak/api db:migrate
pnpm --filter @samayak/api db:seed
```

### 5. Start the Applications
Run these scripts in separate terminals:
```bash
# Terminal 1: Starts Next.js frontend (Port 3000) and Express server (Port 4000)
pnpm dev

# Terminal 2: Starts BullMQ queue worker
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

## License

Private Repository. All Rights Reserved. © 2026 Anugat AI.
