-- CreateTable
CREATE TABLE "CcCreditNote" (
    "id" TEXT NOT NULL,
    "cuentaCorrienteAccountId" TEXT NOT NULL,
    "cuentaCorrienteInvoiceId" TEXT,
    "ccDirectChargeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "motive" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "CcCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CcCreditNote_cuentaCorrienteAccountId_idx" ON "CcCreditNote"("cuentaCorrienteAccountId");

-- CreateIndex
CREATE INDEX "CcCreditNote_cuentaCorrienteInvoiceId_idx" ON "CcCreditNote"("cuentaCorrienteInvoiceId");

-- CreateIndex
CREATE INDEX "CcCreditNote_ccDirectChargeId_idx" ON "CcCreditNote"("ccDirectChargeId");

-- AddForeignKey
ALTER TABLE "CcCreditNote" ADD CONSTRAINT "CcCreditNote_cuentaCorrienteAccountId_fkey" FOREIGN KEY ("cuentaCorrienteAccountId") REFERENCES "CuentaCorrienteAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CcCreditNote" ADD CONSTRAINT "CcCreditNote_cuentaCorrienteInvoiceId_fkey" FOREIGN KEY ("cuentaCorrienteInvoiceId") REFERENCES "CuentaCorrienteInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CcCreditNote" ADD CONSTRAINT "CcCreditNote_ccDirectChargeId_fkey" FOREIGN KEY ("ccDirectChargeId") REFERENCES "CcDirectCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CcCreditNote" ADD CONSTRAINT "CcCreditNote_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
