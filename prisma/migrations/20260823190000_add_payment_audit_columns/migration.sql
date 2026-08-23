-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "CreditCardStatementPayment" ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "CostoFijoPayment" ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardStatementPayment" ADD CONSTRAINT "CreditCardStatementPayment_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostoFijoPayment" ADD CONSTRAINT "CostoFijoPayment_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
