/*
  Warnings:

  - A unique constraint covering the columns `[fichaId]` on the table `turnos` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EstadoFicha" AS ENUM ('ACTIVA', 'EN_COLA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA');

-- AlterEnum
ALTER TYPE "OrigenTurno" ADD VALUE 'FICHA';

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "fichasPorDia" INTEGER;

-- AlterTable
ALTER TABLE "turnos" ADD COLUMN     "fichaId" TEXT,
ADD COLUMN     "numeroFicha" INTEGER;

-- CreateTable
CREATE TABLE "fichas" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "estado" "EstadoFicha" NOT NULL DEFAULT 'ACTIVA',
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "referencia" TEXT,
    "emitidaPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladaEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fichas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fichas_sedeId_fecha_idx" ON "fichas"("sedeId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "fichas_servicioId_fecha_numero_key" ON "fichas"("servicioId", "fecha", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_fichaId_key" ON "turnos"("fichaId");

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "fichas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas" ADD CONSTRAINT "fichas_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas" ADD CONSTRAINT "fichas_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas" ADD CONSTRAINT "fichas_emitidaPorId_fkey" FOREIGN KEY ("emitidaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
