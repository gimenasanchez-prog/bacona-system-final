-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MANIANA', 'TARDE', 'NOCHE');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashSessionPaymentDetailType" AS ENUM ('CUENTA_CORRIENTE', 'CUENTA_INTERNA');

-- CreateEnum
CREATE TYPE "LocalExpenseCategory" AS ENUM ('APROVISIONAMIENTO_COMIDA_LOCAL', 'APROVISIONAMIENTO_BEBIDAS_LOCAL', 'GAS', 'MANTENIMIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "LocalExpensePaymentSource" AS ENUM ('SHIFT_CASH', 'LOCAL_CASH');

-- CreateEnum
CREATE TYPE "EnvelopeStatus" AS ENUM ('CLOSED', 'OPENED', 'CONTROLLED', 'NOT_CONTROLLED');

-- CreateEnum
CREATE TYPE "LocalCashMovementType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "LocalCashMovementSourceType" AS ENUM ('ENVELOPE_OPENING', 'LOCAL_EXPENSE', 'MANUAL_ADJUSTMENT', 'CHANGE_RETURN');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('ASOCIADO', 'CAJA_LOCAL', 'GERENCIA');

-- AlterEnum
ALTER TYPE "PosPaymentMethod" ADD VALUE 'EFECTIVO';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "role" "EmployeeRole" NOT NULL DEFAULT 'ASOCIADO';

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "cashSessionId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "externalKey" TEXT,
ADD COLUMN     "localExpenseId" TEXT;

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "shift" "Shift" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openKey" TEXT,
    "notes" TEXT,
    "totalCashCents" INTEGER NOT NULL DEFAULT 0,
    "totalDebitCents" INTEGER NOT NULL DEFAULT 0,
    "totalCreditCents" INTEGER NOT NULL DEFAULT 0,
    "totalTransferCents" INTEGER NOT NULL DEFAULT 0,
    "totalQrCents" INTEGER NOT NULL DEFAULT 0,
    "totalCuentaCorrienteCents" INTEGER NOT NULL DEFAULT 0,
    "totalCuentasInternasCents" INTEGER NOT NULL DEFAULT 0,
    "totalIncomeCents" INTEGER NOT NULL DEFAULT 0,
    "totalExpensesCents" INTEGER NOT NULL DEFAULT 0,
    "totalNetCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSessionPaymentBreakdownDetail" (
    "id" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "type" "CashSessionPaymentDetailType" NOT NULL,
    "referenceId" TEXT,
    "referenceName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashSessionPaymentBreakdownDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalExpense" (
    "id" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "category" "LocalExpenseCategory" NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierNameSnapshot" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "paymentSource" "LocalExpensePaymentSource" NOT NULL,
    "affectsStock" BOOLEAN NOT NULL DEFAULT false,
    "createdByEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "envelopeCode" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "expectedAmountCents" INTEGER NOT NULL,
    "actualAmountCents" INTEGER,
    "status" "EnvelopeStatus" NOT NULL DEFAULT 'CLOSED',
    "depositedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "controlledAt" TIMESTAMP(3),
    "openedByEmployeeId" TEXT,
    "controlledByEmployeeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalCashBox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalCashBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalCashMovement" (
    "id" TEXT NOT NULL,
    "localCashBoxId" TEXT NOT NULL,
    "type" "LocalCashMovementType" NOT NULL,
    "sourceType" "LocalCashMovementSourceType" NOT NULL,
    "relatedEnvelopeId" TEXT,
    "relatedLocalExpenseId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdByEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_openKey_key" ON "CashSession"("openKey");

-- CreateIndex
CREATE INDEX "CashSession_businessDate_shift_status_idx" ON "CashSession"("businessDate", "shift", "status");

-- CreateIndex
CREATE INDEX "CashSession_employeeId_businessDate_shift_idx" ON "CashSession"("employeeId", "businessDate", "shift");

-- CreateIndex
CREATE INDEX "CashSessionPaymentBreakdownDetail_cashSessionId_type_idx" ON "CashSessionPaymentBreakdownDetail"("cashSessionId", "type");

-- CreateIndex
CREATE INDEX "Supplier_active_name_idx" ON "Supplier"("active", "name");

-- CreateIndex
CREATE INDEX "LocalExpense_cashSessionId_date_idx" ON "LocalExpense"("cashSessionId", "date");

-- CreateIndex
CREATE INDEX "LocalExpense_supplierId_date_idx" ON "LocalExpense"("supplierId", "date");

-- CreateIndex
CREATE INDEX "LocalExpense_paymentSource_date_idx" ON "LocalExpense"("paymentSource", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_envelopeCode_key" ON "Envelope"("envelopeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_cashSessionId_key" ON "Envelope"("cashSessionId");

-- CreateIndex
CREATE INDEX "Envelope_status_depositedAt_idx" ON "Envelope"("status", "depositedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCashBox_name_key" ON "LocalCashBox"("name");

-- CreateIndex
CREATE INDEX "LocalCashBox_active_name_idx" ON "LocalCashBox"("active", "name");

-- CreateIndex
CREATE INDEX "LocalCashMovement_localCashBoxId_date_idx" ON "LocalCashMovement"("localCashBoxId", "date");

-- CreateIndex
CREATE INDEX "LocalCashMovement_type_date_idx" ON "LocalCashMovement"("type", "date");

-- CreateIndex
CREATE INDEX "LocalCashMovement_sourceType_date_idx" ON "LocalCashMovement"("sourceType", "date");

-- CreateIndex
CREATE INDEX "LocalCashMovement_relatedEnvelopeId_idx" ON "LocalCashMovement"("relatedEnvelopeId");

-- CreateIndex
CREATE INDEX "LocalCashMovement_relatedLocalExpenseId_idx" ON "LocalCashMovement"("relatedLocalExpenseId");

-- CreateIndex
CREATE INDEX "PosSale_cashSessionId_createdAt_idx" ON "PosSale"("cashSessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_externalKey_key" ON "StockMovement"("externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_localExpenseId_key" ON "StockMovement"("localExpenseId");

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSessionPaymentBreakdownDetail" ADD CONSTRAINT "CashSessionPaymentBreakdownDetail_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalExpense" ADD CONSTRAINT "LocalExpense_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalExpense" ADD CONSTRAINT "LocalExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalExpense" ADD CONSTRAINT "LocalExpense_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_openedByEmployeeId_fkey" FOREIGN KEY ("openedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_controlledByEmployeeId_fkey" FOREIGN KEY ("controlledByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_localCashBoxId_fkey" FOREIGN KEY ("localCashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedEnvelopeId_fkey" FOREIGN KEY ("relatedEnvelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedLocalExpenseId_fkey" FOREIGN KEY ("relatedLocalExpenseId") REFERENCES "LocalExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_localExpenseId_fkey" FOREIGN KEY ("localExpenseId") REFERENCES "LocalExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
