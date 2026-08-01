-- CreateEnum
CREATE TYPE "IvaCondition" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL', 'OTRO');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactEmail1" TEXT,
ADD COLUMN     "contactEmail2" TEXT,
ADD COLUMN     "contactName1" TEXT,
ADD COLUMN     "contactName2" TEXT,
ADD COLUMN     "contactPhone1" TEXT,
ADD COLUMN     "contactPhone2" TEXT,
ADD COLUMN     "cuit" TEXT,
ADD COLUMN     "ivaCondition" "IvaCondition",
ADD COLUMN     "razonSocial" TEXT;
