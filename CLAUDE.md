# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Contexto del negocio

**Bacona** es el sistema operativo del restaurante BCN (Argentina).

**Equipo:**
- **Gimena Sánchez** — dueña y gerente. Vive en Salta, visita el restaurante 1-2 veces por mes (~1 semana cada vez). Ella programa y mantiene el sistema.
- **Pio** — socio. Necesita acceso remoto para ver ventas, consolidado de caja, cuentas corrientes, etc.
- **Personal del local** — usan el sistema día a día en el restaurante (POS, caja, stock, compras).

**Regla de diseño:** la UI es para personal no técnico. Botones claros, flujos sin ambigüedad. Sin chat agents ni comandos de texto para el personal.

---

## Deployment

**Producción: Railway** — App en `baconagsd.up.railway.app`. Next.js + PostgreSQL managed, accesible desde cualquier dispositivo con internet.

- El personal del restaurante accede desde el local (requiere internet en el local).
- Gimena y Pio acceden remotamente desde cualquier browser.
- Base de datos: PostgreSQL en Railway. Migraciones se ejecutan automáticamente al deploy (`npx prisma migrate deploy && npm start` en `railway.json`).
- Backups automáticos configurados en Railway; backup manual via `pg_dump` a MEGA como capa adicional.

**Entorno local (desarrollo):** Docker + PostgreSQL en `localhost:5432`. Arrancar con `docker compose up -d` antes de `npm run dev`.

---

## Estado del MVP (mayo 2026)

**Módulos con código completo:**
- POS (mostrador / mesa / reserva, modificadores, métodos de pago)
- Cierre de caja (sesiones por turno, sobre, Caja BCN)
- Consolidado de cierres históricos
- Cuentas corrientes (clientes corpo)
- Stock (dashboard semáforo, movimientos)
- Producción, Compras, Mermas
- Seed completo con datos reales (7 empleados, 13 mesas, 41 proveedores, ~80 productos, 11 clientes CC)

**Pendiente antes de producción completa:**
- Testing de flujos completos con datos reales
- Arranque automático en Windows (PM2 o .bat en Startup) — solo si se decide mantener copia local también

**Post-MVP:**
- Login con PIN por empleado
- Importar 195 recetas desde Google Sheets (descuento automático de stock al vender)
- Endpoints `/api/agent/` para reconectar el agente Python (BCN_IA) a esta base en lugar de Google Sheets
- Reportes y P&L

---

## Commands

```bash
# Development
npm run dev               # Start Next.js dev server

# Database
npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:migrate    # Run pending migrations (dev only)
npm run prisma:studio     # Open Prisma Studio (DB browser)
npm run db:seed           # Seed the database

# Build & lint
npm run build
npm run lint
```

**Prerequisites:** PostgreSQL must be running. Start with `docker compose up -d`. Connection string in `.env` as `DATABASE_URL` (see `.env.example`).

---

## Architecture

Next.js App Router + Prisma + PostgreSQL. Each business domain lives in two parallel trees:

```
src/app/api/{domain}/        ← API routes (HTTP layer)
src/app/{domain}/            ← UI pages
src/modules/{domain}/
  services/                  ← Static service classes (Prisma queries)
  actions/                   ← Server Actions (form handlers via useActionState)
src/lib/                     ← Shared utilities (prisma client, money helpers)
```

### Patterns

**Services** — static classes with direct Prisma queries, no extra abstraction.

**Server Actions** — async functions used with `useActionState`. Validate with Zod → call service → update cookies → redirect. Return `{ error: string }` on failure.

**API routes** — validate with Zod, delegate to service layer, return `NextResponse.json()`.

**Client fetches** — plain `fetch` with `content-type: application/json`, no wrapper library.

**Session** — HTTP-only cookies (`bcn_cashSessionId`, `bcn_employeeId`, `bcn_shift`, `bcn_role`). No auth library; managed manually in Server Actions via `next/headers`. On session close, cookies are cleared (`maxAge=0`).

**Roles de empleado** (`EmployeeRole` enum):

| Rol | Acceso |
|-----|--------|
| `ASOCIADO` | POS, Cierre de caja (propio turno) |
| `CAJA_LOCAL` | Todo ASOCIADO + Caja BCN + apertura de sobres |
| `GERENCIA` | Todo + Consolidado completo + control de sobres |
| `ADMINISTRATIVO` | Cuentas Corrientes (lectura) + Consolidado (lectura), sin POS ni caja |

