-- AlterEnum
ALTER TYPE "LocalCashMovementSourceType" ADD VALUE 'OPENING_BALANCE';

-- AlterTable
ALTER TABLE "LocalCashBox" ADD COLUMN     "reconciliationStartDate" TIMESTAMP(3);
