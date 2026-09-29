-- AlterEnum
ALTER TYPE "EnvelopeStatus" ADD VALUE 'RECEIVED';

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "envelopeFirstCountAt" TIMESTAMP(3),
ADD COLUMN     "envelopeFirstCountCents" INTEGER,
ADD COLUMN     "envelopeFirstCountExpectedCents" INTEGER;

-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "countNote" TEXT,
ADD COLUMN     "custodianEmployeeId" TEXT,
ADD COLUMN     "declaredAmountCents" INTEGER,
ADD COLUMN     "firstCountCents" INTEGER,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedByEmployeeId" TEXT,
ADD COLUMN     "selfReceived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "transferredFromCashSessionId" TEXT;

-- CreateTable
CREATE TABLE "EnvelopeCustodyHandover" (
    "id" TEXT NOT NULL,
    "fromEmployeeId" TEXT,
    "toEmployeeId" TEXT NOT NULL,
    "createdByEmployeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "EnvelopeCustodyHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeCustodyHandoverItem" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "accepted" BOOLEAN,

    CONSTRAINT "EnvelopeCustodyHandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnvelopeCustodyHandover_createdAt_idx" ON "EnvelopeCustodyHandover"("createdAt");

-- CreateIndex
CREATE INDEX "EnvelopeCustodyHandoverItem_envelopeId_idx" ON "EnvelopeCustodyHandoverItem"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeCustodyHandoverItem_handoverId_envelopeId_key" ON "EnvelopeCustodyHandoverItem"("handoverId", "envelopeId");

-- CreateIndex
CREATE INDEX "Envelope_custodianEmployeeId_status_idx" ON "Envelope"("custodianEmployeeId", "status");

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_receivedByEmployeeId_fkey" FOREIGN KEY ("receivedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_custodianEmployeeId_fkey" FOREIGN KEY ("custodianEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeCustodyHandover" ADD CONSTRAINT "EnvelopeCustodyHandover_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeCustodyHandover" ADD CONSTRAINT "EnvelopeCustodyHandover_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeCustodyHandover" ADD CONSTRAINT "EnvelopeCustodyHandover_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeCustodyHandoverItem" ADD CONSTRAINT "EnvelopeCustodyHandoverItem_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "EnvelopeCustodyHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeCustodyHandoverItem" ADD CONSTRAINT "EnvelopeCustodyHandoverItem_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

