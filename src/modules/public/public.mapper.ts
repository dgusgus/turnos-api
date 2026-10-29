// Servicio tal como lo ve el público: solo lo necesario para elegir y reservar.
export interface ServicioPublicoRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  prefijo: string;
  duracionMin: number;
  permiteCita: boolean;
  requiereAprobacion: boolean;
  sede: { id: string; nombre: string };
}

export const toServicioPublicoDto = (s: ServicioPublicoRow) => ({
  id: s.id,
  nombre: s.nombre,
  descripcion: s.descripcion,
  prefijo: s.prefijo,
  duracionMin: s.duracionMin,
  permiteCita: s.permiteCita,
  // El frontend avisa: "esta cita debe ser aprobada por el colegio"
  requiereAprobacion: s.requiereAprobacion,
  sede: { id: s.sede.id, nombre: s.sede.nombre },
});

export type ServicioPublicoDto = ReturnType<typeof toServicioPublicoDto>;
