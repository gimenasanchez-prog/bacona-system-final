-- AlterTable
ALTER TABLE "CuentaCorrienteInvoice" ADD COLUMN     "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentReference" TEXT;
