-- CreateEnum
CREATE TYPE "CuentaCorrienteAccountKind" AS ENUM ('CORPORATIVA', 'TRANSITORIA');

-- CreateEnum
CREATE TYPE "ComercialSaleLineStatus" AS ENUM ('PENDIENTE', 'ENTREGADA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "PosSaleType" ADD VALUE 'COMERCIAL';

-- DropForeignKey
ALTER TABLE "CcDirectCharge" DROP CONSTRAINT "CcDirectCharge_comercialSaleId_fkey";

-- DropForeignKey
ALTER TABLE "ComercialSale" DROP CONSTRAINT "ComercialSale_cuentaCorrienteAccountId_fkey";

-- DropForeignKey
ALTER TABLE "ComercialSale" DROP CONSTRAINT "ComercialSale_deliveredByEmployeeId_fkey";

-- DropIndex
DROP INDEX "CcDirectCharge_comercialSaleId_key";

-- DropIndex
DROP INDEX "ComercialSale_status_scheduledAt_idx";

-- AlterTable
ALTER TABLE "CcDirectCharge" DROP COLUMN "comercialSaleId";

-- AlterTable
ALTER TABLE "ComercialSale" DROP COLUMN "cancellationReason",
DROP COLUMN "cancelledAt",
DROP COLUMN "comandaNumber",
DROP COLUMN "confirmedAt",
DROP COLUMN "deliveredAt",
DROP COLUMN "deliveredByEmployeeId",
DROP COLUMN "eventDescription",
DROP COLUMN "fulfillmentType",
DROP COLUMN "scheduledAt",
DROP COLUMN "status",
DROP COLUMN "totalCents",
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "cuentaCorrienteAccountId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ComercialSaleLine" DROP COLUMN "lineTotalCents",
DROP COLUMN "productDetail",
DROP COLUMN "quantity",
ADD COLUMN     "actualCobradas" INTEGER,
ADD COLUMN     "actualQty" INTEGER,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cant" INTEGER NOT NULL,
ADD COLUMN     "clienteLabel" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveredByEmployeeId" TEXT,
ADD COLUMN     "deliveryDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "detalleComanda" TEXT,
ADD COLUMN     "formaDePagoPlanificada" TEXT,
ADD COLUMN     "horarioRetiro" TEXT NOT NULL,
ADD COLUMN     "paymentMethod" "PosPaymentMethod",
ADD COLUMN     "posSaleId" TEXT,
ADD COLUMN     "status" "ComercialSaleLineStatus" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "tipoVianda" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "viandasCobradasPlanned" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CuentaCorrienteAccount" ADD COLUMN     "accountKind" "CuentaCorrienteAccountKind" NOT NULL DEFAULT 'CORPORATIVA',
ADD COLUMN     "estimatedPaymentDate" TIMESTAMP(3);

-- DropEnum
DROP TYPE "ComercialSaleFulfillmentType";

-- DropEnum
DROP TYPE "ComercialSaleStatus";

-- CreateTable
CREATE TABLE "ComercialSaleLineProduct" (
    "id" TEXT NOT NULL,
    "comercialSaleLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyPerUnit" DECIMAL(18,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComercialSaleLineProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComercialSaleLineProduct_comercialSaleLineId_sortOrder_idx" ON "ComercialSaleLineProduct"("comercialSaleLineId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ComercialSaleLine_posSaleId_key" ON "ComercialSaleLine"("posSaleId");

-- CreateIndex
CREATE INDEX "ComercialSaleLine_status_deliveryDate_idx" ON "ComercialSaleLine"("status", "deliveryDate");

-- AddForeignKey
ALTER TABLE "ComercialSale" ADD CONSTRAINT "ComercialSale_cuentaCorrienteAccountId_fkey" FOREIGN KEY ("cuentaCorrienteAccountId") REFERENCES "CuentaCorrienteAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSaleLine" ADD CONSTRAINT "ComercialSaleLine_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSaleLine" ADD CONSTRAINT "ComercialSaleLine_deliveredByEmployeeId_fkey" FOREIGN KEY ("deliveredByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSaleLineProduct" ADD CONSTRAINT "ComercialSaleLineProduct_comercialSaleLineId_fkey" FOREIGN KEY ("comercialSaleLineId") REFERENCES "ComercialSaleLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercialSaleLineProduct" ADD CONSTRAINT "ComercialSaleLineProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

