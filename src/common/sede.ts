import { AppError } from "./errors.js";
import { prisma } from "../lib/prisma.js";

// ¿Sobre QUÉ sede trabaja el personal que hace la petición?
//
// Regla de seguridad: el `sedeId` NUNCA viene del body ni de la URL, porque el cliente podría
// mandar el de otro colegio. Sale del usuario autenticado (su sede asignada). Así todas las
// consultas del ADMIN quedan "encerradas" en su sede.
//
// Nivel 1 = un solo colegio: un ADMIN sin sede asignada trabaja sobre la primera sede activa.
// Nivel 2 (varias sedes): aquí iría el selector de sede del ADMIN.
export async function sedeDelPersonal(actorId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: actorId },
    select: { activo: true, sedeId: true, sede: { select: { zonaHoraria: true } } },
  });
  if (!usuario || !usuario.activo) throw AppError.unauthorized("Sesión inválida");

  if (usuario.sedeId && usuario.sede) {
    return { sedeId: usuario.sedeId, tz: usuario.sede.zonaHoraria };
  }

  const sede = await prisma.sede.findFirst({
    where: { activa: true },
    orderBy: { creadoEn: "asc" },
    select: { id: true, zonaHoraria: true },
  });
  if (!sede) throw AppError.conflict("No hay ninguna sede activa. Crea una primero (seed).");
  return { sedeId: sede.id, tz: sede.zonaHoraria };
}
