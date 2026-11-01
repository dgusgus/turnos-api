// Reglas de los horarios de atención. Son funciones PURAS (no tocan la BD ni Express):
// reciben datos, devuelven un texto de error o null. Por eso se prueban sin base de datos.

export interface VentanaDia {
  diaSemana: number; // 1 = lunes ... 7 = domingo
  inicioMin: number; // minutos desde medianoche (08:00 = 480)
  finMin: number;
}

const NOMBRE_DIA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const hora = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Revisa que las ventanas de atención tengan sentido:
 *  1. el inicio es ANTES del fin,
 *  2. cada ventana cabe al menos una vez la duración del servicio (si no, no genera ninguna franja),
 *  3. en un mismo día no se solapan (08:00-12:00 y 11:00-13:00 sería ambiguo).
 * Varias ventanas por día SÍ se permiten: es el "turno partido" (mañana y tarde).
 * Devuelve el primer problema encontrado, o null si todo está bien.
 */
export function validarVentanas(ventanas: VentanaDia[], duracionMin: number): string | null {
  for (const v of ventanas) {
    const dia = NOMBRE_DIA[v.diaSemana] ?? `día ${v.diaSemana}`;
    if (v.inicioMin >= v.finMin) {
      return `El ${dia}: la hora de inicio (${hora(v.inicioMin)}) debe ser anterior a la de fin (${hora(v.finMin)})`;
    }
    if (v.finMin - v.inicioMin < duracionMin) {
      return `El ${dia}: ${hora(v.inicioMin)}-${hora(v.finMin)} es más corto que la duración del servicio (${duracionMin} min), no habría ninguna cita`;
    }
  }

  for (let dia = 1; dia <= 7; dia++) {
    const delDia = ventanas
      .filter((v) => v.diaSemana === dia)
      .sort((a, b) => a.inicioMin - b.inicioMin);
    for (let i = 1; i < delDia.length; i++) {
      const anterior = delDia[i - 1]!;
      const actual = delDia[i]!;
      // Si la siguiente empieza ANTES de que termine la anterior, se pisan.
      // (Que una termine justo cuando empieza la otra, 12:00 y 12:00, es válido.)
      if (actual.inicioMin < anterior.finMin) {
        return `El ${NOMBRE_DIA[dia]}: ${hora(anterior.inicioMin)}-${hora(anterior.finMin)} se solapa con ${hora(actual.inicioMin)}-${hora(actual.finMin)}`;
      }
    }
  }
  return null;
}
