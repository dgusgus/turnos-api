/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Prueba el FLUJO de negocio de las citas (reservar, aprobar, rechazar, cancelar, agenda,
// vencimiento) con una base de datos FALSA en memoria. Sirve para comprobar las reglas
// sin PostgreSQL. No reemplaza a un test de integración con BD real (Nivel 2): el
// índice único parcial y las consultas de Prisma solo se prueban de verdad contra Postgres.

const db = vi.hoisted(() => {
  const OCUPAN = ["PENDIENTE", "CONFIRMADA", "EN_COLA", "ATENDIDA"];
  const state: any = { citas: [], servicio: null, fallos: [], seq: 0 };

  function coincide(c: any, where: any): boolean {
    return Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === "OR") return v.some((w: any) => coincide(c, w));
      if (k === "solicitante") return coincide(c.solicitante, v);
      const val = c[k];
      if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
      if (v && typeof v === "object") {
        if ("in" in v) return v.in.includes(val);
        const t = val?.getTime?.();
        return (!("gte" in v) || t >= v.gte.getTime()) && (!("lt" in v) || t < v.lt.getTime());
      }
      return val === v;
    });
  }

  const prisma: any = {
    servicio: { findFirst: async () => state.servicio },
    diaNoLaborable: { findUnique: async () => null },
    sede: {
      findFirst: async () => state.servicio.sede,
    },
    usuario: {
      findUnique: async () => ({ activo: true, sedeId: null, sede: null }),
    },
    solicitante: {
      upsert: async ({ create }: any) => ({
        id: `sol-${create.documento}`,
        documento: create.documento,
      }),
    },
    cita: {
      findMany: async ({ where }: any) =>
        state.citas
          .filter((c: any) => coincide(c, where))
          .sort((a: any, b: any) => a.inicio - b.inicio),
      findFirst: async ({ where }: any) => state.citas.find((c: any) => coincide(c, where)) ?? null,
      findUnique: async ({ where }: any) =>
        state.citas.find((c: any) => c.tokenHash === where.tokenHash) ?? null,
      count: async ({ where }: any) => state.citas.filter((c: any) => coincide(c, where)).length,
      updateMany: async ({ where, data }: any) => {
        const afectadas = state.citas.filter((c: any) => coincide(c, where));
        afectadas.forEach((c: any) => Object.assign(c, data));
        return { count: afectadas.length };
      },
      create: async ({ data }: any) => {
        const fallo = state.fallos.shift();
        const nueva = (d: any) => ({
          id: `cita-${++state.seq}`,
          creadoEn: new Date(),
          motivoRechazo: null,
          decididaEn: null,
          canceladaEn: null,
          ...d,
          servicio: {
            id: d.servicioId,
            nombre: state.servicio.nombre,
            prefijo: state.servicio.prefijo,
          },
          solicitante: { documento: String(d.solicitanteId).replace("sol-", "") },
        });
        if (fallo === "carrera") {
          // otra persona toma la hora justo antes de que se guarde la nuestra
          state.citas.push(
            nueva({
              ...data,
              codigoPublico: "R-AJENA",
              tokenHash: "ajeno",
              solicitanteId: "sol-999",
            }),
          );
          throw { code: "P2002" };
        }
        if (fallo === "codigo") throw { code: "P2002" };
        const ocupada = state.citas.some(
          (c: any) =>
            c.servicioId === data.servicioId &&
            c.inicio.getTime() === data.inicio.getTime() &&
            OCUPAN.includes(c.estado),
        );
        if (ocupada) throw { code: "P2002" };
        const cita = nueva(data);
        state.citas.push(cita);
        return cita;
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return { state, prisma };
});

vi.mock("../src/lib/prisma.js", () => ({ prisma: db.prisma }));

import { citasService } from "../src/modules/citas/citas.service.js";
import { crearCitaSchema, consultaSchema } from "../src/modules/public/public.dto.js";
import { publicService } from "../src/modules/public/public.service.js";
import { hashToken } from "../src/lib/tokens.js";

const AHORA = new Date("2030-01-07T12:00:00Z"); // lunes 08:00 en La Paz
const SERVICIO_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEDE = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  nombre: "UE demo",
  zonaHoraria: "America/La_Paz",
};
const MAÑANA = {
  h0800: "2030-01-08T12:00:00.000Z",
  h0820: "2030-01-08T12:20:00.000Z",
  h0840: "2030-01-08T12:40:00.000Z",
};

