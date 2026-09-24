---
id: "TASK-03"
title: "LiveDash Operational Metrics Push"
type: "task"
status: "active"
schedule: "0 */2 * * 1-5" # Mon-Fri every 2 hours
code_files:
  - "src/tasks/livedashPush/index.ts"
  - "src/tasks/livedashPush/cli.ts"
  - "src/tasks/livedashPush/types.ts"
upstream:
  - "docs/arch/ARCH-01-SCHEDULER.md"
  - "docs/arch/ARCH-03-LOGGING.md"
  - "endpoint:LIVEDASH_SOURCE_URL"
downstream:
  - "endpoint:LIVEDASH_TARGET_URL"
---

# TASK-03: LiveDash Operational Metrics Push

## 1. Overview & Business Context
The `livedashPush` worker extracts operational efficiency and packing progress indicators from the factory floor endpoint (Server B on local network `170.1.1.10:8012`) and pushes consolidated snapshots to the central LiveDash monitoring platform (Server A) every 2 hours.

---

## 2. Scheduling & Execution
- **Cron Schedule**: `0 */2 * * 1-5` (Every 2 hours, Mon–Fri)
- **Status**: Enabled in [src/scheduler/schedules.ts](file:///home/osvaldev/Documents/carnival/job-runner/src/scheduler/schedules.ts)
- **On-Demand CLI**: `npm run task:livedash`
- **Direct Entrypoint**: `tsx src/tasks/livedashPush/cli.ts`

---

## 3. Data Flow & Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant Task as livedashPush (index.ts)
    participant B as Factory Server B (170.1.1.10:8012)
    participant A as LiveDash Server A (/api/livedash)
    participant Log as Logger (livedashPush.log)

    Task->>Task: Start execution timer
    par Fan-Out Metric Extraction (Promise.all)
        Task->>B: GET /api/AvanceOEI
        B-->>Task: avanceOei (or { Datos: [] } on fallback)
    and
        Task->>B: GET /api/EficienciaColaborador
        B-->>Task: eficienciaColaborador (or { Datos: [] })
    and
        Task->>B: GET /api/EficienciaOperacion
        B-->>Task: eficienciaOperacion (or { Datos: [] })
    end

    Task->>Task: Assemble LiveDashPayload with timestamp
    Task->>A: POST /api/livedash (Headers: X-LIVEDASH-SYNC-KEY)
    alt Succeeded
        A-->>Task: 200 OK
        Task->>Log: Push Success recorded
    else Failed
        A-->>Task: Error / Timeout
        Task->>Log: Push Failed recorded
    end
```

---

## 4. Extract Contract (Source Server B)

- **Base URL**: `${ENV.API.LIVEDASH_SOURCE_URL}` (Default: `http://170.1.1.10:8012`)
- **Endpoints Fetched**:
  1. `GET /api/AvanceOEI`: Order execution progress
  2. `GET /api/EficienciaColaborador`: Operator efficiency metrics
  3. `GET /api/EficienciaOperacion`: Station efficiency breakdown

### Graceful Fallback Semantics
If any endpoint on Server B is unavailable or times out, the error is isolated with a warning log and defaults to an empty dataset:
```typescript
.catch((err) => {
  logger.warn(`[livedashPush] <Endpoint> request warning: ${err.message}`);
  return { Datos: [] };
})
```

---

## 5. Load Contract (Target LiveDash API)

- **Target URL**: `${ENV.API.LIVEDASH_TARGET_URL}` (Default: `http://localhost:3000/api/livedash`)
- **Authentication**: `X-LIVEDASH-SYNC-KEY: ${ENV.API.LIVEDASH_SYNC_KEY}`
- **Timeout**: 10,000 ms (10 seconds)
- **Payload Schema (`LiveDashPayload`)**:
  ```json
  {
    "avanceOei": { "Datos": [] },
    "eficienciaColaborador": { "Datos": [] },
    "eficienciaOperacion": { "Datos": [] },
    "pushedAt": "2026-09-10T15:00:00.000Z"
  }
  ```

---

## 6. Invariants & Failure Resilience
- **Network Isolation**: Failure of a single metric endpoint does not halt the overall snapshot push.
- **Request Timeout**: The POST request enforces a strict 10-second timeout to avoid lingering hung sockets.
- **Audit Records**: All outcomes (success response or HTTP error codes) are appended to `logs/livedashPush.log`.