**UI** — Tailwind CSS only, no component library. No global state library; local `useState`/`useEffect` plus cookies for session state.

---

## Financial rules

- **All monetary values in integer cents (ARS). Never floats.**
- Use `formatArsFromCents()` for display, `assertIntCents()` for validation.
- Currency: ARS (Argentine Peso).

---

## Business domains

### POS (`ventas_pos`)

UI similar to McDonald's POS: category tabs → product grid (combos and individual products) → modifiers → cart sidebar.

**Sale types:**
- **Mostrador**: requires payment to confirm.
- **Mesas**: confirm order first, pay when done consuming.
- **Reservas**: schedule with date/time.

All types allow selecting a customer/cuenta corriente; otherwise require customer name.

**Payment methods:** efectivo, tarjeta de crédito, tarjeta de débito, transferencia, QR, cuenta corriente, cuentas internas (employee accounts — 80% of product price impacts employee salary).

**Stock integration:**
- `onSaleConfirmed(saleId)` is the trigger point for stock (recommended default).
- A product links to stock in one of two ways (mutually exclusive):
  - **Direct**: `product.inventoryItemId` → 1:1 deduction (resale items: drinks, snacks).
  - **By recipe**: `product.consumptionRecipeVersionId` → deducts recipe inputs (transformed items: sandwiches, combos).
  - If no link, the product does **not** impact stock (must be explicit).
- One `StockMovement` of type `SALE` per confirmed sale, idempotent by `posSaleId`.
- Cancellations after stock impact → create compensatory movement (never delete).

All sales also impact `CashSession` (cierre de caja).

---

### Cierre de Caja (`caja` / `cierres_de_caja`)

- One `CashSession` per `businessDate + shift + employee`. Not cumulative across shifts or days.
- The session shows: sales breakdown by payment method, stock movement summary, local expenses.
- Cuenta corriente and cuentas internas payments show expandable detail (customer/employee name + amount).
- **Expected envelope amount** = `totalCashCents(EFECTIVO) − totalShiftCashExpensesCents`.
- On close: snapshot totals are persisted in `CashSession` (`totalIncomeCents`, `totalExpensesCents`, `totalNetCents`, `total*` per method).
- On close, the associate creates an envelope (Sobre) deposit.

---

### Egresos Locales (`egresos_locales`)

Associates can pay for supplies and services using shift cash or Caja BCN.

Each expense records: amount, date, category, description, supplier, and payment method (`SHIFT_CASH` or `LOCAL_CASH`/Caja BCN).

- **SHIFT_CASH**: deducted from the shift's estimated envelope amount.
- **LOCAL_CASH (Caja BCN)**: impacts the Caja BCN balance.

If shift cash is insufficient, the associate can request a cash extraction from the Caja BCN manager.

---

### Sobres (`sobres`)

A Sobre represents the physical cash deposit from one shift. 1:1 with a `CashSession`.

**Calculation (server-side, cents):**
`expectedAmountCents = totalCashCents(EFECTIVO) − totalShiftCashExpensesCents`

Never include in the envelope: cards (debit/credit), transfers, QR, cuenta corriente, cuentas internas, or expenses paid from Caja BCN.

**State machine:** `CLOSED → OPENED → CONTROLLED / NOT_CONTROLLED`

- `CLOSED`: generated/labeled, not yet opened administratively.
- `OPENED`: opened (e.g. to fund Caja BCN). Must record `openedAt`, `openedByEmployeeId`, and create a `LocalCashMovement IN` with `sourceType=ENVELOPE_OPENING`.
- `CONTROLLED`: audited and matches expected amount (set `actualAmountCents`).
- `NOT_CONTROLLED`: audited and does not match (set `actualAmountCents`).

Rules: max one Sobre per `CashSession`. `envelopeCode` must be unique and user-visible for physical labeling.

---

### Caja BCN (`caja_bcn`)

The Caja BCN manager holds envelopes in custody. When a purchase/payment need arises:

