// Utilidades de fecha y hora en la zona horaria de la SEDE (ej. "America/La_Paz").
//
// Por qué existe: la BD guarda instantes en UTC, pero "08:00" significa 08:00 en la
// sede. Estas funciones convierten entre "fecha local + minutos desde medianoche"
// (como se guardan los horarios) y el instante UTC real. Solo usa Intl: sin librerías.

export interface PartesLocales {
  fecha: string; // "2026-11-05"
  min: number; // minutos desde medianoche local (08:00 = 480)
}

const formatos = new Map<string, Intl.DateTimeFormat>();

function formato(tz: string) {
  let f = formatos.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatos.set(tz, f);
  }
  return f;
}

function partes(date: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of formato(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Qué fecha y hora local es un instante UTC en esa zona horaria. */
export function partesLocales(date: Date, tz: string): PartesLocales {
  const p = partes(date, tz);
  return {
    fecha: `${p.year}-${dosDigitos(p.month)}-${dosDigitos(p.day)}`,
    min: p.hour * 60 + p.minute,
  };
}

// Diferencia (en ms) entre la hora local y UTC en ese instante.
function desfaseMs(date: Date, tz: string) {
  const p = partes(date, tz);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** El instante UTC que corresponde a "esa fecha local a esos minutos desde medianoche". */
export function localAUtc(fecha: string, min: number, tz: string): Date {
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const ref = Date.UTC(y, m - 1, d, 0, min);
  // Dos pasadas: la segunda corrige cambios de horario de verano (Bolivia no tiene).
  const primera = ref - desfaseMs(new Date(ref), tz);
  return new Date(ref - desfaseMs(new Date(primera), tz));
}

/** Fecha de hoy ("YYYY-MM-DD") en la zona horaria de la sede. */
export const hoyLocal = (tz: string, ahora = new Date()) => partesLocales(ahora, tz).fecha;

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Día de la semana ISO: 1 = lunes ... 7 = domingo (igual que HorarioAtencion.diaSemana). */
export function diaSemanaISO(fecha: string): number {
  const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return dow === 0 ? 7 : dow;
}

/** Para columnas `@db.Date` de Prisma. */
export const fechaADate = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

/** 480 → "08:00" */
export const minAHora = (min: number) =>
  `${dosDigitos(Math.floor(min / 60))}:${dosDigitos(min % 60)}`;

/** [inicio, fin) UTC del día local completo. */
export function limitesDelDia(fecha: string, tz: string): { desde: Date; hasta: Date } {
  return { desde: localAUtc(fecha, 0, tz), hasta: localAUtc(sumarDias(fecha, 1), 0, tz) };
}
