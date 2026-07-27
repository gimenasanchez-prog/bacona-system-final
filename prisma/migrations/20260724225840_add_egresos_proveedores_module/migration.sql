-- CreateEnum
CREATE TYPE "CashBoxKind" AS ENUM ('EFECTIVO', 'CUENTA_BANCARIA');

-- CreateEnum
CREATE TYPE "SupplierPayableStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('EFECTIVO_CAJA', 'TRANSFERENCIA', 'TARJETA_CREDITO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'SALES_DEPOSIT';
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'SUPPLIER_PAYMENT';
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'COSTO_FIJO_PAYMENT';
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'RETIRO_GERENCIA';
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'CC_INVOICE_PAYMENT';
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'CREDIT_CARD_STATEMENT_PAYMENT';

-- AlterTable
ALTER TABLE "LocalCashBox" ADD COLUMN     "defaultForPaymentMethods" "PosPaymentMethod"[] DEFAULT ARRAY[]::"PosPaymentMethod"[],
ADD COLUMN     "kind" "CashBoxKind" NOT NULL DEFAULT 'EFECTIVO';

-- AlterTable
ALTER TABLE "LocalCashMovement" ADD COLUMN     "bankFeesCents" INTEGER DEFAULT 0,
ADD COLUMN     "bankWithholdingCents" INTEGER DEFAULT 0,
ADD COLUMN     "grossAmountCents" INTEGER,
ADD COLUMN     "relatedCostoFijoPaymentId" TEXT,
ADD COLUMN     "relatedCreditCardStatementPaymentId" TEXT,
ADD COLUMN     "relatedCuentaCorrienteInvoiceId" TEXT,
ADD COLUMN     "relatedSupplierPaymentId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "SupplierPayable" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sourcePurchaseId" TEXT,
    "description" TEXT,
    "totalAmountCents" INTEGER NOT NULL,
    "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
    "status" "SupplierPayableStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "payableId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" "SupplierPaymentMethod" NOT NULL,
    "cashBoxId" TEXT,
    "creditCardId" TEXT,
    "installments" INTEGER DEFAULT 1,
    "notes" TEXT,
    "createdByEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "payFromCashBoxId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardCharge" (
    "id" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "supplierPaymentId" TEXT,
    "description" TEXT NOT NULL,
    "statementPeriod" TIMESTAMP(3) NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardStatementPayment" (
    "id" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "cashBoxId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "CreditCardStatementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostoFijoPayment" (
    "id" TEXT NOT NULL,
    "costoFijoId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cashBoxId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "CostoFijoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayable_sourcePurchaseId_key" ON "SupplierPayable"("sourcePurchaseId");

-- CreateIndex
CREATE INDEX "SupplierPayable_supplierId_status_idx" ON "SupplierPayable"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_date_idx" ON "SupplierPayment"("supplierId", "date");

-- CreateIndex
CREATE INDEX "SupplierPayment_payableId_idx" ON "SupplierPayment"("payableId");

-- CreateIndex
CREATE INDEX "CreditCard_active_name_idx" ON "CreditCard"("active", "name");

-- CreateIndex
CREATE INDEX "CreditCardCharge_creditCardId_statementPeriod_idx" ON "CreditCardCharge"("creditCardId", "statementPeriod");

-- CreateIndex
CREATE INDEX "CreditCardStatementPayment_creditCardId_period_idx" ON "CreditCardStatementPayment"("creditCardId", "period");

-- CreateIndex
CREATE INDEX "CostoFijoPayment_costoFijoId_period_idx" ON "CostoFijoPayment"("costoFijoId", "period");

-- CreateIndex
CREATE INDEX "LocalCashBox_kind_active_idx" ON "LocalCashBox"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCashMovement_relatedSupplierPaymentId_key" ON "LocalCashMovement"("relatedSupplierPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCashMovement_relatedCostoFijoPaymentId_key" ON "LocalCashMovement"("relatedCostoFijoPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCashMovement_relatedCreditCardStatementPaymentId_key" ON "LocalCashMovement"("relatedCreditCardStatementPaymentId");

-- CreateIndex
CREATE INDEX "LocalCashMovement_relatedCuentaCorrienteInvoiceId_idx" ON "LocalCashMovement"("relatedCuentaCorrienteInvoiceId");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_purchasedAt_idx" ON "Purchase"("supplierId", "purchasedAt");

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedSupplierPaymentId_fkey" FOREIGN KEY ("relatedSupplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedCostoFijoPaymentId_fkey" FOREIGN KEY ("relatedCostoFijoPaymentId") REFERENCES "CostoFijoPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedCreditCardStatementPaymentId_fkey" FOREIGN KEY ("relatedCreditCardStatementPaymentId") REFERENCES "CreditCardStatementPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedCuentaCorrienteInvoiceId_fkey" FOREIGN KEY ("relatedCuentaCorrienteInvoiceId") REFERENCES "CuentaCorrienteInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_sourcePurchaseId_fkey" FOREIGN KEY ("sourcePurchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SupplierPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_payFromCashBoxId_fkey" FOREIGN KEY ("payFromCashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardCharge" ADD CONSTRAINT "CreditCardCharge_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardCharge" ADD CONSTRAINT "CreditCardCharge_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardStatementPayment" ADD CONSTRAINT "CreditCardStatementPayment_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardStatementPayment" ADD CONSTRAINT "CreditCardStatementPayment_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardStatementPayment" ADD CONSTRAINT "CreditCardStatementPayment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoFijoPayment" ADD CONSTRAINT "CostoFijoPayment_costoFijoId_fkey" FOREIGN KEY ("costoFijoId") REFERENCES "CostoFijo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoFijoPayment" ADD CONSTRAINT "CostoFijoPayment_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoFijoPayment" ADD CONSTRAINT "CostoFijoPayment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

