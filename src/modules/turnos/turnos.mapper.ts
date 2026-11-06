// Lo que la API EXPONE de un turno al personal. Un turno de mostrador trae el nombre que
// escribió el operador; uno de cita toma los datos de la cita (por eso el include de `cita`).
export interface TurnoRow {
  id: string;
  codigo: string;
  estado: string;
  prioridad: string;
  origen: string;
  nombreVisitante: string | null;
  estudianteReferencia: string | null;
  observacion: string | null;
  creadoEn: Date;
  llamadoEn: Date | null;
  inicioAtencionEn: Date | null;
  finAtencionEn: Date | null;
  ficha?: { codigo: string } | null;
  servicio: { id: string; nombre: string; prefijo: string };
  ventanilla: { id: string; nombre: string } | null;
  cita: {
    codigoPublico: string;
    nombres: string;
    apellidos: string;
    estudianteNombre: string;
    inicio: Date;
  } | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const toTurnoDto = (t: TurnoRow) => ({
  id: t.id,
  codigo: t.codigo,
  estado: t.estado,
  prioridad: t.prioridad,
  origen: t.origen,
  servicio: t.servicio,
  ventanilla: t.ventanilla,
  nombre: t.cita ? `${t.cita.nombres} ${t.cita.apellidos}` : t.nombreVisitante,
  estudiante: t.cita ? t.cita.estudianteNombre : t.estudianteReferencia,
  observacion: t.observacion,
  ficha: t.ficha ? { codigo: t.ficha.codigo } : null,
  cita: t.cita ? { codigo: t.cita.codigoPublico, inicio: t.cita.inicio.toISOString() } : null,
  creadoEn: t.creadoEn.toISOString(),
  llamadoEn: iso(t.llamadoEn),
  inicioAtencionEn: iso(t.inicioAtencionEn),
  finAtencionEn: iso(t.finAtencionEn),
});

export type TurnoDto = ReturnType<typeof toTurnoDto>;
