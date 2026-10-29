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
