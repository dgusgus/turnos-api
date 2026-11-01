/* eslint-disable @typescript-eslint/no-explicit-any */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Paso 2: servicios, horarios y días no laborables.
// Tres niveles de prueba (de más simple a más completo):
//   1) funciones puras (validarVentanas, DTO)         → sin nada
//   2) HTTP: permisos y validación                    → sin BD (corren ANTES de Prisma)
//   3) reglas del service con una BD falsa en memoria → sin PostgreSQL

const db = vi.hoisted(() => {
  const state: any = {
    servicios: [],
    horarios: [],
    dias: [],
    citasVigentes: 0,
    historial: 0,
    seq: 0,
  };
  const SEDE = "sede-1";

  const fila = (s: any) => ({
    horarios: state.horarios.filter((h: any) => h.servicioId === s.id),
    creadoEn: new Date("2030-01-01T00:00:00Z"),
    actualizadoEn: new Date("2030-01-01T00:00:00Z"),
    ...s,
  });

  const prisma: any = {
    usuario: {
      findUnique: async () => ({
        activo: true,
        sedeId: SEDE,
        sede: { zonaHoraria: "America/La_Paz" },
      }),
    },
    servicio: {
      findFirst: async ({ where }: any) => {
        const m = state.servicios.filter((s: any) => {
          if (where.sedeId && s.sedeId !== where.sedeId) return false;
          if (where.id && typeof where.id === "string" && s.id !== where.id) return false;
          if (where.id?.not && s.id === where.id.not) return false;
          if (where.OR) {
            return where.OR.some(
              (c: any) =>
                (c.nombre && s.nombre.toLowerCase() === c.nombre.equals.toLowerCase()) ||
                (c.prefijo && s.prefijo === c.prefijo),
            );
          }
          return true;
        });
        return m[0] ? fila(m[0]) : null;
      },
      findMany: async () => state.servicios.map(fila),
      count: async () => state.servicios.length,
      create: async ({ data }: any) => {
        const s = { id: `srv-${++state.seq}`, ...data };
        state.servicios.push(s);
        return fila(s);
      },
      update: async ({ where, data }: any) => {
        const s = state.servicios.find((x: any) => x.id === where.id);
        Object.assign(s, data);
        return fila(s);
      },
      delete: async ({ where }: any) => {
        state.servicios = state.servicios.filter((x: any) => x.id !== where.id);
      },
    },
    horarioAtencion: {
      deleteMany: async ({ where }: any) => {
        state.horarios = state.horarios.filter((h: any) => h.servicioId !== where.servicioId);
      },
      createMany: async ({ data }: any) => {
        for (const d of data) state.horarios.push({ id: `h-${++state.seq}`, ...d });
      },
    },
    cita: {
      count: async ({ where }: any) => (where.estado ? state.citasVigentes : state.historial),
    },
    turno: { count: async () => 0 },
    diaNoLaborable: {
      create: async ({ data }: any) => {
        if (state.dias.some((d: any) => d.fecha.getTime() === data.fecha.getTime())) {
          throw { code: "P2002" };
        }
        const d = { id: `dia-${++state.seq}`, ...data };
        state.dias.push(d);
        return d;
      },
      findFirst: async ({ where }: any) => state.dias.find((d: any) => d.id === where.id) ?? null,
      delete: async ({ where }: any) => {
        state.dias = state.dias.filter((d: any) => d.id !== where.id);
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { state, prisma };
});

vi.mock("../src/lib/prisma.js", () => ({ prisma: db.prisma }));

import { createApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";
import { diasService } from "../src/modules/dias-no-laborables/dias.service.js";
import { validarVentanas } from "../src/modules/servicios/horarios.validacion.js";
import {
  createServicioSchema,
  reemplazarHorariosSchema,
  updateServicioSchema,
} from "../src/modules/servicios/servicios.dto.js";
import { serviciosService } from "../src/modules/servicios/servicios.service.js";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const lunes = (inicioMin: number, finMin: number) => ({ diaSemana: 1, inicioMin, finMin });

// ---------------------------------------------------------------- 1) puras
describe("validarVentanas", () => {
  it("acepta turno partido (mañana y tarde)", () => {
    expect(validarVentanas([lunes(480, 720), lunes(870, 1080)], 15)).toBeNull();
  });

  it("acepta ventanas pegadas (una termina cuando empieza la otra)", () => {
    expect(validarVentanas([lunes(480, 720), lunes(720, 900)], 15)).toBeNull();
  });

  it("rechaza inicio >= fin", () => {
    expect(validarVentanas([lunes(720, 480)], 15)).toMatch(/anterior/);
    expect(validarVentanas([lunes(480, 480)], 15)).toMatch(/anterior/);
  });

  it("rechaza una ventana más corta que la duración del servicio", () => {
    expect(validarVentanas([lunes(480, 490)], 15)).toMatch(/más corto/);
  });

  it("rechaza ventanas que se solapan el mismo día, pero no en días distintos", () => {
    expect(validarVentanas([lunes(480, 720), lunes(700, 900)], 15)).toMatch(/solapa/);
    expect(
      validarVentanas([lunes(480, 720), { diaSemana: 2, inicioMin: 700, finMin: 900 }], 15),
    ).toBeNull();
  });
});

describe("DTO de servicios", () => {
  it("normaliza el prefijo y aplica defaults al crear", () => {
    const s = createServicioSchema.parse({ nombre: "  Caja  ", prefijo: " p " });
    expect(s).toMatchObject({
      nombre: "Caja",
      prefijo: "P",
      duracionMin: 15,
      permiteCita: true,
      requiereAprobacion: false,
      activo: true,
      descripcion: null,
    });
  });

  it("rechaza prefijo con números, duración que no es múltiplo de 5", () => {
    expect(createServicioSchema.safeParse({ nombre: "Caja", prefijo: "P1" }).success).toBe(false);
    expect(
      createServicioSchema.safeParse({ nombre: "Caja", prefijo: "P", duracionMin: 12 }).success,
    ).toBe(false);
  });

  it("PATCH NO hereda los defaults (si no, reiniciaría campos sin avisar)", () => {
    expect(updateServicioSchema.parse({ nombre: "Nuevo" })).toEqual({ nombre: "Nuevo" });
    expect(updateServicioSchema.safeParse({}).success).toBe(false);
  });

  it("los horarios llegan como HH:MM y se convierten a minutos", () => {
    const r = reemplazarHorariosSchema.parse({
      horarios: [{ diaSemana: 1, desde: "08:30", hasta: "12:00" }],
    });
    expect(r.horarios[0]).toEqual({ diaSemana: 1, inicioMin: 510, finMin: 720 });
    expect(
      reemplazarHorariosSchema.safeParse({
        horarios: [{ diaSemana: 8, desde: "08:00", hasta: "09:00" }],
      }).success,
    ).toBe(false);
    expect(
      reemplazarHorariosSchema.safeParse({
        horarios: [{ diaSemana: 1, desde: "8:00", hasta: "09:00" }],
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- 2) HTTP
const app = createApp();
const auth = (rol: "ADMIN" | "OPERADOR") => ({
  Authorization: `Bearer ${signToken({ sub: ADMIN, rol })}`,
});

describe("HTTP: permisos y validación", () => {
  it("sin token → 401", async () => {
    expect((await request(app).get("/api/v1/servicios")).status).toBe(401);
    expect((await request(app).get("/api/v1/dias-no-laborables")).status).toBe(401);
  });

  it("OPERADOR no puede configurar servicios ni días → 403", async () => {
    expect((await request(app).get("/api/v1/servicios").set(auth("OPERADOR"))).status).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/v1/servicios/${ADMIN}/horarios`)
          .set(auth("OPERADOR"))
          .send({ horarios: [] })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).post("/api/v1/dias-no-laborables").set(auth("OPERADOR")).send({})).status,
    ).toBe(403);
  });

  it("crear con datos inválidos → 400 con el campo señalado", async () => {
    const res = await request(app)
      .post("/api/v1/servicios")
      .set(auth("ADMIN"))
      .send({ nombre: "Caja", prefijo: "P1" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d: any) => d.path === "prefijo")).toBe(true);
  });

  it("id que no es UUID → 400; día con fecha inválida → 400", async () => {
    expect((await request(app).get("/api/v1/servicios/abc").set(auth("ADMIN"))).status).toBe(400);
    const r = await request(app)
      .post("/api/v1/dias-no-laborables")
      .set(auth("ADMIN"))
      .send({ fecha: "02/11/2030", motivo: "Feriado" });
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------- 3) service
beforeEach(() => {
  Object.assign(db.state, {
    servicios: [],
    horarios: [],
    dias: [],
    citasVigentes: 0,
    historial: 0,
    seq: 0,
  });
});

const nuevo = (extra: Record<string, unknown> = {}) =>
  createServicioSchema.parse({ nombre: "Caja - Pensiones", prefijo: "P", ...extra });

describe("serviciosService", () => {
  it("crea el servicio en la sede del ADMIN (no la del body)", async () => {
    const s = await serviciosService.create({ ...nuevo(), sedeId: "otra" } as any, ADMIN);
    expect(db.state.servicios[0].sedeId).toBe("sede-1");
    expect(s.prefijo).toBe("P");
  });

  it("no permite prefijo ni nombre repetidos, y dice cuál choca", async () => {
    await serviciosService.create(nuevo(), ADMIN);
    await expect(
      serviciosService.create(nuevo({ nombre: "Otra cosa" }), ADMIN),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("prefijo") });
    await expect(
      serviciosService.create(nuevo({ nombre: "caja - pensiones", prefijo: "Z" }), ADMIN),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("llamado") });
  });

  it("editar un servicio no choca consigo mismo", async () => {
    const s = await serviciosService.create(nuevo(), ADMIN);
    const r = await serviciosService.update(
      s.id,
      { nombre: "Caja - Pensiones", duracionMin: 20 },
      ADMIN,
    );
    expect(r.servicio.duracionMin).toBe(20);
    expect(r.advertencias).toEqual([]);
  });

  it("servicio de otra sede o inexistente → 404", async () => {
    db.state.servicios.push({ id: "x", sedeId: "sede-2", nombre: "Ajeno", prefijo: "X" });
    await expect(serviciosService.getById("x", ADMIN)).rejects.toMatchObject({ status: 404 });
  });

  it("cambiar la duración con citas vigentes AVISA, pero no bloquea", async () => {
    const s = await serviciosService.create(nuevo(), ADMIN);
    db.state.citasVigentes = 3;
    const r = await serviciosService.update(s.id, { duracionMin: 30 }, ADMIN);
    expect(r.servicio.duracionMin).toBe(30);
    expect(r.advertencias[0]).toContain("3 citas vigentes");
  });

  it("desactivar con citas vigentes avisa; sin citas no avisa", async () => {
    const s = await serviciosService.create(nuevo(), ADMIN);
    expect((await serviciosService.update(s.id, { activo: false }, ADMIN)).advertencias).toEqual(
      [],
    );
    await serviciosService.update(s.id, { activo: true }, ADMIN);
    db.state.citasVigentes = 1;
    const r = await serviciosService.update(s.id, { activo: false }, ADMIN);
    expect(r.advertencias[0]).toContain("1 cita vigente");
  });

  it("no se elimina un servicio con historial; sin historial sí", async () => {
    const s = await serviciosService.create(nuevo(), ADMIN);
    db.state.historial = 2;
    await expect(serviciosService.remove(s.id, ADMIN)).rejects.toMatchObject({ status: 409 });
    expect(db.state.servicios).toHaveLength(1);
    db.state.historial = 0;
    await serviciosService.remove(s.id, ADMIN);
    expect(db.state.servicios).toHaveLength(0);
  });

  it("reemplazar horarios: valida contra la duración del servicio", async () => {
    const s = await serviciosService.create(nuevo({ duracionMin: 30 }), ADMIN);
    const corto = reemplazarHorariosSchema.parse({
      horarios: [{ diaSemana: 1, desde: "08:00", hasta: "08:20" }],
    });
    await expect(serviciosService.reemplazarHorarios(s.id, corto, ADMIN)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("reemplazar horarios: deja SOLO los nuevos y los devuelve ordenados", async () => {
    const s = await serviciosService.create(nuevo(), ADMIN);
    const v1 = reemplazarHorariosSchema.parse({
      horarios: [{ diaSemana: 1, desde: "08:00", hasta: "12:00" }],
    });
    await serviciosService.reemplazarHorarios(s.id, v1, ADMIN);
    const v2 = reemplazarHorariosSchema.parse({
      horarios: [
        { diaSemana: 2, desde: "14:30", hasta: "18:00" },
        { diaSemana: 2, desde: "08:00", hasta: "12:00" },
      ],
    });
    const r = await serviciosService.reemplazarHorarios(s.id, v2, ADMIN);
    expect(db.state.horarios).toHaveLength(2);
    expect(db.state.horarios.every((h: any) => h.diaSemana === 2)).toBe(true);
    expect(r.servicio.horarios).toHaveLength(2);
  });

  it("un arreglo vacío deja el servicio sin horarios", async () => {
    const s = await serviciosService.create(nuevo(), ADMIN);
    const r = await serviciosService.reemplazarHorarios(s.id, { horarios: [] }, ADMIN);
    expect(r.servicio.horarios).toEqual([]);
  });
});

describe("diasService", () => {
  const dia = { fecha: "2030-11-02", motivo: "Día de Todos los Santos" };

  it("marca un día y no permite repetirlo", async () => {
    const r = await diasService.create(dia, ADMIN);
    expect(r.dia.motivo).toBe(dia.motivo);
    expect(r.advertencias).toEqual([]);
    await expect(diasService.create(dia, ADMIN)).rejects.toMatchObject({ status: 409 });
  });

  it("avisa si ese día ya hay citas vigentes (no las cancela)", async () => {
    db.state.citasVigentes = 4;
    const r = await diasService.create(dia, ADMIN);
    expect(r.advertencias[0]).toContain("4 citas vigentes");
  });

  it("eliminar un día inexistente → 404", async () => {
    await expect(diasService.remove("nada", ADMIN)).rejects.toMatchObject({ status: 404 });
  });
});
