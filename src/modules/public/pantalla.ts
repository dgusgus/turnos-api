import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors.js";
import { suscribirCola } from "../../lib/eventos.js";
import { prisma } from "../../lib/prisma.js";
import { fechaADate, hoyLocal } from "../../lib/time.js";
import { ESTADOS_ACTIVOS } from "../turnos/turnos.estados.js";

// PANTALLA PÚBLICA de turnos (la TV de la sala de espera). Sin login.
//
// PRIVACIDAD: solo sale lo que ya es público en la sala: el código del turno ("A-007"), el servicio
// y la ventanilla. NUNCA nombres, estudiantes ni CI. (Mismo criterio que la agenda pública.)

const querySchema = z.object({ sedeId: z.uuid().optional() }); // por defecto, la primera sede activa

async function resolverSede(sedeId?: string) {
  const sede = await prisma.sede.findFirst({
    where: { activa: true, ...(sedeId && { id: sedeId }) },
    orderBy: { creadoEn: "asc" },
    select: { id: true, nombre: true, zonaHoraria: true },
  });
  if (!sede) throw AppError.notFound("Sede no encontrada");
  return sede;
}

// ---- Foto del momento: ventanillas con su turno actual + los próximos en espera ----
export async function pantalla(req: Request, res: Response) {
  const { sedeId } = querySchema.parse(req.query);
  const sede = await resolverSede(sedeId);
  const fecha = fechaADate(hoyLocal(sede.zonaHoraria));

  const [ventanillas, activos] = await Promise.all([
    prisma.ventanilla.findMany({
      where: { sedeId: sede.id, activa: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
    prisma.turno.findMany({
      where: { sedeId: sede.id, fecha, estado: { in: ESTADOS_ACTIVOS } },
      // Mismo orden con el que se llama: preferencial → cita → normal, y por llegada.
      orderBy: [{ prioridad: "asc" }, { creadoEn: "asc" }],
      select: {
        codigo: true,
        estado: true,
        llamadoEn: true,
        ventanillaId: true,
        servicio: { select: { nombre: true } },
      },
      take: 500,
    }),
  ]);

  type Activo = (typeof activos)[number];
  const esperando = activos.filter((t: Activo) => t.estado === "ESPERANDO");

  res.json({
    data: {
      sede: { id: sede.id, nombre: sede.nombre },
      ahora: new Date().toISOString(),
      ventanillas: ventanillas.map((v: { id: string; nombre: string }) => {
        const t = activos.find(
          (x: Activo) =>
            x.ventanillaId === v.id && (x.estado === "LLAMADO" || x.estado === "ATENDIENDO"),
        );
        return {
          id: v.id,
          nombre: v.nombre,
          turno: t
            ? {
                codigo: t.codigo,
                estado: t.estado,
                servicio: t.servicio.nombre,
                // La pantalla compara este valor para saber si hubo una llamada NUEVA (y sonar).
                llamadoEn: t.llamadoEn ? t.llamadoEn.toISOString() : null,
              }
            : null,
        };
      }),
      proximos: esperando
        .slice(0, 8)
        .map((t: Activo) => ({ codigo: t.codigo, servicio: t.servicio.nombre })),
      esperando: esperando.length,
    },
  });
}

// ---- SSE (Server-Sent Events): el servidor EMPUJA un aviso cuando la cola cambia ----
// Es una respuesta HTTP que no termina: queda abierta y el servidor escribe líneas
// "event: cola" cuando algo cambia. El navegador la maneja con `new EventSource(url)` y
// reconecta solo si se corta. No llevamos los datos en el evento: la pantalla, al recibirlo,
// vuelve a pedir la foto de arriba. Así hay UNA sola fuente de verdad y el evento es diminuto.
const MAX_PANTALLAS = 100; // tope de conexiones abiertas (cada una ocupa un socket)
let abiertas = 0;

export async function pantallaEventos(req: Request, res: Response) {
  const { sedeId } = querySchema.parse(req.query);
  const sede = await resolverSede(sedeId);
  if (abiertas >= MAX_PANTALLAS) {
    throw new AppError(503, "BUSY", "Demasiadas pantallas conectadas. Intenta más tarde.");
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx: no acumular la respuesta, enviarla ya
  });
  res.write("retry: 3000\n\n"); // si se corta, el navegador reintenta a los 3 s
  res.write("event: hola\ndata: {}\n\n");

  abiertas++;
  const avisar = () => res.write("event: cola\ndata: {}\n\n");
  const dejarDeEscuchar = suscribirCola(sede.id, avisar);
  // Un comentario cada 25 s mantiene viva la conexión (proxies y routers cierran las "mudas").
  const latido = setInterval(() => res.write(": latido\n\n"), 25_000);

  // Limpieza OBLIGATORIA al cerrarse: si no, cada pantalla que se apaga dejaría un oyente fantasma.
  req.on("close", () => {
    clearInterval(latido);
    dejarDeEscuchar();
    abiertas--;
  });
}
