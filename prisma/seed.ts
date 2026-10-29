import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

// Seed idempotente: puedes correrlo varias veces sin duplicar datos.
// Crea una sede de ejemplo con servicios, horarios, ventanillas y personal.

const SEDE_ID = "00000000-0000-4000-8000-000000000001";
const MANANA = [480, 720] as const; // 08:00 - 12:00 (minutos desde medianoche)
const TARDE = [870, 1080] as const; // 14:30 - 18:00

// requiereAprobacion: la cita queda PENDIENTE hasta que el personal la apruebe.
// Dirección sí (el director decide si atiende); los trámites simples se confirman solos.
const SERVICIOS = [
  { nombre: "Inscripciones y matrícula", prefijo: "I", duracionMin: 20, requiereAprobacion: false },
  { nombre: "Caja - Pensiones", prefijo: "P", duracionMin: 10, requiereAprobacion: false },
  { nombre: "Certificados y documentos", prefijo: "C", duracionMin: 15, requiereAprobacion: false },
  { nombre: "Atención de Dirección", prefijo: "D", duracionMin: 30, requiereAprobacion: true },
];

const VENTANILLAS = [
  { nombre: "Secretaría", servicios: ["Inscripciones y matrícula", "Certificados y documentos"] },
  { nombre: "Caja", servicios: ["Caja - Pensiones"] },
  { nombre: "Dirección", servicios: ["Atención de Dirección"] },
];

async function main() {
  const produccion = process.env.NODE_ENV === "production";
  const email = process.env.SEED_ADMIN_EMAIL ?? (produccion ? undefined : "admin@example.com");
  const password = process.env.SEED_ADMIN_PASSWORD ?? (produccion ? undefined : "Admin12345!");

  if (!email || !password) {
    throw new Error("En producción define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD");
  }

  // Sede
  await prisma.sede.upsert({
    where: { id: SEDE_ID },
    update: {},
    create: { id: SEDE_ID, nombre: "Unidad Educativa (demo)", direccion: "Dirección de ejemplo" },
  });

  // Servicios + horarios (lunes a viernes, mañana y tarde)
  const servicioIds: Record<string, string> = {};
  for (const s of SERVICIOS) {
    const servicio = await prisma.servicio.upsert({
      where: { sedeId_nombre: { sedeId: SEDE_ID, nombre: s.nombre } },
      update: {},
      create: { ...s, sedeId: SEDE_ID },
    });
    servicioIds[s.nombre] = servicio.id;

    if ((await prisma.horarioAtencion.count({ where: { servicioId: servicio.id } })) === 0) {
      const horarios = [1, 2, 3, 4, 5].flatMap((diaSemana) =>
        [MANANA, TARDE].map(([inicioMin, finMin]) => ({
          servicioId: servicio.id,
          diaSemana,
          inicioMin,
          finMin,
        })),
      );
      await prisma.horarioAtencion.createMany({ data: horarios });
    }
  }

  // Ventanillas y qué servicios atiende cada una
  for (const v of VENTANILLAS) {
    await prisma.ventanilla.upsert({
      where: { sedeId_nombre: { sedeId: SEDE_ID, nombre: v.nombre } },
      update: {},
      create: {
        sedeId: SEDE_ID,
        nombre: v.nombre,
        servicios: { create: v.servicios.map((n) => ({ servicioId: servicioIds[n] as string })) },
      },
    });
  }

  // Personal
  await prisma.usuario.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      nombre: "Administrador",
      rol: "ADMIN",
      sedeId: SEDE_ID,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Admin listo: ${email}`);

  if (!produccion) {
    await prisma.usuario.upsert({
      where: { email: "operador@example.com" },
      update: {},
      create: {
        email: "operador@example.com",
        nombre: "Operador de prueba",
        rol: "OPERADOR",
        sedeId: SEDE_ID,
        passwordHash: await hashPassword("Operador12345!"),
      },
    });
    console.log("Operador de prueba: operador@example.com / Operador12345!");
  }

  console.log("Sede, servicios, horarios y ventanillas listos");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
