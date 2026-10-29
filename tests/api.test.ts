import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";

// Estos tests NO necesitan base de datos: comprueban las capas que corren
// ANTES de tocar Prisma (autenticación, permisos, validación, errores).
const app = createApp();

const UUID = "11111111-1111-4111-8111-111111111111";
const tokenAdmin = signToken({ sub: UUID, rol: "ADMIN" });
const tokenOperador = signToken({ sub: "22222222-2222-4222-8222-222222222222", rol: "OPERADOR" });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const detalle = (res: { body: { error: { details: { path: string }[] } } }, campo: string) =>
  res.body.error.details.some((d) => d.path === campo);

describe("infraestructura", () => {
  it("GET /health responde 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("devuelve un X-Request-Id en cada respuesta", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("ruta inexistente → 404 con formato de error estándar", async () => {
    const res = await request(app).get("/api/v1/nada");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("autenticación (solo personal)", () => {
  it("sin token → 401", async () => {
    const res = await request(app).get("/api/v1/users");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("token basura → 401", async () => {
    const res = await request(app).get("/api/v1/users").set("Authorization", "Bearer abc");
    expect(res.status).toBe(401);
  });

  it("login con email inválido → 400 con detalles", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "no-es-email", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].path).toBe("email");
  });

  it("ya NO existe el registro público: el público no tiene cuenta → 404", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "a@b.com", password: "12345678", nombres: "Ana", apellidos: "Pérez" });
    expect(res.status).toBe(404);
  });

  it("un token del rol eliminado SOLICITANTE ya no sirve → 401", async () => {
    const viejo = jwt.sign({ sub: UUID, rol: "SOLICITANTE" }, process.env.JWT_SECRET as string, {
      expiresIn: "1h",
    });
    const res = await request(app).get("/api/v1/users").set(auth(viejo));
    expect(res.status).toBe(401);
  });
});

describe("roles (RBAC)", () => {
  it("OPERADOR no puede gestionar usuarios (solo ADMIN) → 403", async () => {
    const res = await request(app).get("/api/v1/users").set(auth(tokenOperador));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("ADMIN con datos inválidos → 400 (valida antes de tocar la BD)", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set(auth(tokenAdmin))
      .send({ email: "x", password: "1", nombre: "A" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("ADMIN no puede crear un usuario con rol SOLICITANTE → 400", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set(auth(tokenAdmin))
      .send({ email: "a@b.com", password: "12345678", nombre: "Ana", rol: "SOLICITANTE" });
    expect(res.status).toBe(400);
  });

  it("id que no es UUID → 400", async () => {
    const res = await request(app).get("/api/v1/users/123").set(auth(tokenAdmin));
    expect(res.status).toBe(400);
  });

  it("ADMIN no puede quitarse su propio rol → 409 (regla de negocio)", async () => {
    // El service rechaza esto ANTES de consultar la BD
    const res = await request(app)
      .patch(`/api/v1/users/${UUID}`)
      .set(auth(tokenAdmin))
      .send({ rol: "OPERADOR" });
    expect(res.status).toBe(409);
  });
});

describe("bandeja de citas (personal)", () => {
  it("sin sesión → 401", async () => {
    const res = await request(app).get("/api/v1/citas");
    expect(res.status).toBe(401);
  });

  it("aprobar con id inválido → 400", async () => {
    const res = await request(app).post("/api/v1/citas/abc/aprobar").set(auth(tokenOperador));
    expect(res.status).toBe(400);
  });

  it("rechazar sin motivo → 400 (el motivo es obligatorio: lo lee quien reservó)", async () => {
    const res = await request(app)
      .post(`/api/v1/citas/${UUID}/rechazar`)
      .set(auth(tokenOperador))
      .send({});
    expect(res.status).toBe(400);
    expect(detalle(res, "motivo")).toBe(true);
  });

  it("filtro de estado inválido → 400", async () => {
    const res = await request(app).get("/api/v1/citas?estado=INVENTADO").set(auth(tokenOperador));
    expect(res.status).toBe(400);
  });
});
