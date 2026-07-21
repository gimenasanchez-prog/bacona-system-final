-- AlterTable
ALTER TABLE "CuentaCorrienteAccount" ADD COLUMN     "billsToAccountId" TEXT;

-- CreateIndex
CREATE INDEX "CuentaCorrienteAccount_billsToAccountId_idx" ON "CuentaCorrienteAccount"("billsToAccountId");

-- AddForeignKey
ALTER TABLE "CuentaCorrienteAccount" ADD CONSTRAINT "CuentaCorrienteAccount_billsToAccountId_fkey" FOREIGN KEY ("billsToAccountId") REFERENCES "CuentaCorrienteAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
