-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('QUINCENAL', 'MENSUAL');

-- AlterTable
ALTER TABLE "CuentaCorrienteAccount" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MENSUAL';

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "cuentaCorrienteInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "CuentaCorrienteInvoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "billingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedPaymentDate" TIMESTAMP(3) NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "ivaExento" BOOLEAN NOT NULL DEFAULT false,
    "ivaDiscriminado" BOOLEAN NOT NULL DEFAULT false,
    "ivaAmountCents" INTEGER NOT NULL DEFAULT 0,
    "bankWithholdingCents" INTEGER NOT NULL DEFAULT 0,
    "bankFeesCents" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "digitalInvoiceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaCorrienteInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CuentaCorrienteInvoice_accountId_isPaid_idx" ON "CuentaCorrienteInvoice"("accountId", "isPaid");

-- CreateIndex
CREATE INDEX "CuentaCorrienteInvoice_estimatedPaymentDate_idx" ON "CuentaCorrienteInvoice"("estimatedPaymentDate");

-- CreateIndex
CREATE INDEX "PosSale_cuentaCorrienteInvoiceId_idx" ON "PosSale"("cuentaCorrienteInvoiceId");

-- AddForeignKey
ALTER TABLE "CuentaCorrienteInvoice" ADD CONSTRAINT "CuentaCorrienteInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CuentaCorrienteAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_cuentaCorrienteInvoiceId_fkey" FOREIGN KEY ("cuentaCorrienteInvoiceId") REFERENCES "CuentaCorrienteInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
