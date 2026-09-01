-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('EN_CARTERA', 'DEPOSITADO', 'ACREDITADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "posPaymentId" TEXT NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'EN_CARTERA',
    "amountCents" INTEGER NOT NULL,
    "numeroCheque" TEXT,
    "banco" TEXT,
    "librador" TEXT,
    "fechaRecepcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaDeposito" TIMESTAMP(3),
    "fechaAcreditacionEstimada" TIMESTAMP(3),
    "acreditadoAt" TIMESTAMP(3),
    "rechazadoAt" TIMESTAMP(3),
    "rechazoMotivo" TEXT,
    "createdByEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_posPaymentId_key" ON "Cheque"("posPaymentId");

-- CreateIndex
CREATE INDEX "Cheque_status_fechaAcreditacionEstimada_idx" ON "Cheque"("status", "fechaAcreditacionEstimada");

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_posPaymentId_fkey" FOREIGN KEY ("posPaymentId") REFERENCES "PosPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

