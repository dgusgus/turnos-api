// Ciclo de vida de un TURNO (la posición en la cola de HOY):
//
//   ESPERANDO ──llamar──▶ LLAMADO ──iniciar──▶ ATENDIENDO ──finalizar──▶ FINALIZADO
//       │                    └──no llegó──▶ NO_SE_PRESENTO
//       └──cancelar──▶ CANCELADO
//
// Cada acción del operador es una "transición": solo vale desde ciertos estados.
// Declarar la tabla aquí (y no en if sueltos) hace que las reglas se vean de un vistazo.

export type EstadoTurno =
  "ESPERANDO" | "LLAMADO" | "ATENDIENDO" | "FINALIZADO" | "NO_SE_PRESENTO" | "CANCELADO";

export type PrioridadTurno = "PREFERENCIAL" | "CITA" | "NORMAL";

// Los que siguen "vivos" en la cola de hoy.
export const ESTADOS_ACTIVOS: EstadoTurno[] = ["ESPERANDO", "LLAMADO", "ATENDIENDO"];

// Estados que ocupan una ventanilla (solo puede tener UNO a la vez).
export const ESTADOS_EN_VENTANILLA: EstadoTurno[] = ["LLAMADO", "ATENDIENDO"];

export type Accion = "iniciar" | "finalizar" | "noSePresento" | "cancelar";

interface Transicion {
  desde: EstadoTurno;
  a: EstadoTurno;
  // Marca de tiempo que se llena (para reportes y tiempos de espera).
  marca?: "inicioAtencionEn" | "finAtencionEn";
  // Qué pasa con la CITA de origen (si el turno nació de una cita).
  cita?: "ATENDIDA" | "NO_ASISTIO";
}

export const TRANSICIONES: Record<Accion, Transicion> = {
  iniciar: { desde: "LLAMADO", a: "ATENDIENDO", marca: "inicioAtencionEn" },
  finalizar: { desde: "ATENDIENDO", a: "FINALIZADO", marca: "finAtencionEn", cita: "ATENDIDA" },
  noSePresento: { desde: "LLAMADO", a: "NO_SE_PRESENTO", cita: "NO_ASISTIO" },
  cancelar: { desde: "ESPERANDO", a: "CANCELADO", cita: "NO_ASISTIO" },
};

export const TEXTO_ACCION: Record<Accion, string> = {
  iniciar: "iniciar la atención de",
  finalizar: "finalizar",
  noSePresento: "marcar como «no se presentó»",
  cancelar: "cancelar",
};

/** "A" + 7 → "A-007" */
export const codigoTurno = (prefijo: string, numero: number) =>
  `${prefijo}-${String(numero).padStart(3, "0")}`;
