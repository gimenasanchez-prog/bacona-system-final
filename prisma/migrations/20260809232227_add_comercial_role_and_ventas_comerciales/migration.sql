-- CreateEnum
CREATE TYPE "ComercialSaleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ENTREGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ComercialSaleFulfillmentType" AS ENUM ('PICKUP', 'IN_SITU');

-- AlterEnum
ALTER TYPE "EmployeeRole" ADD VALUE 'COMERCIAL';

-- AlterTable
ALTER TABLE "CcDirectCharge" ADD COLUMN     "comercialSaleId" TEXT;

-- CreateTable
CREATE TABLE "ComercialSale" (
    "id" TEXT NOT NULL,
    "status" "ComercialSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "cuentaCorrienteAccountId" TEXT NOT NULL,
    "fulfillmentType" "ComercialSaleFulfillmentType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "eventDescription" TEXT,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "comandaNumber" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveredByEmployeeId" TEXT,
    "createdByEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComercialSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComercialSaleLine" (
    "id" TEXT NOT NULL,
    "comercialSaleId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "productDetail" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComercialSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComercialSale_status_scheduledAt_idx" ON "ComercialSale"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ComercialSale_cuentaCorrienteAccountId_idx" ON "ComercialSale"("cuentaCorrienteAccountId");

-- CreateIndex
CREATE INDEX "ComercialSaleLine_comercialSaleId_sortOrder_idx" ON "ComercialSaleLine"("comercialSaleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CcDirectCharge_comercialSaleId_key" ON "CcDirectCharge"("comercialSaleId");

-- AddForeignKey
ALTER TABLE "CcDirectCharge" ADD CONSTRAINT "CcDirectCharge_comercialSaleId_fkey" FOREIGN KEY ("comercialSaleId") REFERENCES "ComercialSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSale" ADD CONSTRAINT "ComercialSale_cuentaCorrienteAccountId_fkey" FOREIGN KEY ("cuentaCorrienteAccountId") REFERENCES "CuentaCorrienteAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSale" ADD CONSTRAINT "ComercialSale_deliveredByEmployeeId_fkey" FOREIGN KEY ("deliveredByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSale" ADD CONSTRAINT "ComercialSale_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSaleLine" ADD CONSTRAINT "ComercialSaleLine_comercialSaleId_fkey" FOREIGN KEY ("comercialSaleId") REFERENCES "ComercialSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

