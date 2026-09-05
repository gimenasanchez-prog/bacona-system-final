# Backlog

Deuda técnica y pendientes que Gimena pidió guardar para retomar más adelante. Cuando ella dice "guardalo en backlog" (en cualquier sesión), se agrega una entrada acá — ver convención en `CLAUDE.md`.

---

## 2026-07-24 — Costeo por producto en Compras

**Qué:** el campo "Costo ($)" por línea de producto en `/compras` es referencial — no alimenta ninguna métrica real del sistema (no COGS, no márgenes, no la deuda a proveedor, que desde Fase 2 del módulo de Egresos usa el "Monto total de la factura" en su lugar).

**Por qué quedó pendiente:** Gimena factura por monto total de proveedor, no por costeo preciso producto a producto. Repensar cuando se aborde costeo/margen real por producto — probablemente requiera decidir si el costo se carga por línea, se calcula desde el monto total de la factura repartido proporcionalmente, o se ignora y el costeo viene de otro lado (ej. `ConfigMargenCategoria`, ya usado en Rentabilidad).

---

## 2026-08-14 — Trazabilidad de usuario en Compras

**Qué:** el modelo `Purchase` no guarda `createdByEmployeeId`, a diferencia de otros módulos (egresos, movimientos de stock, pagos a proveedores, etc.). Si una compra queda pendiente de pago (sin `SupplierPayment` asociado), no hay forma de saber qué empleado la cargó — solo timestamp y notas.

**Por qué quedó pendiente:** surgió al investigar una compra de $120.000 a "SAC" (cortadora de fiambres) que Gimena no reconocía; sin dato de usuario, solo se pudo acotar por horario. Agregar `createdByEmployeeId` a `Purchase` (y capturarlo desde la cookie `bcn_employeeId` al crear, como en el resto de los módulos) para cerrar este agujero de auditoría.

---

## 2026-08-14 — Editar precio individual en previsualización de aumento masivo

**Qué:** en `/gerencia/precios`, el aumento masivo por categoría (`PreciosClient.tsx`) muestra una tabla de previsualización con precio actual → precio nuevo calculado, pero el precio nuevo no es editable por producto — solo se puede aceptar el porcentaje aplicado a todos o cancelar.

**Por qué quedó pendiente:** requiere decidir cómo conviven el ajuste manual por fila con el `percent` global (¿se recalcula el resto si se edita una fila?, ¿el override se guarda en la previsualización o se manda distinto al endpoint de aplicar en `/api/gerencia/precios/bulk`?). Retomar cuando se necesite ajustar precios puntuales (redondeo, excepciones) sin salir del flujo de aumento masivo.

---

## 2026-08-25 — Alta de productos desde el front

**Qué:** no existe ningún formulario en la UI para crear un producto nuevo. `/gerencia/precios` solo permite editar nombre/precio/activo de productos existentes (`PATCH /api/gerencia/precios/[id]`); `/stock/admin` solo vincula productos existentes a insumo o receta. El endpoint `/api/pos/products` solo tiene `GET`, no `POST`. Hoy, para agregar un producto hay que hacerlo directo en la base (script tsx contra prod).

**Por qué quedó pendiente:** Gimena prefirió resolver el alta puntual pedida (6 productos nuevos) directo por base para no frenar el pedido. Retomar armando un formulario "Nuevo producto" simple (nombre, categoría, precio, activo) en `/gerencia/precios`, con su `POST` correspondiente.

---

## 2026-09-05 — Descontar consumo de cuentas internas del sueldo fijo a pagar

**Qué:** conectar el consumo de cuentas internas (pagos POS con método "cuenta interna", que impactan el sueldo del empleado) con el flujo de "Marcar pagado" de Horas/empleados con sueldo fijo (`HorasTabClient.tsx`). Hoy el monto a pagar por sueldo fijo no descuenta el consumo del empleado en cuentas internas. Se necesita: monto a pagar = sueldo fijo (u horas) **menos** el consumo en cuentas internas del período, aplicando un 20% de descuento sobre ese consumo (el empleado paga el 80% del precio del producto vía descuento de sueldo).

**Por qué quedó pendiente:** requiere definir cómo se agrega el consumo de cuentas internas por empleado y período (¿mismo corte que el de horas/pago?) antes de poder mostrar el número final a pagar.

---

## 2026-09-05 — Migrar histórico de sueldos de empleados

**Qué:** cargar en Bacona el histórico de sueldos/pagos a empleados que hoy vive afuera del sistema (Google Sheets), para que quede visible junto con `EmployeeHoursPayment`/`EmployeeHoursEntry` en vez de en una planilla aparte.

**Por qué quedó pendiente:** falta definir el formato de origen de esos datos en la planilla y armar el script/flujo de importación (mismo patrón que se usó para importar otros datos legacy desde Sheets).

---

## 2026-09-05 — Módulo de impuestos, unificar retenciones e integrar con ARCA

**Qué:** hoy los impuestos y retenciones están disgregados en varios puntos del sistema sin un módulo central que los administre — ej. `CuentaCorrienteInvoice` tiene sus propios campos de IVA/retenciones (`ivaExento`, `ivaAmountCents`, `ivaRetentionCents`, `gananciasRetentionCents`, `rentasRetentionCents`, `sussRetentionCents`, `tisshRetentionCents`) cargados a mano al facturar/registrar el pago, y `LocalCashMovement` tiene por su lado `bankWithholdingCents`, `bankFeesCents`, `iibbCents`, `taxDebCredCents` en movimientos bancarios — sin relación entre sí ni con ningún cálculo o reporte impositivo consolidado. Se busca: (1) mapear todos los puntos de facturación/pago del sistema que hoy disgregan impuestos/retenciones, (2) unificarlos en un módulo de impuestos propio, y (3) integrar con ARCA (ex AFIP) — hoy `arcaFacturaNumber` es solo un campo de texto libre cargado a mano, sin ninguna conexión real a los servicios de ARCA.

**Por qué quedó pendiente:** es una iniciativa grande y transversal (toca cuentas corrientes, egresos, caja) que requiere primero relevar todos los puntos de disgregación existentes y recién después diseñar el módulo unificado y evaluar qué vía de integración con ARCA usar (webservices de facturación electrónica).
