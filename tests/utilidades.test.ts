import { describe, expect, it } from "vitest";
import { generarFranjas } from "../src/modules/citas/citas.franjas.js";
import { nombrePublico } from "../src/modules/citas/citas.mapper.js";
import { generarCodigoCita, generarToken, hashToken } from "../src/lib/tokens.js";
import {
  diaSemanaISO,
  hoyLocal,
  limitesDelDia,
  localAUtc,
  minAHora,
  partesLocales,
  sumarDias,
} from "../src/lib/time.js";

const TZ = "America/La_Paz"; // UTC-4 todo el año

describe("zona horaria de la sede", () => {
  it("08:00 en La Paz son las 12:00 UTC", () => {
    expect(localAUtc("2030-01-07", 480, TZ).toISOString()).toBe("2030-01-07T12:00:00.000Z");
  });

  it("ida y vuelta: local → UTC → local", () => {
    const utc = localAUtc("2030-03-15", 14 * 60 + 30, TZ);
    expect(partesLocales(utc, TZ)).toEqual({ fecha: "2030-03-15", min: 870 });
  });

  it("una hora de la noche UTC todavía es el día anterior en La Paz", () => {
    expect(partesLocales(new Date("2030-01-08T02:00:00Z"), TZ)).toEqual({
      fecha: "2030-01-07",
      min: 22 * 60,
    });
  });

  it("hoyLocal usa la fecha de la sede, no la de UTC", () => {
    expect(hoyLocal(TZ, new Date("2030-01-08T02:00:00Z"))).toBe("2030-01-07");
  });

  it("límites del día local: 00:00 a 00:00 en UTC-4", () => {
    const { desde, hasta } = limitesDelDia("2030-01-07", TZ);
    expect(desde.toISOString()).toBe("2030-01-07T04:00:00.000Z");
    expect(hasta.toISOString()).toBe("2030-01-08T04:00:00.000Z");
  });

  it("funciona también con zonas con horario de verano (Nueva York)", () => {
    expect(localAUtc("2030-07-01", 480, "America/New_York").toISOString()).toBe(
      "2030-07-01T12:00:00.000Z",
    );
    expect(localAUtc("2030-01-07", 480, "America/New_York").toISOString()).toBe(
      "2030-01-07T13:00:00.000Z",
    );
  });

  it("sumarDias, diaSemanaISO y minAHora", () => {
    expect(sumarDias("2030-02-28", 1)).toBe("2030-03-01");
    expect(diaSemanaISO("2030-01-07")).toBe(1); // lunes
    expect(diaSemanaISO("2030-01-13")).toBe(7); // domingo
    expect(minAHora(870)).toBe("14:30");
    expect(minAHora(480)).toBe("08:00");
  });
});

describe("franjas de un día", () => {
  it("parte una ventana en franjas de la duración del servicio", () => {
    const f = generarFranjas([{ inicioMin: 480, finMin: 540 }], 20);
    expect(f.map((x) => x.inicioMin)).toEqual([480, 500, 520]);
    expect(f.at(-1)?.finMin).toBe(540);
  });

  it("no genera una franja que no cabe completa", () => {
    expect(generarFranjas([{ inicioMin: 480, finMin: 530 }], 20).map((x) => x.inicioMin)).toEqual([
      480, 500,
    ]);
  });

  it("turno partido: mañana y tarde", () => {
    const f = generarFranjas(
      [
        { inicioMin: 870, finMin: 930 },
        { inicioMin: 480, finMin: 540 },
      ],
      30,
    );
    expect(f.map((x) => x.inicioMin)).toEqual([480, 510, 870, 900]);
  });

  it("ventanas solapadas no duplican franjas; duración inválida → vacío", () => {
    const f = generarFranjas(
      [
        { inicioMin: 480, finMin: 540 },
        { inicioMin: 500, finMin: 560 },
      ],
      20,
    );
    expect(new Set(f.map((x) => x.inicioMin)).size).toBe(f.length);
    expect(generarFranjas([{ inicioMin: 480, finMin: 540 }], 0)).toEqual([]);
  });
});

describe("tokens y códigos", () => {
  it("el token es largo, distinto cada vez, y su hash es estable", () => {
    const a = generarToken();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(generarToken()).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
    expect(hashToken(a)).toHaveLength(64);
  });

  it("el código de cita es corto, legible y sin caracteres confusos", () => {
    for (let i = 0; i < 200; i++) {
      expect(generarCodigoCita()).toMatch(/^R-[A-HJKMNP-Z2-9]{5}$/);
    }
  });
});

describe("privacidad en la agenda pública", () => {
  it("nombre público: inicial + primer apellido", () => {
    expect(nombrePublico("Juan Carlos", "Mamani Quispe")).toBe("J. Mamani");
    expect(nombrePublico("  ana ", " pérez")).toBe("A. pérez");
  });
});
