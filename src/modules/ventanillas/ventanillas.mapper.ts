// Mapper: de la fila de la BD (con la tabla puente) a lo que devuelve la API.
// Aplana `servicios: [{ servicio: {...} }]` a `servicios: [{...}]`.
export interface VentanillaRow {
  id: string;
  nombre: string;
  activa: boolean;
  servicios: { servicio: { id: string; nombre: string; prefijo: string } }[];
}

export const toVentanillaDto = (v: VentanillaRow) => ({
  id: v.id,
  nombre: v.nombre,
  activa: v.activa,
  servicios: v.servicios.map((s) => s.servicio),
});
