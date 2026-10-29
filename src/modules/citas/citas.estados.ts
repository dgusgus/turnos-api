// Estados de una cita (espejo del enum EstadoCita de schema.prisma) y sus reglas.
// Se declaran aquí como texto para no acoplar la lógica al cliente generado.

export type EstadoCita =
  "PENDIENTE" | "CONFIRMADA" | "EN_COLA" | "ATENDIDA" | "RECHAZADA" | "CANCELADA" | "NO_ASISTIO";

// Ocupan la hora (nadie más puede reservarla). Debe coincidir con el índice único
// parcial: el WHERE excluye CANCELADA, NO_ASISTIO y RECHAZADA.
export const ESTADOS_OCUPAN: EstadoCita[] = ["PENDIENTE", "CONFIRMADA", "EN_COLA", "ATENDIDA"];

// Cuentan para el límite de citas por persona (las que aún no ocurrieron).
export const ESTADOS_VIGENTES: EstadoCita[] = ["PENDIENTE", "CONFIRMADA"];

// Lo que muestra la agenda pública.
export const ESTADOS_AGENDA_ACTIVAS: EstadoCita[] = [
  "PENDIENTE",
  "CONFIRMADA",
  "EN_COLA",
  "ATENDIDA",
];

export const puedeAprobar = (e: EstadoCita) => e === "PENDIENTE";
export const puedeRechazar = (e: EstadoCita) => e === "PENDIENTE" || e === "CONFIRMADA";
export const puedeCancelar = (e: EstadoCita) => e === "PENDIENTE" || e === "CONFIRMADA";
