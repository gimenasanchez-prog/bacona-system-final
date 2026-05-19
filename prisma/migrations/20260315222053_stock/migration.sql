-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('UN', 'KG', 'G', 'L', 'ML');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('SALE', 'PURCHASE', 'PRODUCTION', 'LOSS', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockMovementDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('APROVISIONAMIENTO', 'IN_SITU');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipeKind" AS ENUM ('PRODUCTION', 'CONSUMPTION');

-- CreateEnum
CREATE TYPE "LossReasonType" AS ENUM ('DURING_PRODUCTION', 'DURING_SALE_PREP', 'SPOILED', 'OTHER');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "consumptionRecipeVersionId" TEXT,
ADD COLUMN     "inventoryItemId" TEXT;

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "targetDaysCover" INTEGER NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RecipeKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "recipeVersionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "direction" "StockMovementDirection" NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "recipeVersionId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviationFlag" BOOLEAN NOT NULL DEFAULT false,
    "deviationReason" TEXT,
    "recommendedSnapshot" JSONB,
    "actualSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatchLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "direction" "StockMovementDirection" NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductionBatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "type" "PurchaseType" NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "locationId" TEXT NOT NULL,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unitCostCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossEvent" (
    "id" TEXT NOT NULL,
    "reasonType" "LossReasonType" NOT NULL,
    "locationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LossEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossEventLine" (
    "id" TEXT NOT NULL,
    "lossEventId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LossEventLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "posSaleId" TEXT,
    "purchaseId" TEXT,
    "productionBatchId" TEXT,
    "lossEventId" TEXT,
    "reversesMovementId" TEXT,
    "createdByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovementLine" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "direction" "StockMovementDirection" NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockMovementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_code_key" ON "StockLocation"("code");

-- CreateIndex
CREATE INDEX "StockLocation_isActive_label_idx" ON "StockLocation"("isActive", "label");

-- CreateIndex
CREATE INDEX "InventoryCategory_isActive_sortOrder_idx" ON "InventoryCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryItem_categoryId_isActive_idx" ON "InventoryItem"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_isActive_name_idx" ON "InventoryItem"("isActive", "name");

-- CreateIndex
CREATE INDEX "Recipe_kind_isActive_name_idx" ON "Recipe"("kind", "isActive", "name");

-- CreateIndex
CREATE INDEX "RecipeVersion_recipeId_isActive_idx" ON "RecipeVersion"("recipeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersion_recipeId_version_key" ON "RecipeVersion"("recipeId", "version");

-- CreateIndex
CREATE INDEX "RecipeLine_recipeVersionId_sortOrder_idx" ON "RecipeLine"("recipeVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "RecipeLine_inventoryItemId_idx" ON "RecipeLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ProductionBatch_status_occurredAt_idx" ON "ProductionBatch"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductionBatch_locationId_occurredAt_idx" ON "ProductionBatch"("locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductionBatchLine_batchId_sortOrder_idx" ON "ProductionBatchLine"("batchId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductionBatchLine_inventoryItemId_idx" ON "ProductionBatchLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Purchase_type_status_purchasedAt_idx" ON "Purchase"("type", "status", "purchasedAt");

-- CreateIndex
CREATE INDEX "Purchase_locationId_purchasedAt_idx" ON "Purchase"("locationId", "purchasedAt");

-- CreateIndex
CREATE INDEX "PurchaseLine_purchaseId_sortOrder_idx" ON "PurchaseLine"("purchaseId", "sortOrder");

-- CreateIndex
CREATE INDEX "PurchaseLine_inventoryItemId_idx" ON "PurchaseLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "LossEvent_reasonType_occurredAt_idx" ON "LossEvent"("reasonType", "occurredAt");

-- CreateIndex
CREATE INDEX "LossEvent_locationId_occurredAt_idx" ON "LossEvent"("locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "LossEventLine_lossEventId_sortOrder_idx" ON "LossEventLine"("lossEventId", "sortOrder");

-- CreateIndex
CREATE INDEX "LossEventLine_inventoryItemId_idx" ON "LossEventLine"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_posSaleId_key" ON "StockMovement"("posSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_purchaseId_key" ON "StockMovement"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_productionBatchId_key" ON "StockMovement"("productionBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_lossEventId_key" ON "StockMovement"("lossEventId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversesMovementId_key" ON "StockMovement"("reversesMovementId");

-- CreateIndex
CREATE INDEX "StockMovement_type_occurredAt_idx" ON "StockMovement"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovementLine_movementId_sortOrder_idx" ON "StockMovementLine"("movementId", "sortOrder");

-- CreateIndex
CREATE INDEX "StockMovementLine_inventoryItemId_locationId_idx" ON "StockMovementLine"("inventoryItemId", "locationId");

-- CreateIndex
CREATE INDEX "StockMovementLine_locationId_idx" ON "StockMovementLine"("locationId");

-- CreateIndex
CREATE INDEX "Product_inventoryItemId_idx" ON "Product"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Product_consumptionRecipeVersionId_idx" ON "Product"("consumptionRecipeVersionId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_consumptionRecipeVersionId_fkey" FOREIGN KEY ("consumptionRecipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchLine" ADD CONSTRAINT "ProductionBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchLine" ADD CONSTRAINT "ProductionBatchLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossEvent" ADD CONSTRAINT "LossEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossEventLine" ADD CONSTRAINT "LossEventLine_lossEventId_fkey" FOREIGN KEY ("lossEventId") REFERENCES "LossEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossEventLine" ADD CONSTRAINT "LossEventLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversesMovementId_fkey" FOREIGN KEY ("reversesMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lossEventId_fkey" FOREIGN KEY ("lossEventId") REFERENCES "LossEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLine" ADD CONSTRAINT "StockMovementLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
