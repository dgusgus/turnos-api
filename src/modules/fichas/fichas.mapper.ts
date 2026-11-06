export interface FichaRow {
  id: string;
  codigo: string;
  estado: string;
  fecha: Date;
  numero: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  referencia: string | null;
  creadoEn: Date;
  servicio: { id: string; nombre: string; prefijo: string };
}

export const toFichaDto = (f: FichaRow) => ({
  id: f.id,
  codigo: f.codigo,
  estado: f.estado,
  fecha: f.fecha.toISOString().slice(0, 10), // la columna es solo-fecha: "AAAA-MM-DD"
  numero: f.numero,
  nombre: f.nombre,
  documento: f.documento,
  telefono: f.telefono,
  referencia: f.referencia,
  servicio: f.servicio,
  creadoEn: f.creadoEn.toISOString(),
});

export type FichaDto = ReturnType<typeof toFichaDto>;
