-- AlterTable
ALTER TABLE "LocalCashBox" DROP COLUMN "defaultForPaymentMethods";

-- AlterTable
ALTER TABLE "LocalCashMovement" ADD COLUMN     "relatedPosPaymentId" TEXT;

-- CreateTable
CREATE TABLE "CashBoxPaymentMethodConfig" (
    "id" TEXT NOT NULL,
    "cashBoxId" TEXT NOT NULL,
    "method" "PosPaymentMethod" NOT NULL,
    "settlementBusinessDays" INTEGER NOT NULL DEFAULT 0,
    "withholdingPercent" DECIMAL(5,2),
    "feesPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashBoxPaymentMethodConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashBoxPaymentMethodConfig_cashBoxId_method_key" ON "CashBoxPaymentMethodConfig"("cashBoxId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCashMovement_relatedPosPaymentId_key" ON "LocalCashMovement"("relatedPosPaymentId");

-- AddForeignKey
ALTER TABLE "CashBoxPaymentMethodConfig" ADD CONSTRAINT "CashBoxPaymentMethodConfig_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "LocalCashBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCashMovement" ADD CONSTRAINT "LocalCashMovement_relatedPosPaymentId_fkey" FOREIGN KEY ("relatedPosPaymentId") REFERENCES "PosPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

