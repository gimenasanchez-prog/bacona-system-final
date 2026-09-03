-- AlterTable
ALTER TABLE "CcDirectCharge" ADD COLUMN     "comercialSaleLineId" TEXT;

-- AlterTable
ALTER TABLE "Cheque" ADD COLUMN     "cuentaCorrienteInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CcDirectCharge_comercialSaleLineId_key" ON "CcDirectCharge"("comercialSaleLineId");

-- CreateIndex
CREATE INDEX "Cheque_cuentaCorrienteInvoiceId_idx" ON "Cheque"("cuentaCorrienteInvoiceId");

-- AddForeignKey
ALTER TABLE "CcDirectCharge" ADD CONSTRAINT "CcDirectCharge_comercialSaleLineId_fkey" FOREIGN KEY ("comercialSaleLineId") REFERENCES "ComercialSaleLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_cuentaCorrienteInvoiceId_fkey" FOREIGN KEY ("cuentaCorrienteInvoiceId") REFERENCES "CuentaCorrienteInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
