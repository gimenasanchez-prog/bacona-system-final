-- CreateEnum
CREATE TYPE "EmployeePaymentType" AS ENUM ('HOURLY', 'FIXED_MONTHLY');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "paymentType" "EmployeePaymentType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "monthlySalaryCents" INTEGER;

-- AlterTable
ALTER TABLE "EmployeeHoursPayment" ADD COLUMN     "paymentType" "EmployeePaymentType" NOT NULL DEFAULT 'HOURLY',
ADD COLUMN     "monthlySalaryCentsSnapshot" INTEGER,
ALTER COLUMN "hoursSnapshot" DROP NOT NULL,
ALTER COLUMN "hourlyRateCentsSnapshot" DROP NOT NULL;
