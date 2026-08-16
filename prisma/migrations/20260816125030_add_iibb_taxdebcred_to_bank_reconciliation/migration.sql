-- AlterTable
ALTER TABLE "CashBoxPaymentMethodConfig" ADD COLUMN     "iibbPercent" DECIMAL(5,2),
ADD COLUMN     "taxDebCredPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "LocalCashMovement" ADD COLUMN     "iibbCents" INTEGER DEFAULT 0,
ADD COLUMN     "taxDebCredCents" INTEGER DEFAULT 0;
