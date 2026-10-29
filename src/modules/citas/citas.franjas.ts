// Cálculo de franjas (los "huecos" reservables de un día). Funciones puras:
// no tocan la BD, por eso se prueban sin base de datos.

export interface Ventana {
  inicioMin: number;
  finMin: number;
}

export interface Franja {
  inicioMin: number;
  finMin: number;
}

/**
 * Parte cada ventana de atención en franjas de `duracionMin` minutos.
 * Ej.: 08:00-09:00 con 20 min → 08:00, 08:20, 08:40. Una franja que no cabe completa
 * dentro de la ventana no se genera. Ventanas solapadas no duplican franjas.
 */
export function generarFranjas(ventanas: Ventana[], duracionMin: number): Franja[] {
  if (duracionMin <= 0) return [];
  const porInicio = new Map<number, Franja>();
  for (const v of ventanas) {
    for (let t = v.inicioMin; t + duracionMin <= v.finMin; t += duracionMin) {
      porInicio.set(t, { inicioMin: t, finMin: t + duracionMin });
    }
  }
  return [...porInicio.values()].sort((a, b) => a.inicioMin - b.inicioMin);
}
