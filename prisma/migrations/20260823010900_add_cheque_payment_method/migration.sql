-- AlterEnum
ALTER TYPE "PosPaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "totalChequeCents" INTEGER NOT NULL DEFAULT 0;

