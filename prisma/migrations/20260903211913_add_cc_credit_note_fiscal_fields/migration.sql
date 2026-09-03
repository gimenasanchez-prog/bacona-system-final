-- AlterTable
ALTER TABLE "CcCreditNote" ADD COLUMN     "arcaFacturaNumber" TEXT,
ADD COLUMN     "ivaAmountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ivaDiscriminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ivaExento" BOOLEAN NOT NULL DEFAULT false;
