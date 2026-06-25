-- CreateEnum
CREATE TYPE "CostoFijoCategoria" AS ENUM ('ALQUILER', 'SALARIOS', 'SERVICIOS_BASICOS', 'SEGUROS', 'IMPUESTOS_FIJOS', 'SUSCRIPCIONES', 'OTRO');

-- CreateTable
CREATE TABLE "CostoFijo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CostoFijoCategoria" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostoFijo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigMargenCategoria" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "cogsPercent" DECIMAL(5,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByEmployeeId" TEXT NOT NULL,

    CONSTRAINT "ConfigMargenCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostoFijo_isActive_validFrom_idx" ON "CostoFijo"("isActive", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigMargenCategoria_categoryId_key" ON "ConfigMargenCategoria"("categoryId");

-- CreateIndex
CREATE INDEX "ConfigMargenCategoria_categoryId_idx" ON "ConfigMargenCategoria"("categoryId");

-- AddForeignKey
ALTER TABLE "ConfigMargenCategoria" ADD CONSTRAINT "ConfigMargenCategoria_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigMargenCategoria" ADD CONSTRAINT "ConfigMargenCategoria_updatedByEmployeeId_fkey" FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
