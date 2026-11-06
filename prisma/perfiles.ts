// PERFILES POR RUBRO: los datos iniciales (servicios, horarios, ventanillas) de cada tipo de
// institución. Se elige con SEED_PERFIL=colegio|clinica|oficina al correr el seed.
// Para agregar un rubro nuevo basta con añadir un perfil aquí (no se toca la lógica del seed).
//
// Horas en minutos desde medianoche (08:00 = 480). Días: 1 = lunes ... 7 = domingo.
// OJO: no uses el prefijo "R" en un servicio: los códigos de cita empiezan con "R-" y se
// confundirían con los turnos ("R-007").

export interface PerfilServicio {
  nombre: string;
  prefijo: string;
  duracionMin: number;
  requiereAprobacion: boolean;
}

export interface PerfilHorario {
  dias: number[];
  bloques: [inicioMin: number, finMin: number][];
}

export interface Perfil {
  sedeNombre: string;
  sedeDireccion: string;
  horarios: PerfilHorario[];
  servicios: PerfilServicio[];
  ventanillas: { nombre: string; servicios: string[] }[]; // nombres de servicios
}

const hm = (h: number, m = 0) => h * 60 + m;

export const PERFILES: Record<string, Perfil> = {
  colegio: {
    sedeNombre: "Unidad Educativa (demo)",
    sedeDireccion: "Dirección de ejemplo",
    horarios: [
      {
        dias: [1, 2, 3, 4, 5],
        bloques: [
          [hm(8), hm(12)],
          [hm(14, 30), hm(18)],
        ],
      },
    ],
    // Dirección sí requiere aprobación (el director decide); los trámites simples se confirman solos.
    servicios: [
      {
        nombre: "Inscripciones y matrícula",
        prefijo: "I",
        duracionMin: 20,
        requiereAprobacion: false,
      },
      { nombre: "Caja - Pensiones", prefijo: "P", duracionMin: 10, requiereAprobacion: false },
      {
        nombre: "Certificados y documentos",
        prefijo: "C",
        duracionMin: 15,
        requiereAprobacion: false,
      },
      { nombre: "Atención de Dirección", prefijo: "D", duracionMin: 30, requiereAprobacion: true },
    ],
    ventanillas: [
      {
        nombre: "Secretaría",
        servicios: ["Inscripciones y matrícula", "Certificados y documentos"],
      },
      { nombre: "Caja", servicios: ["Caja - Pensiones"] },
      { nombre: "Dirección", servicios: ["Atención de Dirección"] },
    ],
  },

  clinica: {
    sedeNombre: "Clínica (demo)",
    sedeDireccion: "Dirección de ejemplo",
    horarios: [
      {
        dias: [1, 2, 3, 4, 5],
        bloques: [
          [hm(7, 30), hm(12, 30)],
          [hm(14), hm(18)],
        ],
      },
      { dias: [6], bloques: [[hm(8), hm(12)]] },
    ],
    servicios: [
      { nombre: "Consulta general", prefijo: "G", duracionMin: 20, requiereAprobacion: false },
      { nombre: "Pediatría", prefijo: "P", duracionMin: 30, requiereAprobacion: false },
      { nombre: "Laboratorio", prefijo: "L", duracionMin: 10, requiereAprobacion: false },
      // Una especialidad suele requerir confirmar con el médico: queda pendiente hasta aprobarla.
      { nombre: "Especialidades", prefijo: "E", duracionMin: 30, requiereAprobacion: true },
    ],
    ventanillas: [
      { nombre: "Recepción", servicios: ["Consulta general", "Pediatría", "Especialidades"] },
      { nombre: "Laboratorio", servicios: ["Laboratorio"] },
    ],
  },

  oficina: {
    sedeNombre: "Oficina de atención (demo)",
    sedeDireccion: "Dirección de ejemplo",
    horarios: [{ dias: [1, 2, 3, 4, 5], bloques: [[hm(8, 30), hm(16)]] }],
    servicios: [
      { nombre: "Trámites generales", prefijo: "T", duracionMin: 15, requiereAprobacion: false },
      { nombre: "Pagos y recaudaciones", prefijo: "P", duracionMin: 10, requiereAprobacion: false },
      { nombre: "Certificaciones", prefijo: "C", duracionMin: 15, requiereAprobacion: false },
      { nombre: "Reclamos y consultas", prefijo: "Q", duracionMin: 20, requiereAprobacion: true },
    ],
    ventanillas: [
      { nombre: "Ventanilla 1", servicios: ["Trámites generales", "Certificaciones"] },
      { nombre: "Ventanilla 2", servicios: ["Pagos y recaudaciones"] },
      { nombre: "Atención al usuario", servicios: ["Reclamos y consultas"] },
    ],
  },
};
