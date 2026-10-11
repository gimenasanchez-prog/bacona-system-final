-- CreateEnum
CREATE TYPE "TicketImportStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DISCARDED', 'ERROR');

-- CreateEnum
CREATE TYPE "TicketLineMatchSource" AS ENUM ('ALIAS', 'AI', 'MANUAL', 'NONE');

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "createdByEmployeeId" TEXT;

-- CreateTable
CREATE TABLE "TicketImport" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "driveFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "TicketImportStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "errorMessage" TEXT,
    "supplierNameRaw" TEXT,
    "supplierId" TEXT,
    "invoiceNumber" TEXT,
    "invoiceType" TEXT,
    "supplierCuit" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "totalCents" INTEGER,
    "ivaCents" INTEGER,
    "type" "PurchaseType" NOT NULL DEFAULT 'IN_SITU',
    "locationCode" TEXT NOT NULL DEFAULT 'BACONA',
    "rawExtraction" JSONB,
    "purchaseId" TEXT,
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketImportLine" (
    "id" TEXT NOT NULL,
    "ticketImportId" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unitRaw" TEXT,
    "unitPriceCents" INTEGER,
    "lineTotalCents" INTEGER,
    "inventoryItemId" TEXT,
    "uomId" TEXT,
    "matchSource" "TicketLineMatchSource" NOT NULL DEFAULT 'NONE',
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketImportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProductAlias" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "uomId" TEXT,
    "timesUsed" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketImport_driveFileId_key" ON "TicketImport"("driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketImport_purchaseId_key" ON "TicketImport"("purchaseId");

-- CreateIndex
CREATE INDEX "TicketImport_status_createdAt_idx" ON "TicketImport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TicketImportLine_ticketImportId_sortOrder_idx" ON "TicketImportLine"("ticketImportId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProductAlias_supplierId_normalizedText_key" ON "SupplierProductAlias"("supplierId", "normalizedText");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketImport" ADD CONSTRAINT "TicketImport_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketImport" ADD CONSTRAINT "TicketImport_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketImport" ADD CONSTRAINT "TicketImport_reviewedByEmployeeId_fkey" FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketImportLine" ADD CONSTRAINT "TicketImportLine_ticketImportId_fkey" FOREIGN KEY ("ticketImportId") REFERENCES "TicketImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketImportLine" ADD CONSTRAINT "TicketImportLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductAlias" ADD CONSTRAINT "SupplierProductAlias_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductAlias" ADD CONSTRAINT "SupplierProductAlias_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

