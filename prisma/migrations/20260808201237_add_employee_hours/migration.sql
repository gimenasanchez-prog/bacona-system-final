-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "hourlyRateCents" INTEGER;

-- CreateTable
CREATE TABLE "EmployeeHoursEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "hoursWorked" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeHoursEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeHoursPayment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "hoursSnapshot" DECIMAL(6,2) NOT NULL,
    "hourlyRateCentsSnapshot" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "EmployeeHoursPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeHoursEntry_employeeId_workDate_key" ON "EmployeeHoursEntry"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeHoursPayment_employeeId_period_key" ON "EmployeeHoursPayment"("employeeId", "period");

-- AddForeignKey
ALTER TABLE "EmployeeHoursEntry" ADD CONSTRAINT "EmployeeHoursEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHoursPayment" ADD CONSTRAINT "EmployeeHoursPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHoursPayment" ADD CONSTRAINT "EmployeeHoursPayment_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
