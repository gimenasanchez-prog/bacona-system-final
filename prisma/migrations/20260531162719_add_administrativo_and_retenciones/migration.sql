-- AlterEnum
ALTER TYPE "EmployeeRole" ADD VALUE 'ADMINISTRATIVO';

-- AlterTable
ALTER TABLE "CuentaCorrienteInvoice" ADD COLUMN     "arcaFacturaNumber" TEXT,
ADD COLUMN     "gananciasRetentionCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ivaRetentionCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rentasRetentionCents" INTEGER NOT NULL DEFAULT 0;
