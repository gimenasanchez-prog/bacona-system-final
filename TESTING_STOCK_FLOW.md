# Test Plan: Stock Entry → Production → Sale Flow

## Setup ✅
- **DB**: PostgreSQL seeded con 4 items ficticios
  - Pan tostado (UN)
  - Jamón cocido (G)
  - Tomate (G)
  - Coca-Cola 250ml (UN)
- **Receta**: "Sandwich Jamón y Tomate" creada (2x pan + 50g jamón + 50g tomate)
- **Usuarios**: Gimena (GERENCIA), Yanet (CAJA_LOCAL), Noelia (ASOCIADO)
- **Dev Server**: Running on `http://localhost:3000`

---

## Test Steps

### 1️⃣ Login as Gimena (GERENCIA)
- Navega a `http://localhost:3000`
- Click "Gimena" (Gerencia)
- Deberías ver:
  - Botones: **Consolidado de Caja**, **Caja BCÑ**, **Stock**, **Compras**, **Producción**, **Mermas**

### 2️⃣ Go to Stock Dashboard
- Click **Stock**
- Deberías ver:
  - Dashboard semaforizado (vacío, sin stock aún)
  - Botón **"Entrada de stock"** + "Ver movimientos"
  - Sidebar con "Carga rápida"

### 3️⃣ Load Initial Inventory
- Click **"Entrada de stock"**
- **Cargar:**
  - Pan tostado: **20** UN
  - Jamón cocido: **1000** G
  - Tomate: **1000** G
  - Coca-Cola: **50** UN
- Click **"Confirmar entrada de stock"**
- ✅ Deberías ver mensaje de éxito
- Stock debería aparecer como **GREEN** en dashboard (por encima del mínimo)

### 4️⃣ Check Movements
- Volver a Stock
- Click **"Ver movimientos"**
- Deberías ver un movimiento tipo **ADJUSTMENT** con notas "INVENTORY_COUNT" y las 4 líneas

### 5️⃣ Create a Production (Manual entry)
- Click **Producción**
- Debería mostrar formulario con tabla vacía
- Agregar línea: 
  - **Direction**: OUT (salida/consumo)
  - **Ítem**: Jamón cocido
  - **Cantidad**: 100 G
- Click **"+ Agregar línea"**
- Agregar segunda línea:
  - **Direction**: OUT
  - **Ítem**: Pan tostado
  - **Cantidad**: 4 UN
- Click **"Confirmar producción"**
- ✅ Deberías ver éxito
- Stock debería **DECREMENTARSE**:
  - Jamón: 1000 → 900
  - Pan: 20 → 16

### 6️⃣ Verify Stock Update
- Volver a Stock
- Dashboard debería mostrar:
  - Pan tostado: 16 UN
  - Jamón: 900 G
  - Tomate: 1000 G (sin cambios)
  - Coca-Cola: 50 UN (sin cambios)

### 7️⃣ Test with CAJA_LOCAL (Yanet)
- Logout (botón "Cambiar usuario")
- Click **Yanet** (CAJA_LOCAL)
- Deberías ver:
  - Stock, Producción, Mermas accesibles (NEW)
  - Pueda hacer entrada de stock igual

### 8️⃣ Test with ASOCIADO (Noelia)
- Logout
- Click **Noelia** (ASOCIADO)
- Deberías ver:
  - Stock, Producción, Mermas accesibles (NEW)
  - Acceso igual a CAJA_LOCAL

---

## Success Criteria ✅
- [ ] Entry form carga ítems correctamente
- [ ] Stock entry crea movimiento ADJUSTMENT
- [ ] Dashboard semaforizado actualiza después de entrada
- [ ] Producción descuenta stock automáticamente
- [ ] Stock/Producción visible para todos los roles
- [ ] Sin errores en consola

---

## Files Modified
- `src/app/page.tsx` — Added Stock/Producción links to CAJA_LOCAL & ASOCIADO
- `src/app/stock/page.tsx` — Added "Entrada de stock" link
- `src/app/stock/entrada/page.tsx` — NEW inventory entry form
- `src/app/api/stock/movements/route.ts` — Added POST handler
- `prisma/seed.ts` — Added stock locations, categories, items, recipe

---

## Dev Server Commands
```bash
# Start dev server
npm run dev

# Seed database (already done)
npm run db:seed

# View database
npm run prisma:studio
```

---

## Notes
- Items are fictional, purely for testing
- After testing, keep setup for future data import
- Production auto-deduction is managed by `StockMovementService.ensureSaleMovement`
- Recipe version uniqueness: `(recipeId, version)` pair is unique
