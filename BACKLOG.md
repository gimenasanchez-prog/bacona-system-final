# Backlog

Deuda técnica y pendientes que Gimena pidió guardar para retomar más adelante. Cuando ella dice "guardalo en backlog" (en cualquier sesión), se agrega una entrada acá — ver convención en `CLAUDE.md`.

---

## 2026-07-24 — Costeo por producto en Compras

**Qué:** el campo "Costo ($)" por línea de producto en `/compras` es referencial — no alimenta ninguna métrica real del sistema (no COGS, no márgenes, no la deuda a proveedor, que desde Fase 2 del módulo de Egresos usa el "Monto total de la factura" en su lugar).

**Por qué quedó pendiente:** Gimena factura por monto total de proveedor, no por costeo preciso producto a producto. Repensar cuando se aborde costeo/margen real por producto — probablemente requiera decidir si el costo se carga por línea, se calcula desde el monto total de la factura repartido proporcionalmente, o se ignora y el costeo viene de otro lado (ej. `ConfigMargenCategoria`, ya usado en Rentabilidad).
