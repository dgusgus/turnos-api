// Mapper: convierte la fila de la BD en lo que la API EXPONE.
// Aquí se elimina `passwordHash` y se formatean las fechas.
export interface UsuarioRow {
  id: string;
  email: string;
  nombre: string;
  rol: "ADMIN" | "OPERADOR";
  activo: boolean;
  sedeId: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export const toUsuarioDto = (u: UsuarioRow) => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  rol: u.rol,
  activo: u.activo,
  sedeId: u.sedeId,
  creadoEn: u.creadoEn.toISOString(),
  actualizadoEn: u.actualizadoEn.toISOString(),
});

export type UsuarioDto = ReturnType<typeof toUsuarioDto>;
