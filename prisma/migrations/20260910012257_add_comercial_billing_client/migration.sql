-- AlterTable
ALTER TABLE "ComercialSaleLine" ADD COLUMN     "facturacionCuit" TEXT,
ADD COLUMN     "facturacionNotas" TEXT,
ADD COLUMN     "facturacionRazonSocial" TEXT;

-- CreateTable
CREATE TABLE "ComercialBillingClient" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "cuit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComercialBillingClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComercialBillingClient_razonSocial_idx" ON "ComercialBillingClient"("razonSocial");
