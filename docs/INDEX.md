# Carnival Job Runner — Master Documentation Index

Welcome to the central documentation index for **Carnival Job Runner**. This directory contains atomic specifications designed for **Spec-Driven Development (SDD)** and instant AI context acquisition.

> **Navigation Shortcuts**:
> [**Quickstart Guide**](file:///home/osvaldev/Documents/carnival/job-runner/docs/QUICKSTART.md) | [**Workflow & Change Matrix**](file:///home/osvaldev/Documents/carnival/job-runner/docs/WORKFLOW.md) | [**AI Agent Protocol**](file:///home/osvaldev/Documents/carnival/job-runner/AGENTS.md) | [**Project README**](file:///home/osvaldev/Documents/carnival/job-runner/README.md)

---

## 1. System Architecture Topology

The following diagram outlines the entire system network: the scheduler daemon triggers decoupled tasks, which acquire MSSQL database connections, extract records, transform them into strongly typed payloads, and push them to external REST APIs.

```mermaid
graph TD
    DAEMON["src/index.ts (Daemon Process)"]
    SCHED["ARCH-01: Scheduler Manager"]
    DB["ARCH-02: Database Connection Engine"]
    LOG["ARCH-03: Logging & Audit Subsystem"]

    DAEMON --> SCHED
    DAEMON --> LOG

    subgraph Tasks ["ETL Task Layer"]
        T1["TASK-01: updateInventory<br/>(Cron: 0 7,12 * * 1-5)"]
        T2["TASK-02: updateDimensions<br/>(Cron: 0 6 * * 1-5)"]
        T3["TASK-03: livedashPush<br/>(Cron: */15 8-19 * * 1-5)"]
        T4["TASK-04: logbookUpdateDB<br/>(Cron: 0 13,19 * * 1-5)"]
        T5["TASK-05: stylesAge<br/>(Cron: 0 22 * * 5)"]
    end

    subgraph Storage ["Data Sources (MSSQL / HTTP)"]
        MSSQL_CTRL[("CTRLINVENT<br/>CCVW_INVENMAYV3 / inventsum")]
        MSSQL_AX[("Dynamics AX<br/>ECORESPRODUCT / OVS / SALESTABLE")]
        MSSQL_LOCAL[("SeguimientoPedidos<br/>DetalleOrdenEnvio")]
        HTTP_LOCAL["Local Metrics Source<br/>(http://170.1.1.10:8012)"]
    end

    subgraph Targets ["Destination APIs"]
        API_STYLES["Styles API<br/>(/inventory/fill, /style/sizes, /style/colors)"]
        API_LIVEDASH["LiveDash Central API<br/>(/api/livedash)"]
        API_SYNC["Courier Sync API<br/>(/orders, /order-detail, /order-status)"]
        API_STYLES_AGE["Styles Age API<br/>(STYLES_AGE_API_URL)"]
    end

    SCHED -.->|Triggers| T1
    SCHED -.->|Triggers| T2
    SCHED -.->|Triggers| T3
    SCHED -.->|Triggers| T4
    SCHED -.->|Triggers| T5

    DB ==>|Injects Pool| T1
    DB ==>|Injects Pool| T2
    DB ==>|Injects Pool| T4
    DB ==>|Injects Pool| T5

    T1 --- MSSQL_CTRL
    T2 --- MSSQL_AX
    T3 --- HTTP_LOCAL
    T4 --- MSSQL_AX
    T4 --- MSSQL_LOCAL
    T5 --- MSSQL_CTRL

    T1 ==>|POST| API_STYLES
    T2 ==>|POST| API_STYLES
    T3 ==>|POST| API_LIVEDASH
    T4 ==>|POST| API_SYNC
    T5 ==>|POST| API_STYLES_AGE

    T1 -.->|Appends| LOG
    T2 -.->|Appends| LOG
    T3 -.->|Appends| LOG
    T4 -.->|Appends| LOG
    T5 -.->|Appends| LOG
```

---

## 2. Master Node Registry

Use this registry to immediately jump to the exact specification you need.

### Architectural Nodes (`docs/arch/`)

| Node ID | Subsystem Name | Primary Files | Upstream / Driver | Downstream Consumers |
| :--- | :--- | :--- | :--- | :--- |
| [ARCH-01](file:///home/osvaldev/Documents/carnival/job-runner/docs/arch/ARCH-01-SCHEDULER.md) | **Scheduler & Process Lifecycle** | [`src/index.ts`](file:///home/osvaldev/Documents/carnival/job-runner/src/index.ts)<br>[`src/scheduler/*`](file:///home/osvaldev/Documents/carnival/job-runner/src/scheduler/index.ts) | Node.js, `node-cron`, PM2 | All tasks in `src/tasks/*` |
| [ARCH-02](file:///home/osvaldev/Documents/carnival/job-runner/docs/arch/ARCH-02-DATABASE.md) | **MSSQL Database Engine** | [`src/config/database.ts`](file:///home/osvaldev/Documents/carnival/job-runner/src/config/database.ts)<br>[`src/config/env.ts`](file:///home/osvaldev/Documents/carnival/job-runner/src/config/env.ts) | `mssql` pool driver | `TASK-01`, `TASK-02`, `TASK-04`, `TASK-05` |
| [ARCH-03](file:///home/osvaldev/Documents/carnival/job-runner/docs/arch/ARCH-03-LOGGING.md) | **Logging & Audit Subsystem** | [`src/utils/logger.ts`](file:///home/osvaldev/Documents/carnival/job-runner/src/utils/logger.ts) | Node `fs`, `console` | All tasks and scheduler |

### Task Specification Nodes (`docs/tasks/`)

| Node ID | Task Name | Status | Cron Expression | Source File(s) | Primary Output Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [TASK-01](file:///home/osvaldev/Documents/carnival/job-runner/docs/tasks/TASK-01-UPDATE-INVENTORY.md) | **Inventory Sync** | Active | `0 7,12 * * 1-5` | [`src/tasks/updateInventory/*`](file:///home/osvaldev/Documents/carnival/job-runner/src/tasks/updateInventory/index.ts) | `STYLES_API_BASE_URL/inventory/fill` |
| [TASK-02](file:///home/osvaldev/Documents/carnival/job-runner/docs/tasks/TASK-02-UPDATE-DIMENSIONS.md) | **Product Dimensions & Sizing** | Standby | `0 6 * * 1-5` | [`src/tasks/updateDimensions/*`](file:///home/osvaldev/Documents/carnival/job-runner/src/tasks/updateDimensions/index.ts) | `STYLES_API_BASE_URL/style/sizes`, `/colors` |
| [TASK-03](file:///home/osvaldev/Documents/carnival/job-runner/docs/tasks/TASK-03-LIVEDASH-PUSH.md) | **LiveDash Metrics Push** | Standby | `*/15 8-19 * * 1-5` | [`src/tasks/livedashPush/*`](file:///home/osvaldev/Documents/carnival/job-runner/src/tasks/livedashPush/index.ts) | `LIVEDASH_TARGET_URL` |
| [TASK-04](file:///home/osvaldev/Documents/carnival/job-runner/docs/tasks/TASK-04-LOGBOOK-SYNC.md) | **The Courier (Orders & Logistics)** | Standby | `0 13,19 * * 1-5` | [`src/tasks/logbookUpdateDB/*`](file:///home/osvaldev/Documents/carnival/job-runner/src/tasks/logbookUpdateDB/index.ts) | `SYNC_API_URL/orders`, `/order-detail`, `/order-status` |
| [TASK-05](file:///home/osvaldev/Documents/carnival/job-runner/docs/tasks/TASK-05-STYLES-AGE.md) | **Styles Age Calculation** | Standby | `0 22 * * 5` | [`src/tasks/stylesAge/*`](file:///home/osvaldev/Documents/carnival/job-runner/src/tasks/stylesAge/index.ts) | `STYLES_AGE_API_URL` |

---

## 3. Crontab Execution Schedule Matrix

All cron intervals operate in the local server timezone during regular Mexican workdays (Monday through Friday):

```
06:00 AM  ──► [TASK-02] Update Dimensions (Extracts Master ECORESPRODUCT sizes & colors)
07:00 AM  ──► [TASK-01] Update Inventory (Morning stock synchronization)
08:00 AM  ──► [TASK-03] LiveDash Metrics (Runs every 15 min until 07:00 PM)
12:00 PM  ──► [TASK-01] Update Inventory (Midday stock refresh)
01:00 PM  ──► [TASK-04] The Courier Sync (Midday orders, tracking & packing progress)
07:00 PM  ──► [TASK-04] The Courier Sync (End-of-day orders & invoice reconciliation)
10:00 PM  ──► [TASK-05] Styles Age Calculation (Weekly Friday stock aging)
```

---

## 4. Templates for Extending the System

To maintain architectural integrity, always use the pre-built templates when adding components:
* **New Task / Job Node**: [docs/templates/task-node.template.md](file:///home/osvaldev/Documents/carnival/job-runner/docs/templates/task-node.template.md)
* **New Subsystem / Architecture Node**: [docs/templates/arch-node.template.md](file:///home/osvaldev/Documents/carnival/job-runner/docs/templates/arch-node.template.md)
