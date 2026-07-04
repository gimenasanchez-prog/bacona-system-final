-- CreateEnum
CREATE TYPE "PriceChangeType" AS ENUM ('MANUAL', 'BULK');

-- CreateTable
CREATE TABLE "PriceBulkUpdate" (
    "id" TEXT NOT NULL,
    "percent" DECIMAL(6,2) NOT NULL,
    "categoryIds" TEXT[],
    "affectedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "PriceBulkUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldPriceCents" INTEGER NOT NULL,
    "newPriceCents" INTEGER NOT NULL,
    "changeType" "PriceChangeType" NOT NULL,
    "bulkUpdateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceBulkUpdate_createdAt_idx" ON "PriceBulkUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_createdAt_idx" ON "PriceHistory"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceHistory_bulkUpdateId_idx" ON "PriceHistory"("bulkUpdateId");

-- AddForeignKey
ALTER TABLE "PriceBulkUpdate" ADD CONSTRAINT "PriceBulkUpdate_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_bulkUpdateId_fkey" FOREIGN KEY ("bulkUpdateId") REFERENCES "PriceBulkUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
