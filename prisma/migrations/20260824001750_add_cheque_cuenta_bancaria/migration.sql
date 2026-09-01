-- AlterTable
ALTER TABLE "Cheque" ADD COLUMN     "cuentaBancariaId" TEXT;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "LocalCashBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