1. Manager checks current Caja BCN balance.
2. If needed, opens an existing Sobre → marks it `OPENED` → creates `LocalCashMovement IN` (source: `ENVELOPE_OPENING`).
3. Cash is handed out. The expense (`egreso_local`) is recorded with payment method `LOCAL_CASH` → creates `LocalCashMovement OUT`.
4. Change and leftover opened-envelope cash return to Caja BCN balance.

Purchases made with Caja BCN cash can be linked to stock to register incoming goods.

---

### Stock (`stock`)

**Stock is a ledger — never edit records directly.**

- Current stock = `SUM(entries) − SUM(exits)` from `StockMovement` lines.
- Errors → create a compensatory movement (never delete).
- Movements from other entities (sales, purchases, production) must be **idempotent** via unique `externalKey`.

**Inventory locations:** `Salta` (origin) → `EnTransito` → `Bacona` (consumption/sales).

Each `InventoryItem` has one unit (UN/KG/L/etc). All movements use that unit — no automatic conversions.

**Dashboard traffic light (per item, per location):**
- Verde: stock ≥ 100% of `RecommendedQty`
- Amarillo: 70–99%
- Rojo: < 70%

`RecommendedQty = avgDailyOutflow(last 90 days) × targetDaysCover`

`avgDailyOutflow` at Bacona includes: sales + production consumption + losses (OUT).

---

### Compras (`compras`)

A `Purchase` records an invoice/remito with `PurchaseLine` items. Two types:

- **`APROVISIONAMIENTO`**: large purchase (usually in Salta) → `StockMovement IN` at `Salta` (or `EnTransito` if already shipped). On receive at Bacona → `StockMovement TRANSFER` (OUT Salta/EnTransito + IN Bacona).
- **`IN_SITU`**: local purchase (San Antonio) → `StockMovement IN` at `Bacona` directly.

---

### Recetas y Producción (`produccion`)

**Recipes** define inputs (stock exits) and outputs (stock entries), versioned (`Recipe → RecipeVersion → RecipeLine`).

- **Producción** (baker): inputs → outputs (e.g. flour → bread).
- **Consumo por venta**: inputs only (e.g. sandwich consumes bread + ham + tomato, no outputs).

`ProductionBatch` flow:
1. Draft batch → auto-loads recommended quantities from recipe.
2. Override allowed: quantities, inputs, outputs.
3. All deviations must be auditable: `deviationFlag`, `deviationReason`, snapshot of real vs recommended lines.
4. On confirm → `StockMovement OUT` for real inputs + `StockMovement IN` for real outputs.
5. On cancel/correction → compensatory movement (no deletes).

---

### Pérdidas / Mermas (`mermas`)

Every loss is a stock OUT with a mandatory reason:
- `DURING_PRODUCTION`, `DURING_SALE_PREP`, `SPOILED`, `OTHER`

Losses can be captured in context (from Producción or POS) or via a manual merma screen.

---

### Consolidado de Cierres (`consolidado_cierres`)

Historical view of closed sessions, showing per-row: `businessDate`, `shift`, employee, amounts by payment method, expenses, net total, associated Sobre + status.

Data source: snapshot persisted in `CashSession` at close time (single source of truth).

**Role-based access:**
- `ASOCIADO`: own current shift only (no consolidado access).
- `CAJA_LOCAL`: access to Caja BCN + envelope opening.
- `GERENCIA`: full consolidado + envelope control.
- `ADMINISTRATIVO`: read-only access to consolidado (same view as GERENCIA, no envelope actions).

Admin actions on envelopes (state changes) are auditable.

---

### Cuentas Corrientes (`cuentas_corrientes`)

Linked to the customers module. Each account is either 15-day or 30-day billing cycle.

Dashboard shows (total + expandable per account):
- **Factura próxima**: consumption in the current period (not yet billed).
- **Facturado**: billed, within payment deadline.
- **Mora**: overdue (past estimated payment date).

Each invoice record tracks: billing date, applicable period, IVA Exento (Y/N), IVA discriminado, billing amount, estimated payment date, digital invoice attachment, estimated bank withholdings (0.94%), estimated bank fees (2.5%). Invoices have paid/unpaid toggle buttons.

---

### User Session

- User icon and platform header are always visible across all views.
- Header provides: close session + settings.
- Opening a session starts a shift and opens a `CashSession`.