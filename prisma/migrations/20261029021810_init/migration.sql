-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'EN_COLA', 'ATENDIDA', 'RECHAZADA', 'CANCELADA', 'NO_ASISTIO');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('ESPERANDO', 'LLAMADO', 'ATENDIENDO', 'FINALIZADO', 'NO_SE_PRESENTO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PrioridadTurno" AS ENUM ('PREFERENCIAL', 'CITA', 'NORMAL');

-- CreateEnum
CREATE TYPE "OrigenTurno" AS ENUM ('MOSTRADOR', 'WEB', 'CITA');

-- CreateTable
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/La_Paz',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'OPERADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sedeId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitantes" (
    "id" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "telefono" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "prefijo" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL DEFAULT 15,
    "permiteCita" BOOLEAN NOT NULL DEFAULT true,
    "requiereAprobacion" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventanillas" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ventanillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventanillas_servicios" (
    "ventanillaId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,

    CONSTRAINT "ventanillas_servicios_pkey" PRIMARY KEY ("ventanillaId","servicioId")
);

-- CreateTable
CREATE TABLE "horarios_atencion" (
    "id" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "finMin" INTEGER NOT NULL,

    CONSTRAINT "horarios_atencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dias_no_laborables" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "dias_no_laborables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citas" (
    "id" TEXT NOT NULL,
    "codigoPublico" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE',
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "estudianteNombre" TEXT NOT NULL,
    "estudianteCurso" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "motivoRechazo" TEXT,
    "decididaPorId" TEXT,
    "decididaEn" TIMESTAMP(3),
    "canceladaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "citaId" TEXT,
    "solicitanteId" TEXT,
    "ventanillaId" TEXT,
    "atendidoPorId" TEXT,
    "fecha" DATE NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "prioridad" "PrioridadTurno" NOT NULL DEFAULT 'NORMAL',
    "origen" "OrigenTurno" NOT NULL DEFAULT 'MOSTRADOR',
    "estado" "EstadoTurno" NOT NULL DEFAULT 'ESPERANDO',
    "nombreVisitante" TEXT,
    "estudianteReferencia" TEXT,
    "observacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llamadoEn" TIMESTAMP(3),
    "inicioAtencionEn" TIMESTAMP(3),
    "finAtencionEn" TIMESTAMP(3),

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadores_turno" (
    "servicioId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_turno_pkey" PRIMARY KEY ("servicioId","fecha")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_sedeId_idx" ON "usuarios"("sedeId");

-- CreateIndex
CREATE UNIQUE INDEX "solicitantes_documento_key" ON "solicitantes"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_sedeId_nombre_key" ON "servicios"("sedeId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_sedeId_prefijo_key" ON "servicios"("sedeId", "prefijo");

-- CreateIndex
CREATE UNIQUE INDEX "ventanillas_sedeId_nombre_key" ON "ventanillas"("sedeId", "nombre");

-- CreateIndex
CREATE INDEX "horarios_atencion_servicioId_diaSemana_idx" ON "horarios_atencion"("servicioId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "dias_no_laborables_sedeId_fecha_key" ON "dias_no_laborables"("sedeId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "citas_codigoPublico_key" ON "citas"("codigoPublico");

-- CreateIndex
CREATE UNIQUE INDEX "citas_tokenHash_key" ON "citas"("tokenHash");

-- CreateIndex
CREATE INDEX "citas_sedeId_inicio_idx" ON "citas"("sedeId", "inicio");

-- CreateIndex
CREATE INDEX "citas_servicioId_inicio_idx" ON "citas"("servicioId", "inicio");

-- CreateIndex
CREATE INDEX "citas_solicitanteId_estado_idx" ON "citas"("solicitanteId", "estado");

-- CreateIndex
CREATE INDEX "citas_estado_creadoEn_idx" ON "citas"("estado", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_citaId_key" ON "turnos"("citaId");

-- CreateIndex
CREATE INDEX "turnos_sedeId_servicioId_fecha_estado_prioridad_creadoEn_idx" ON "turnos"("sedeId", "servicioId", "fecha", "estado", "prioridad", "creadoEn");

-- CreateIndex
CREATE INDEX "turnos_ventanillaId_estado_idx" ON "turnos"("ventanillaId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_servicioId_fecha_numero_key" ON "turnos"("servicioId", "fecha", "numero");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventanillas" ADD CONSTRAINT "ventanillas_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventanillas_servicios" ADD CONSTRAINT "ventanillas_servicios_ventanillaId_fkey" FOREIGN KEY ("ventanillaId") REFERENCES "ventanillas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventanillas_servicios" ADD CONSTRAINT "ventanillas_servicios_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_atencion" ADD CONSTRAINT "horarios_atencion_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dias_no_laborables" ADD CONSTRAINT "dias_no_laborables_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "solicitantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_decididaPorId_fkey" FOREIGN KEY ("decididaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "solicitantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_ventanillaId_fkey" FOREIGN KEY ("ventanillaId") REFERENCES "ventanillas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_atendidoPorId_fkey" FOREIGN KEY ("atendidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contadores_turno" ADD CONSTRAINT "contadores_turno_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Protección contra DOBLE RESERVA.
--
-- Una sola cita que OCUPE la hora por servicio y hora de inicio. Prisma no puede
-- declarar índices únicos parciales en schema.prisma, por eso se agrega
-- a mano en la migración inicial (ver README, "Primer arranque").
--
-- "Parcial" = solo cuenta las citas que ocupan la hora: una cita CANCELADA,
-- RECHAZADA o NO_ASISTIO la libera para otra persona.
--
-- Si dos personas pulsan "reservar" a la vez, la base de datos rechaza a la
-- segunda con el error P2002 (el servicio de citas lo convierte en un 409).

CREATE UNIQUE INDEX "citas_servicio_inicio_activa_uk"
ON "citas" ("servicioId", "inicio")
WHERE "estado" NOT IN ('CANCELADA', 'NO_ASISTIO', 'RECHAZADA');