const entrada = (extra: Record<string, unknown> = {}) =>
  crearCitaSchema.parse({
    servicioId: SERVICIO_ID,
    inicio: MAÑANA.h0800,
    nombres: "Juan Carlos",
    apellidos: "Mamani Quispe",
    documento: "1234567-1a",
    telefono: "+591 7123-4567",
    estudianteNombre: "María Mamani",
    estudianteCurso: "3ro B",
    motivo: "Consulta por notas",
    ...extra,
  });

function sembrar(extra: Record<string, unknown>) {
  const c = {
    id: `cita-${++db.state.seq}`,
    codigoPublico: `R-S${db.state.seq}XXXX`.slice(0, 7),
    tokenHash: `hash-${db.state.seq}`,
    servicioId: SERVICIO_ID,
    sedeId: SEDE.id,
    solicitanteId: "sol-12345671A",
    inicio: new Date(MAÑANA.h0800),
    fin: new Date(MAÑANA.h0820),
    estado: "CONFIRMADA",
    nombres: "Juan Carlos",
    apellidos: "Mamani Quispe",
    telefono: "+59171234567",
    estudianteNombre: "María Mamani",
    estudianteCurso: "3ro B",
    motivo: "Consulta por notas",
    motivoRechazo: null,
    decididaEn: null,
    creadoEn: new Date(),
    servicio: { id: SERVICIO_ID, nombre: "Certificados", prefijo: "C" },
    solicitante: { documento: "12345671A" },
    ...extra,
  };
  db.state.citas.push(c);
  return c;
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  db.state.citas = [];
  db.state.fallos = [];
  db.state.servicio = {
    id: SERVICIO_ID,
    sedeId: SEDE.id,
    nombre: "Certificados",
    prefijo: "C",
    duracionMin: 20,
    requiereAprobacion: false,
    activo: true,
    permiteCita: true,
    sede: SEDE,
    horarios: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicioMin: 480, finMin: 540 })),
  };
});

