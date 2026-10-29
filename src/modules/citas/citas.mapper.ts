import { type EstadoCita, puedeCancelar } from "./citas.estados.js";

// Mappers: deciden QUÉ campos de una cita sale de la API. Hay tres "vistas", cada una
// con distinto nivel de privacidad. Lo que no está aquí, no sale nunca.
//
//   agenda      → pública, para cualquiera: código, hora, estado, "J. Mamani". Nada más.
//   consulta    → quien conoce código + CI: estado y motivo de rechazo.
//   seguimiento → quien tiene el enlace secreto: su cita completa.
//   staff       → personal autenticado: todo, incluidos CI y teléfono.

interface ServicioResumen {
  nombre: string;
  prefijo: string;
}

export interface CitaRow {
  id: string;
  codigoPublico: string;
  inicio: Date;
  fin: Date;
  estado: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  estudianteNombre: string;
  estudianteCurso: string;
  motivo: string;
  motivoRechazo: string | null;
  decididaEn: Date | null;
  creadoEn: Date;
  servicio: ServicioResumen & { id?: string };
}

/** "Juan Carlos" + "Mamani Quispe" → "J. Mamani" (no expone el nombre completo). */
export function nombrePublico(nombres: string, apellidos: string): string {
  const inicial = nombres.trim().charAt(0).toUpperCase();
  const apellido = apellidos.trim().split(/\s+/)[0] ?? "";
  return inicial ? `${inicial}. ${apellido}` : apellido;
}

const servicioPublico = (s: ServicioResumen) => ({ nombre: s.nombre, prefijo: s.prefijo });

export const toAgendaItemDto = (c: CitaRow) => ({
  codigo: c.codigoPublico,
  servicio: servicioPublico(c.servicio),
  inicio: c.inicio.toISOString(),
  fin: c.fin.toISOString(),
  estado: c.estado as EstadoCita,
  nombre: nombrePublico(c.nombres, c.apellidos),
});

export const toConsultaDto = (c: CitaRow) => ({
  codigo: c.codigoPublico,
  servicio: servicioPublico(c.servicio),
  inicio: c.inicio.toISOString(),
  fin: c.fin.toISOString(),
  estado: c.estado as EstadoCita,
  motivoRechazo: c.motivoRechazo,
});

export const toSeguimientoDto = (c: CitaRow) => ({
  ...toConsultaDto(c),
  nombres: c.nombres,
  apellidos: c.apellidos,
  estudianteNombre: c.estudianteNombre,
  estudianteCurso: c.estudianteCurso,
  motivo: c.motivo,
  puedeCancelar: puedeCancelar(c.estado as EstadoCita) && c.inicio.getTime() > Date.now(),
});

export const toCitaStaffDto = (c: CitaRow & { solicitante: { documento: string } }) => ({
  id: c.id,
  codigo: c.codigoPublico,
  servicio: { id: c.servicio.id ?? "", nombre: c.servicio.nombre, prefijo: c.servicio.prefijo },
  inicio: c.inicio.toISOString(),
  fin: c.fin.toISOString(),
  estado: c.estado as EstadoCita,
  nombres: c.nombres,
  apellidos: c.apellidos,
  documento: c.solicitante.documento,
  telefono: c.telefono,
  estudianteNombre: c.estudianteNombre,
  estudianteCurso: c.estudianteCurso,
  motivo: c.motivo,
  motivoRechazo: c.motivoRechazo,
  decididaEn: c.decididaEn?.toISOString() ?? null,
  creadoEn: c.creadoEn.toISOString(),
});

export type CitaStaffDto = ReturnType<typeof toCitaStaffDto>;
