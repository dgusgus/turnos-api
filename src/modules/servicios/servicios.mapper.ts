import { minAHora } from "../../lib/time.js";

// Mapper: de la fila de la BD a lo que la API EXPONE. Aquí los horarios vuelven a ser
// "08:00" (legibles) y salen ordenados: lunes primero, y dentro del día por hora.
export interface ServicioRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  prefijo: string;
  duracionMin: number;
  permiteCita: boolean;
  requiereAprobacion: boolean;
  activo: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
  horarios: { id: string; diaSemana: number; inicioMin: number; finMin: number }[];
}

export const toServicioDto = (s: ServicioRow) => ({
  id: s.id,
  nombre: s.nombre,
  descripcion: s.descripcion,
  prefijo: s.prefijo,
  duracionMin: s.duracionMin,
  permiteCita: s.permiteCita,
  requiereAprobacion: s.requiereAprobacion,
  activo: s.activo,
  horarios: [...s.horarios]
    .sort((a, b) => a.diaSemana - b.diaSemana || a.inicioMin - b.inicioMin)
    .map((h) => ({
      id: h.id,
      diaSemana: h.diaSemana,
      desde: minAHora(h.inicioMin),
      hasta: minAHora(h.finMin),
    })),
  creadoEn: s.creadoEn.toISOString(),
  actualizadoEn: s.actualizadoEn.toISOString(),
});

export type ServicioDto = ReturnType<typeof toServicioDto>;
