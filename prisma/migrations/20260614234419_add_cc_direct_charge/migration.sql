-- CreateEnum
CREATE TYPE "CcDirectChargeCategory" AS ENUM ('CONSUMO_OLVIDADO', 'SERVICIO_ESPECIAL', 'CORRECCION', 'OTRO');

-- CreateTable
CREATE TABLE "CcDirectCharge" (
    "id" TEXT NOT NULL,
    "cuentaCorrienteAccountId" TEXT NOT NULL,
    "cuentaCorrienteInvoiceId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "motive" TEXT NOT NULL,
    "category" "CcDirectChargeCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "CcDirectCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CcDirectCharge_cuentaCorrienteAccountId_idx" ON "CcDirectCharge"("cuentaCorrienteAccountId");

-- CreateIndex
CREATE INDEX "CcDirectCharge_cuentaCorrienteInvoiceId_idx" ON "CcDirectCharge"("cuentaCorrienteInvoiceId");

-- AddForeignKey
ALTER TABLE "CcDirectCharge" ADD CONSTRAINT "CcDirectCharge_cuentaCorrienteAccountId_fkey" FOREIGN KEY ("cuentaCorrienteAccountId") REFERENCES "CuentaCorrienteAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CcDirectCharge" ADD CONSTRAINT "CcDirectCharge_cuentaCorrienteInvoiceId_fkey" FOREIGN KEY ("cuentaCorrienteInvoiceId") REFERENCES "CuentaCorrienteInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CcDirectCharge" ADD CONSTRAINT "CcDirectCharge_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
