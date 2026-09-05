-- CreateEnum
CREATE TYPE "SierraDeltaDebtCurrency" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "SierraDeltaDebtStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- AlterEnum
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'SIERRA_DELTA_DEBT_PAYMENT';

-- AlterTable
ALTER TABLE "LocalCashMovement" ADD COLUMN     "relatedSierraDeltaDebtPaymentId" TEXT;

-- CreateTable
CREATE TABLE "SierraDeltaDebt" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "currency" "SierraDeltaDebtCurrency" NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
    "status" "SierraDeltaDebtStatus" NOT NULL DEFAULT 'PENDING',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SierraDeltaDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SierraDeltaDebtBreakdownLine" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "paymentMonthLabel" TEXT NOT NULL,
    "amountPerPartnerCents" INTEGER NOT NULL,
    "partnersCount" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SierraDeltaDebtBreakdownLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SierraDeltaDebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "exchangeRate" DECIMAL(12,4),
    "amountArsCents" INTEGER NOT NULL,
    "cashBoxId" TEXT NOT NULL,
    "notes" TEXT,
    "createdByEmployeeId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3),
    "updatedByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SierraDeltaDebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SierraDeltaDebt_status_idx" ON "SierraDeltaDebt"("status");

-- CreateIndex
CREATE INDEX "SierraDeltaDebtBreakdownLine_debtId_sortOrder_idx" ON "SierraDeltaDebtBreakdownLine"("debtId", "sortOrder");

-- CreateIndex
CREATE INDEX "SierraDeltaDebtPayment_debtId_date_idx" ON "SierraDeltaDebtPayment"("debtId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCashMovement_relatedSierraDeltaDebtPaymentId_key" ON "LocalCashMovement"("relatedSierraDeltaDebtPaymentId");

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedSierraDeltaDebtPaymentId_fkey" FOREIGN KEY ("relatedSierraDeltaDebtPaymentId") REFERENCES "SierraDeltaDebtPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SierraDeltaDebtBreakdownLine" ADD CONSTRAINT "SierraDeltaDebtBreakdownLine_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "SierraDeltaDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SierraDeltaDebtPayment" ADD CONSTRAINT "SierraDeltaDebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "SierraDeltaDebt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SierraDeltaDebtPayment" ADD CONSTRAINT "SierraDeltaDebtPayment_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SierraDeltaDebtPayment" ADD CONSTRAINT "SierraDeltaDebtPayment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SierraDeltaDebtPayment" ADD CONSTRAINT "SierraDeltaDebtPayment_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

