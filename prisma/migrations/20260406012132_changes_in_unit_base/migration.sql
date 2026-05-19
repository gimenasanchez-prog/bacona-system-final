-- CreateEnum
CREATE TYPE "StockDimension" AS ENUM ('VOLUME', 'MASS', 'COUNT');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "dimension" "StockDimension" NOT NULL DEFAULT 'COUNT',
ADD COLUMN     "displayUnit" "StockUnit" NOT NULL DEFAULT 'UN';

-- AlterTable
ALTER TABLE "LossEventLine" ADD COLUMN     "entryQty" DECIMAL(18,3),
ADD COLUMN     "entryUnit" "StockUnit",
ADD COLUMN     "uomId" TEXT;

-- AlterTable
ALTER TABLE "ProductionBatchLine" ADD COLUMN     "entryQty" DECIMAL(18,3),
ADD COLUMN     "entryUnit" "StockUnit",
ADD COLUMN     "uomId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseLine" ADD COLUMN     "entryQty" DECIMAL(18,3),
ADD COLUMN     "entryUnit" "StockUnit",
ADD COLUMN     "uomId" TEXT;

-- CreateTable
CREATE TABLE "InventoryItemUom" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "multiplierToBase" DECIMAL(18,6) NOT NULL,
    "isDefaultForEntry" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItemUom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItemUom_inventoryItemId_sortOrder_idx" ON "InventoryItemUom"("inventoryItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryItemUom_inventoryItemId_isDefaultForEntry_idx" ON "InventoryItemUom"("inventoryItemId", "isDefaultForEntry");

-- AddForeignKey
ALTER TABLE "InventoryItemUom" ADD CONSTRAINT "InventoryItemUom_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
