import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { consultaSchema, crearCitaSchema } from "../src/modules/public/public.dto.js";

// API pública (sin login). Sin base de datos: validación y normalización de entradas.
const app = createApp();
const UUID = "11111111-1111-4111-8111-111111111111";

const citaValida = {
  servicioId: UUID,
  inicio: "2030-01-07T12:00:00.000Z",
  nombres: "Juan Carlos",
  apellidos: "Mamani Quispe",
  documento: "1234567-1a",
  telefono: "+591 7123-4567",
  estudianteNombre: "María Mamani",
  estudianteCurso: "3ro B",
  motivo: "Consulta por notas",
};

const campos = (res: { body: { error: { details: { path: string }[] } } }) =>
  res.body.error.details.map((d) => d.path);

describe("rutas públicas: validación", () => {
  it("disponibilidad sin parámetros → 400", async () => {
    const res = await request(app).get("/api/v1/public/disponibilidad");
    expect(res.status).toBe(400);
    expect(campos(res)).toEqual(expect.arrayContaining(["servicioId", "fecha"]));
  });

  it("disponibilidad con fecha mal escrita → 400", async () => {
    const res = await request(app).get(
      `/api/v1/public/disponibilidad?servicioId=${UUID}&fecha=05-11-2030`,
    );
    expect(res.status).toBe(400);
    expect(campos(res)).toContain("fecha");
  });

  it("agenda con fecha inválida → 400", async () => {
    const res = await request(app).get("/api/v1/public/agenda?fecha=mañana");
    expect(res.status).toBe(400);
  });

  it("reservar con body vacío → 400 y lista TODOS los campos que faltan", async () => {
    const res = await request(app).post("/api/v1/public/citas").send({});
    expect(res.status).toBe(400);
    expect(campos(res)).toEqual(
      expect.arrayContaining([
        "servicioId",
        "inicio",
        "nombres",
        "apellidos",
        "documento",
        "telefono",
        "estudianteNombre",
        "motivo",
      ]),
    );
    // El curso es opcional (solo los colegios lo piden): su ausencia no es un error.
    expect(campos(res)).not.toContain("estudianteCurso");
  });

  it("reservar con teléfono inválido → 400", async () => {
    const res = await request(app)
      .post("/api/v1/public/citas")
      .send({ ...citaValida, telefono: "abc" });
    expect(res.status).toBe(400);
    expect(campos(res)).toContain("telefono");
  });

  it("consultar con código inválido → 400", async () => {
    const res = await request(app)
      .post("/api/v1/public/citas/consulta")
      .send({ codigo: "hola", documento: "1234567" });
    expect(res.status).toBe(400);
    expect(campos(res)).toContain("codigo");
  });

  it("enlace demasiado corto → 400 (ni siquiera consulta la BD)", async () => {
    const res = await request(app).get("/api/v1/public/citas/abc");
    expect(res.status).toBe(400);
  });

  it("las respuestas públicas no se guardan en caché", async () => {
    const res = await request(app).get("/api/v1/public/agenda?fecha=mañana");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("normalización de entradas", () => {
  it("CI: sin espacios ni guiones, en mayúsculas", () => {
    const a = crearCitaSchema.parse(citaValida);
    const b = crearCitaSchema.parse({ ...citaValida, documento: " 1234567 1A " });
    expect(a.documento).toBe("12345671A");
    expect(b.documento).toBe(a.documento);
  });

  it("teléfono: solo + y dígitos", () => {
    expect(crearCitaSchema.parse(citaValida).telefono).toBe("+59171234567");
  });

  it("textos: recorta y colapsa espacios", () => {
    const r = crearCitaSchema.parse({ ...citaValida, nombres: "  Juan    Carlos " });
    expect(r.nombres).toBe("Juan Carlos");
  });

  it("código de cita: acepta como lo escriba la gente", () => {
    for (const texto of ["r-k7m2q", "R K7M2Q", "RK7M2Q", " R-K7M2Q "]) {
      expect(consultaSchema.parse({ codigo: texto, documento: "1234567" }).codigo).toBe("R-K7M2Q");
    }
  });

  it("hora de inicio: exige formato ISO en UTC", () => {
    expect(() => crearCitaSchema.parse({ ...citaValida, inicio: "mañana a las 8" })).toThrow();
  });
});
