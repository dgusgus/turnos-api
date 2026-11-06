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
  // Cómo cierra la CITA o FICHA de origen (si el turno nació de una).
  cierre?: "ATENDIDA" | "NO_ASISTIO";
}

export const TRANSICIONES: Record<Accion, Transicion> = {
  iniciar: { desde: "LLAMADO", a: "ATENDIENDO", marca: "inicioAtencionEn" },
  finalizar: { desde: "ATENDIENDO", a: "FINALIZADO", marca: "finAtencionEn", cierre: "ATENDIDA" },
  noSePresento: { desde: "LLAMADO", a: "NO_SE_PRESENTO", cierre: "NO_ASISTIO" },
  cancelar: { desde: "ESPERANDO", a: "CANCELADO", cierre: "NO_ASISTIO" },
};

export const TEXTO_ACCION: Record<Accion, string> = {
  iniciar: "iniciar la atención de",
  finalizar: "finalizar",
  noSePresento: "marcar como «no se presentó»",
  cancelar: "cancelar",
};

// Orden en que se atiende la cola. Se usa en «Llamar siguiente» Y en la pantalla pública, para que
// ambas coincidan. 1) prioridad (preferencial → cita/ficha → normal); 2) dentro de ella, las
// FICHAS por su número; 3) por orden de llegada. (`nulls: "last"`: lo que no es ficha va después.)
export const ORDEN_DE_ATENCION = [
  { prioridad: "asc" },
  { numeroFicha: { sort: "asc", nulls: "last" } },
  { creadoEn: "asc" },
] as const;

/** "A" + 7 → "A-007" */
export const codigoTurno = (prefijo: string, numero: number) =>
  `${prefijo}-${String(numero).padStart(3, "0")}`;

/** Ficha: "P" + 12 → "P-F012" (no se confunde con el turno "P-012") */
export const codigoFicha = (prefijo: string, numero: number) =>
  `${prefijo}-F${String(numero).padStart(3, "0")}`;

/** Lo que escribe la gente ya normalizado ("PF012") → prefijo y número, o null si no es una ficha. */
export function leerCodigoFicha(normalizado: string) {
  const m = /^([A-Z]{1,2})F(\d{1,4})$/.exec(normalizado);
  return m ? { prefijo: m[1] as string, numero: Number(m[2]) } : null;
}
