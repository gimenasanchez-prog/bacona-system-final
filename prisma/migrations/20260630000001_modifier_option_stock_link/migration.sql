-- AlterTable
ALTER TABLE "ModifierOption" ADD COLUMN "inventoryItemId" TEXT,
ADD COLUMN "inventoryQty" DECIMAL(18,3);

-- CreateIndex
CREATE INDEX "ModifierOption_inventoryItemId_idx" ON "ModifierOption"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
