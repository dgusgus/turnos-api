/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fichas: reglas de cupo y de fecha, con una BD falsa en memoria (sin PostgreSQL).
//   · la fecha SUGERIDA es la primera con cupo libre
//   · se saltan los días sin atención (fin de semana) y los feriados
//   · no se entrega una ficha si el cupo del día está lleno
//   · cada ficha recibe el siguiente número y su código "P-F001"

const db = vi.hoisted(() => {
  const state: any = { fichas: [], feriados: [] as string[], horarioDias: [1, 2, 3, 4, 5] };
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const servicio = () => ({
    id: "srv-1",
    sedeId: "sede-1",
    nombre: "Pediatría",
    prefijo: "P",
    activo: true,
    fichasPorDia: 2,
    horarios: state.horarioDias.map((d: number) => ({ diaSemana: d })),
  });

  const ficha = {
    findMany: async ({ where }: any) =>
      state.fichas.filter(
        (f: any) =>
          f.estado !== "CANCELADA" &&
          (!where.fecha?.gte || f.fecha >= where.fecha.gte) &&
          (!where.fecha?.lte || f.fecha <= where.fecha.lte),
      ),
    count: async ({ where }: any) =>
      state.fichas.filter((f: any) => iso(f.fecha) === iso(where.fecha) && f.estado !== "CANCELADA")
        .length,
    findFirst: async ({ where }: any) => {
      const del = state.fichas
        .filter((f: any) => iso(f.fecha) === iso(where.fecha))
        .sort((a: any, b: any) => b.numero - a.numero);
      return del[0] ?? null;
    },
    create: async ({ data }: any) => {
      const f = {
        id: `f-${state.fichas.length + 1}`,
        estado: "ACTIVA",
        creadoEn: new Date(),
        ...data,
      };
      state.fichas.push(f);
      return { ...f, servicio: { id: "srv-1", nombre: "Pediatría", prefijo: "P" } };
    },
  };

  const prisma: any = {
    usuario: {
      findUnique: async () => ({
        activo: true,
        sedeId: "sede-1",
        sede: { zonaHoraria: "America/La_Paz" },
      }),
    },
    servicio: { findFirst: async () => servicio() },
    diaNoLaborable: {
      findMany: async () =>
        state.feriados.map((f: string) => ({ fecha: new Date(`${f}T00:00:00Z`) })),
    },
    ficha,
    $queryRaw: async () => [],
    $transaction: async (fn: any) => fn(prisma),
  };
  return { state, prisma };
});

vi.mock("../src/lib/prisma.js", () => ({ prisma: db.prisma }));

import { fichasService } from "../src/modules/fichas/fichas.service.js";
import { leerCodigoFicha } from "../src/modules/turnos/turnos.estados.js";

const llenar = (fecha: string, n: number) => {
  for (let i = 1; i <= n; i++) {
    db.state.fichas.push({
      id: `x-${fecha}-${i}`,
      estado: "ACTIVA",
      fecha: new Date(`${fecha}T00:00:00Z`),
      numero: i,
    });
  }
};

describe("fichas: cupo y fechas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-07T15:00:00Z")); // lunes
    db.state.fichas = [];
    db.state.feriados = [];
    db.state.horarioDias = [1, 2, 3, 4, 5];
  });
  afterEach(() => vi.useRealTimers());

  it("con cupo libre hoy, la sugerida es hoy", async () => {
    const r = await fichasService.cupos("srv-1", "u1");
    expect(r.sugerida).toBe("2030-01-07");
    expect(r.fechas[0]).toMatchObject({ fecha: "2030-01-07", cupo: 2, usadas: 0, libres: 2 });
  });

  it("si hoy se llenó, sugiere el siguiente día con cupo", async () => {
    llenar("2030-01-07", 2);
    const r = await fichasService.cupos("srv-1", "u1");
    expect(r.sugerida).toBe("2030-01-08");
    expect(r.fechas[0]).toMatchObject({ fecha: "2030-01-07", libres: 0 });
  });

  it("salta el fin de semana y los feriados", async () => {
    llenar("2030-01-07", 2);
    llenar("2030-01-08", 2);
    llenar("2030-01-09", 2);
    llenar("2030-01-10", 2);
    llenar("2030-01-11", 2); // viernes lleno → sábado y domingo no hay atención
    db.state.feriados = ["2030-01-14"]; // el lunes siguiente es feriado
    const r = await fichasService.cupos("srv-1", "u1");
    expect(r.sugerida).toBe("2030-01-15");
    expect(r.fechas.map((f) => f.fecha)).not.toContain("2030-01-12");
    expect(r.fechas.map((f) => f.fecha)).not.toContain("2030-01-14");
  });

  it("sin fecha, entrega la ficha en la sugerida y numera: P-F001, P-F002", async () => {
    const base = {
      servicioId: "srv-1",
      nombre: "Ana Pérez",
      documento: null,
      telefono: null,
      referencia: null,
    };
    const a = await fichasService.crear(base, "u1");
    const b = await fichasService.crear(base, "u1");
    expect([a.codigo, b.codigo]).toEqual(["P-F001", "P-F002"]);
    expect(a.fecha.toISOString().slice(0, 10)).toBe("2030-01-07");
    // la tercera ya no cabe hoy: sin fecha explícita pasa a mañana, con numeración propia
    const c = await fichasService.crear(base, "u1");
    expect(c.fecha.toISOString().slice(0, 10)).toBe("2030-01-08");
    expect(c.codigo).toBe("P-F001");
  });

  it("con una fecha llena → 409; con un día sin atención → 400", async () => {
    llenar("2030-01-08", 2);
    const base = {
      servicioId: "srv-1",
      nombre: "Ana Pérez",
      documento: null,
      telefono: null,
      referencia: null,
    };
    await expect(fichasService.crear({ ...base, fecha: "2030-01-08" }, "u1")).rejects.toMatchObject(
      { status: 409 },
    );
    await expect(fichasService.crear({ ...base, fecha: "2030-01-12" }, "u1")).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(fichasService.crear({ ...base, fecha: "2029-12-31" }, "u1")).rejects.toMatchObject(
      { status: 400 },
    );
  });
});

describe("código de ficha", () => {
  it("reconoce lo que escribe la gente ya normalizado, y no confunde citas ni turnos", () => {
    expect(leerCodigoFicha("PF012")).toEqual({ prefijo: "P", numero: 12 });
    expect(leerCodigoFicha("ABF7")).toEqual({ prefijo: "AB", numero: 7 });
    expect(leerCodigoFicha("R-K7M2Q")).toBeNull(); // cita
    expect(leerCodigoFicha("P-012")).toBeNull(); // turno
  });
});
