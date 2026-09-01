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