describe("disponibilidad", () => {
  it("lista las franjas del día con su hora local y marca las ocupadas", async () => {
    sembrar({ inicio: new Date(MAÑANA.h0820), estado: "CONFIRMADA" });
    sembrar({ inicio: new Date(MAÑANA.h0840), estado: "CANCELADA" }); // cancelada: la hora está libre
    const r = await publicService.disponibilidad(SERVICIO_ID, "2030-01-08");
    expect(r.franjas.map((f) => [f.hora, f.libre])).toEqual([
      ["08:00", true],
      ["08:20", false],
      ["08:40", true],
    ]);
    expect(r.franjas[0]?.inicio).toBe(MAÑANA.h0800);
  });

  it("el día sin horario (sábado) está cerrado", async () => {
    const r = await publicService.disponibilidad(SERVICIO_ID, "2030-01-12");
    expect(r.franjas).toEqual([]);
    expect(r.cerrado).toBe("Sin atención ese día");
  });

  it("hoy no ofrece horas dentro de la anticipación mínima", async () => {
    const r = await publicService.disponibilidad(SERVICIO_ID, "2030-01-07");
    expect(r.franjas.every((f) => !f.libre)).toBe(true);
  });

  it("rechaza fechas pasadas y demasiado lejanas", async () => {
    await expect(publicService.disponibilidad(SERVICIO_ID, "2030-01-06")).rejects.toMatchObject({
      status: 400,
    });
    await expect(publicService.disponibilidad(SERVICIO_ID, "2031-06-01")).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("reservar (sin cuenta)", () => {
  it("servicio sin aprobación → CONFIRMADA, con código y enlace secreto", async () => {
    const r = await publicService.crear(entrada());
    expect(r.cita.estado).toBe("CONFIRMADA");
    expect(r.cita.codigo).toMatch(/^R-[A-Z0-9]{5}$/);
    expect(r.token.length).toBeGreaterThan(40);
    // en la BD queda solo el HASH del enlace, nunca el enlace
    expect(db.state.citas[0].tokenHash).toBe(hashToken(r.token));
    expect(JSON.stringify(db.state.citas[0])).not.toContain(r.token);
    expect(r.cita).not.toHaveProperty("tokenHash");
  });

  it("servicio con aprobación → PENDIENTE", async () => {
    db.state.servicio.requiereAprobacion = true;
    const r = await publicService.crear(entrada());
    expect(r.cita.estado).toBe("PENDIENTE");
  });

  it("una hora que no es una franja del servicio → 400", async () => {
    await expect(
      publicService.crear(entrada({ inicio: "2030-01-08T12:10:00.000Z" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("una hora ya ocupada → 409", async () => {
    await publicService.crear(entrada());
    await expect(publicService.crear(entrada({ documento: "7654321" }))).rejects.toMatchObject({
      status: 409,
    });
  });

  it("una cita rechazada o cancelada libera la hora", async () => {
    sembrar({ estado: "RECHAZADA" });
    const r = await publicService.crear(entrada({ documento: "7654321" }));
    expect(r.cita.estado).toBe("CONFIRMADA");
  });

  it("máximo 2 citas vigentes por persona (mismo CI)", async () => {
    await publicService.crear(entrada({ inicio: MAÑANA.h0800 }));
    await publicService.crear(entrada({ inicio: MAÑANA.h0820 }));
    await expect(publicService.crear(entrada({ inicio: MAÑANA.h0840 }))).rejects.toMatchObject({
      status: 409,
    });
  });

  it("el límite también cuenta por teléfono, aunque cambien el CI", async () => {
    await publicService.crear(entrada({ documento: "1111111", inicio: MAÑANA.h0800 }));
    await publicService.crear(entrada({ documento: "2222222", inicio: MAÑANA.h0820 }));
    await expect(
      publicService.crear(entrada({ documento: "3333333", inicio: MAÑANA.h0840 })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("si otra persona gana la hora en el último instante → 409 claro", async () => {
    db.state.fallos.push("carrera");
    await expect(publicService.crear(entrada())).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("acaba de ser reservado"),
    });
  });

  it("si el código corto choca por azar, reintenta y reserva igual", async () => {
    db.state.fallos.push("codigo");
    const r = await publicService.crear(entrada());
    expect(r.cita.estado).toBe("CONFIRMADA");
  });
});

describe("mi cita: enlace secreto, código + CI y cancelar", () => {
  it("con el enlace ve su cita completa", async () => {
    const { token } = await publicService.crear(entrada());
    const cita = await publicService.porToken(token);
    expect(cita).toMatchObject({
      nombres: "Juan Carlos",
      estudianteCurso: "3ro B",
      puedeCancelar: true,
    });
  });

  it("un enlace falso → 404", async () => {
    await expect(publicService.porToken("x".repeat(43))).rejects.toMatchObject({ status: 404 });
  });

  it("con código + CI ve el estado, pero no datos personales", async () => {
    const { cita } = await publicService.crear(entrada());
    const r = await publicService.consultar(
      consultaSchema.parse({ codigo: cita.codigo.toLowerCase(), documento: "1234567 1A" }),
    );
    expect(r.estado).toBe("CONFIRMADA");
    expect(r).not.toHaveProperty("nombres");
    expect(r).not.toHaveProperty("estudianteNombre");
  });

  it("CI equivocado o código inexistente dan el MISMO error (no revela nada)", async () => {
    const { cita } = await publicService.crear(entrada());
    const malCi = publicService.consultar(
      consultaSchema.parse({ codigo: cita.codigo, documento: "9999999" }),
    );
    const malCodigo = publicService.consultar(
      consultaSchema.parse({ codigo: "R-ZZZZZ", documento: "1234567-1A" }),
    );
    await expect(malCi).rejects.toMatchObject({
      status: 404,
      message: "No encontramos una cita con esos datos",
    });
    await expect(malCodigo).rejects.toMatchObject({
      status: 404,
      message: "No encontramos una cita con esos datos",
    });
  });

  it("cancelar libera la hora; cancelar dos veces → 409", async () => {
    const { token } = await publicService.crear(entrada());
    const r = await publicService.cancelar(token);
    expect(r.estado).toBe("CANCELADA");
    expect(r.puedeCancelar).toBe(false);
    await expect(publicService.cancelar(token)).rejects.toMatchObject({ status: 409 });
    const otra = await publicService.crear(entrada({ documento: "7654321" })); // la hora volvió a estar libre
    expect(otra.cita.estado).toBe("CONFIRMADA");
  });
});

describe("agenda pública", () => {
  it("separa activas y rechazadas, ordenadas por hora, y no expone datos personales", async () => {
    sembrar({ inicio: new Date(MAÑANA.h0820), codigoPublico: "R-BBBBB" });
    sembrar({ inicio: new Date(MAÑANA.h0800), codigoPublico: "R-AAAAA", estado: "PENDIENTE" });
    sembrar({
      inicio: new Date(MAÑANA.h0840),
      codigoPublico: "R-CCCCC",
      estado: "RECHAZADA",
      motivoRechazo: "Director de viaje",
    });
    sembrar({ inicio: new Date(MAÑANA.h0840), codigoPublico: "R-DDDDD", estado: "CANCELADA" });

    const a = await publicService.agenda({ fecha: "2030-01-08" });
    expect(a.activas.map((c) => c.codigo)).toEqual(["R-AAAAA", "R-BBBBB"]);
    expect(a.activas[0]?.estado).toBe("PENDIENTE");
    expect(a.rechazadas.map((c) => c.codigo)).toEqual(["R-CCCCC"]); // las canceladas no aparecen
    expect(a.activas[0]?.nombre).toBe("J. Mamani");

    const texto = JSON.stringify(a);
    for (const privado of [
      "12345671A",
      "7123",
      "Consulta",
      "María",
      "Director de viaje",
      "Juan Carlos",
    ]) {
      expect(texto).not.toContain(privado);
    }
  });

  it("una cita PENDIENTE sin respuesta vence sola y pasa a rechazadas", async () => {
    sembrar({
      estado: "PENDIENTE",
      codigoPublico: "R-VIEJA",
      creadoEn: new Date(AHORA.getTime() - 25 * 3600_000),
    });
    sembrar({
      estado: "PENDIENTE",
      codigoPublico: "R-NUEVA",
      inicio: new Date(MAÑANA.h0820),
      creadoEn: new Date(AHORA.getTime() - 1 * 3600_000),
    });
    const a = await publicService.agenda({ fecha: "2030-01-08" });
    expect(a.rechazadas.map((c) => c.codigo)).toEqual(["R-VIEJA"]);
    expect(a.activas.map((c) => c.codigo)).toEqual(["R-NUEVA"]);
  });
});

describe("personal: aprobar y rechazar", () => {
  it("aprobar una PENDIENTE la confirma y registra quién decidió", async () => {
    const c = sembrar({ estado: "PENDIENTE" });
    const r = await citasService.aprobar(c.id, "operador-1");
    expect(r.estado).toBe("CONFIRMADA");
    expect(db.state.citas[0].decididaPorId).toBe("operador-1");
  });

  it("no se puede aprobar lo que no está pendiente → 409", async () => {
    const c = sembrar({ estado: "CONFIRMADA" });
    await expect(citasService.aprobar(c.id, "operador-1")).rejects.toMatchObject({ status: 409 });
  });

  it("rechazar guarda el motivo (lo lee quien reservó) y libera la hora", async () => {
    const { token } = await (async () => {
      db.state.servicio.requiereAprobacion = true;
      return publicService.crear(entrada());
    })();
    const id = db.state.citas[0].id;
    await citasService.rechazar(id, "El director no atiende ese día", "operador-1");

    const mia = await publicService.porToken(token);
    expect(mia.estado).toBe("RECHAZADA");
    expect(mia.motivoRechazo).toBe("El director no atiende ese día");

    const libre = await publicService.disponibilidad(SERVICIO_ID, "2030-01-08");
    expect(libre.franjas[0]?.libre).toBe(true);
  });

  it("una cita atendida ya no se puede rechazar → 409", async () => {
    const c = sembrar({ estado: "ATENDIDA" });
    await expect(citasService.rechazar(c.id, "motivo", "operador-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("una cita que no existe → 404", async () => {
    await expect(citasService.aprobar("no-existe", "operador-1")).rejects.toMatchObject({
      status: 404,
    });
  });
});
