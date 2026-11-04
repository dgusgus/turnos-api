import { EventEmitter } from "node:events";

// Un "tablero de avisos" en memoria: quien cambia la cola GRITA («¡cambió la sede X!») y quien
// esté escuchando (las pantallas públicas conectadas por SSE) se entera al instante.
//
// LÍMITE: vive en la memoria de UN proceso. Con varias instancias del servidor (escalado),
// un cambio en la instancia A no llegaría a las pantallas conectadas a la B. Nivel 2: Redis
// pub/sub o LISTEN/NOTIFY de PostgreSQL. Para un colegio con un solo servidor es suficiente.
const bus = new EventEmitter();
bus.setMaxListeners(0); // cada pantalla conectada es un oyente; el tope real lo pone MAX_PANTALLAS

const canal = (sedeId: string) => `cola:${sedeId}`;

export const emitirCola = (sedeId: string) => bus.emit(canal(sedeId));

/** Devuelve la función para DEJAR de escuchar (hay que llamarla al cerrarse la conexión). */
export function suscribirCola(sedeId: string, fn: () => void) {
  bus.on(canal(sedeId), fn);
  return () => bus.off(canal(sedeId), fn);
}
