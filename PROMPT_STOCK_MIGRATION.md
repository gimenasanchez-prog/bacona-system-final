# Stock Migration Prompt - Real Data from BCN

## Context (Already Done)
✅ **Stock module setup:**
- Stock/Producción accessible to all users (GERENCIA, CAJA_LOCAL, ASOCIADO)
- Inventory entry form at `/stock/entrada` — loads initial stock quantities
- API POST `/api/stock/movements` — creates ADJUSTMENT movements
- Tested with fictional items (Pan, Jamón, Tomate, Coca-Cola)
- Flow works: Entry → Dashboard updates → Production consumes stock → Stock decrements

**Files created/modified:**
- `src/app/page.tsx` — Added Stock/Producción to all roles
- `src/app/stock/entrada/page.tsx` — Inventory entry form
- `src/app/api/stock/movements/route.ts` — POST handler
- `prisma/seed.ts` — Added test data structure

---

## What's Needed Now

### 1. **Real Inventory Items**
**Source:** Need from Gimena (spreadsheet/list)
- Item name, unit (UN/G/KG/ML/L), display unit
- Category (Materia Prima, Bebidas, Descartables, etc)
- Target days cover (default 7-14)
- Current stock quantities (for initial load)

**Expected format:**
```
Nombre | Categoría | Unidad Base | Unidad Display | Qty Inicial | Días Cover
Pan molde | Materia Prima | UN | UN | 50 | 7
Jamón | Materia Prima | G | G | 2000 | 7
Coca-Cola 250ml | Bebidas | UN | UN | 100 | 7
```

### 2. **Product Links (POS → Stock)**
**Current state:** Products in POS catalog exist BUT are not linked to inventory
**Need:** For each product that consumes stock:
- Either: `inventoryItemId` (direct link, e.g. "Coca-Cola 250ml" → consumes 1 Coca-Cola bottle)
- Or: `consumptionRecipeVersionId` (recipe link, e.g. "Sandwich" → consumes recipe ingredients)

**Products to check:**
- Bebidas (direct items)
- Sándwiches (recipes with multiple ingredients)
- Combos (multiple recipes or items)

### 3. **Recipes (Production & Consumption)**
**Two types:**
- **CONSUMPTION**: Used by products in POS (sandwich consumes bread+ham+tomato)
- **PRODUCTION**: Baker recipes (flour → bread, etc)

**Need:**
- Recipe name, kind (PRODUCTION/CONSUMPTION)
- Ingredients (item + quantity + unit)
- Outputs (for PRODUCTION only)

**Example:**
```
Recipe: Sandwich Jamón y Tomate
Kind: CONSUMPTION
Inputs:
  - Pan molde: 2 UN
  - Jamón: 50 G
  - Tomate: 50 G
```

### 4. **UOM (Units of Measure) - Optional**
Presentations like "Botella 750ml", "Pack x6" for entry flexibility
- Only if needed for data entry simplicity

---

## Implementation Steps (Next Session)

1. **Collect Real Data**
   - Gimena provides: Items list + initial quantities
   - Gimena provides: Recipes (consumption + production)
   - Map POS products ↔ inventory items

2. **Create Migration Script**
   - Update `prisma/seed.ts` with real items
   - Create recipes with correct inputs/outputs
   - Link products to items or recipes

3. **Seed Database**
   - `npm run db:seed` — loads all real data
   - Verify dashboard shows correct items

4. **Test Full Flow**
   - Load initial stock (via `/stock/entrada`)
   - Make a POS sale
   - Verify stock decrements by recipe consumption
   - Test merma (loss) workflow

5. **Go Live**
   - Deploy to Railway
   - Mirror production setup with real data

---

## Prompt for Next Session

```
I have real stock data for Bacona system. Help me:

1. Create InventoryItems for all products from this list: [PASTE LIST]
2. Create Recipes for these items: [PASTE RECIPES]
3. Link POS products to inventory (which products use which items/recipes)
4. Update prisma/seed.ts with all real data
5. Test full flow: entry → production → venta → stock deduction

Key files:
- prisma/seed.ts (where to add items + recipes)
- src/app/stock/entrada/page.tsx (inventory entry form)
- src/modules/stock/services/stockMovementService.ts (auto-deduction logic)
- POS products are in CATALOGO array in seed.ts

Make sure:
- All items have correct unit/displayUnit
- Recipes match actual ingredient quantities
- Products correctly linked to items/recipes
```

---

## Data Formats Ready for You

### InventoryItem Template
```typescript
await prisma.inventoryItem.create({
  data: {
    name: "Item Name",
    categoryId: categoryId, // from InventoryCategory
    dimension: "COUNT" | "MASS" | "VOLUME",
    unit: "UN" | "G" | "KG" | "ML" | "L",
    displayUnit: "UN" | "G" | "KG" | "ML" | "L",
    targetDaysCover: 14,
  },
});
```

### Recipe Template
```typescript
await prisma.recipe.create({
  data: {
    name: "Recipe Name",
    kind: "CONSUMPTION" | "PRODUCTION",
    versions: {
      create: {
        version: 1,
        isActive: true,
        lines: {
          create: [
            {
              inventoryItemId: itemId,
              direction: "IN" | "OUT",
              qty: new Prisma.Decimal(50),
              sortOrder: 0,
            },
          ],
        },
      },
    },
  },
});
```

### Product Link to Recipe
```typescript
await prisma.product.update({
  where: { id: productId },
  data: {
    consumptionRecipeVersionId: recipeVersionId, // for consumption recipes
    // OR
    inventoryItemId: itemId, // for direct item consumption
  },
});
```

---

## Questions for Gimena

1. **Where is the real inventory data?** (Google Sheets, Excel, handwritten?)
2. **How many unique items?** (195 recipes mentioned, but how many items?)
3. **Which items are produced vs purchased?**
4. **Current stock quantities today?** (For initial load)
5. **Any UOM presentations** (e.g., "Botella 750ml" vs "1L")?

---

## Files to Reference
- `CLAUDE.md` — Business rules, stock model description
- `prisma/schema.prisma` — Enums (RecipeKind, StockUnit, StockDimension)
- `src/modules/stock/services/stockMovementService.ts` — Auto-deduction logic
- `/api/stock/movements` — Movement API
- `/stock/entrada` — Entry form (ready to use)
