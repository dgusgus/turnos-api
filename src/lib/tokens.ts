import { createHash, randomBytes, randomInt } from "node:crypto";

// Enlace secreto de una cita: 256 bits aleatorios. Quien lo tiene puede ver y cancelar
// SU cita sin iniciar sesión. Imposible de adivinar; en la BD solo se guarda su hash.
export const generarToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Código corto y legible (se dicta en ventanilla): sin 0/O, 1/I/L, que se confunden.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generarCodigoCita(): string {
  let sufijo = "";
  for (let i = 0; i < 5; i++) sufijo += ALFABETO[randomInt(ALFABETO.length)];
  return `R-${sufijo}`; // "R" de Reserva; los turnos son "A-012", nunca se confunden
}
