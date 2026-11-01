# turnos-api

**Sistema de Gestión de Turnos y Citas (SGTC)** para unidades educativas: evita filas con **citas** (reserva con día y hora, desde el celular y sin cuenta) y **turnos** (cola del día, que genera el operador en ventanilla). Este repo es el **backend**; el frontend es `turnos-web`.

Nació de [`starter-api`](../starter-api) (Nivel 1). Stack: Node 22 · pnpm 10 · Express 5 · TypeScript · Prisma 7 · PostgreSQL · Zod · JWT · Pino · Vitest.

## Cómo funciona (la idea)

| Quién                           | Cómo entra                   | Qué hace                                                                               |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| **Público** (padres, tutores)   | **Sin cuenta ni contraseña** | Ve horarios libres, reserva una cita, ve la agenda del día, consulta o cancela su cita |
| **OPERADOR** (secretaría, caja) | Login                        | Aprueba o rechaza citas pendientes; (Paso 4) genera y llama turnos                     |
| **ADMIN**                       | Login                        | Todo lo del operador + gestión del personal (y, Paso 2, servicios y horarios)          |

- **Turnos**: solo los genera el operador en el lugar. No existe ninguna ruta pública para sacar turnos, así que nadie puede llenar la fila con turnos falsos desde su casa.
- **Citas**: se piden desde cualquier lugar. Cada **servicio** decide si su cita queda `CONFIRMADA` al instante o `PENDIENTE` hasta que el personal la apruebe (`Servicio.requiereAprobacion`).
- **Identidad**: por internet no se puede comprobar quién es alguien (el CI no es secreto). Se pide CI, nombre, teléfono y estudiante/curso, y **la identidad se verifica en ventanilla** mirando el carnet. La aprobación del operador valida el pedido (motivo, horario), no la identidad.

### Ciclo de vida de una cita

```
PENDIENTE ──aprobar──▶ CONFIRMADA ──check-in (Paso 4)──▶ EN_COLA ──▶ ATENDIDA
    │                      │  └──no llegó──▶ NO_ASISTIO
    └──rechazar / vence──▶ RECHAZADA        (también desde CONFIRMADA)
PENDIENTE o CONFIRMADA ──la persona cancela──▶ CANCELADA
```

Una cita `PENDIENTE` ocupa la hora. Si nadie responde en `CITA_PENDIENTE_EXPIRA_HORAS` (24 h), o si la hora ya pasó, se **rechaza sola** y la hora vuelve a quedar libre.

## Estado actual

- [x] Modelo de datos completo (`prisma/schema.prisma`)
- [x] Login del personal y gestión de usuarios (`/users`, solo ADMIN). **Ya no hay registro público.**
- [x] **API pública de citas** (sin login): servicios, disponibilidad, reservar, agenda del día, consultar, cancelar
- [x] **Bandeja del personal**: listar, aprobar y rechazar citas (con motivo)
- [x] Seed: sede de ejemplo, 4 servicios (Dirección requiere aprobación), horarios, ventanillas, admin y operador
- [x] **Paso 2: servicios, horarios y días no laborables** (CRUD del ADMIN). Guía para estudiarlo abajo
- [ ] Paso 4: turnos y cola (operador) + check-in de citas · Paso 5: tiempo real y pantalla pública de turnos

## Primer arranque

```bash
pnpm install                       # también genera el cliente de Prisma
cp .env.example .env               # y cambia JWT_SECRET
docker compose up -d db            # PostgreSQL en localhost:5432

# 1) Crear la migración SIN aplicarla
pnpm db:migrate --name init --create-only

# 2) Agregar el índice anti doble reserva (Prisma no puede declararlo en el schema)
cat prisma/sql/citas_indice_unico_parcial.sql >> prisma/migrations/*_init/migration.sql

# 3) Aplicarla
pnpm db:migrate

pnpm db:seed                       # datos de ejemplo
pnpm dev                           # http://localhost:3000
```

Comprobar que el índice quedó creado:

```bash
docker compose exec db psql -U postgres -d turnos_api -c "\d citas"
```

Debe aparecer `citas_servicio_inicio_activa_uk` con `WHERE estado <> ALL (...)`. **Commitea `prisma/migrations/`.**

Usuarios del seed: `admin@example.com` / `Admin12345!` y `operador@example.com` / `Operador12345!`.

> **Importante:** el esquema cambió respecto a la entrega anterior (se quitó `SOLICITANTE`, se agregaron estados y campos a `Cita`). Si ya habías creado la base con la versión anterior, bórrala y repite los pasos (`docker compose down -v` y de nuevo desde el paso 1; borra también `prisma/migrations/` si la habías creado).

## Probar la API a mano

```bash
# Servicios que se pueden reservar
curl localhost:3000/api/v1/public/servicios

# Horarios de un día (usa un servicioId del resultado anterior y un día laborable)
curl "localhost:3000/api/v1/public/disponibilidad?servicioId=<ID>&fecha=2030-01-08"

# Reservar: usa `inicio` tal cual lo devolvió la disponibilidad
curl -X POST localhost:3000/api/v1/public/citas -H 'Content-Type: application/json' -d '{
  "servicioId":"<ID>","inicio":"<INICIO>","nombres":"Juan Carlos","apellidos":"Mamani Quispe",
  "documento":"1234567 1A","telefono":"71234567","estudianteNombre":"María Mamani",
  "estudianteCurso":"3ro B","motivo":"Consulta por notas"}'
# → { data: { token, cita: { codigo: "R-XXXXX", estado, ... } } }   (el token se muestra UNA vez)

curl localhost:3000/api/v1/public/citas/<TOKEN>        # mi cita
curl localhost:3000/api/v1/public/agenda               # agenda de hoy
```

## Endpoints

Respuestas: `{ "data": ..., "meta": ... }` o `{ "error": { "code", "message", "details?", "requestId" } }`.

**Públicos (sin login)** — prefijo `/api/v1/public`

| Método | Ruta                               | Para qué                                              | Límite por IP |
| ------ | ---------------------------------- | ----------------------------------------------------- | ------------- |
| GET    | `/servicios`                       | Servicios reservables (indica `requiereAprobacion`)   | global        |
| GET    | `/disponibilidad?servicioId&fecha` | Franjas del día: libre u ocupada. No dice de quién    | global        |
| GET    | `/agenda?fecha&sedeId&servicioId`  | Agenda del día: `activas` y `rechazadas`              | global        |
| POST   | `/citas`                           | Reservar. Devuelve `token` (enlace secreto) y la cita | 15 / hora     |
| POST   | `/citas/consulta`                  | `{codigo, documento}` → estado y motivo de rechazo    | 30 / 15 min   |
| GET    | `/citas/:token`                    | Mi cita completa (enlace secreto)                     | global        |
| POST   | `/citas/:token/cancelar`           | Cancelar mi cita                                      | 20 / 15 min   |

**Personal (JWT)**

| Método     | Ruta                                                             | Acceso                                            |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| POST       | `/auth/login` · GET `/auth/me`                                   | Público · autenticado                             |
| GET / POST | `/users` · GET / PATCH / DELETE `/users/:id`                     | ADMIN                                             |
| GET        | `/citas?fecha&estado&search&page&limit`                          | ADMIN, OPERADOR (sin `fecha`: de hoy en adelante) |
| POST       | `/citas/:id/aprobar`                                             | ADMIN, OPERADOR                                   |
| POST       | `/citas/:id/rechazar` `{motivo}`                                 | ADMIN, OPERADOR                                   |
| GET / POST | `/servicios` · GET / PATCH / DELETE `/servicios/:id`             | ADMIN (Paso 2)                                    |
| PUT        | `/servicios/:id/horarios` `{horarios:[{diaSemana,desde,hasta}]}` | ADMIN: reemplaza la semana completa               |
| GET / POST | `/dias-no-laborables` · DELETE `/dias-no-laborables/:id`         | ADMIN (feriados, suspensiones)                    |

`PATCH /servicios/:id`, `PUT .../horarios` y `POST /dias-no-laborables` responden `{ data, advertencias: [] }`: guardan igual, pero avisan si el cambio afecta a citas ya reservadas (que **no** se tocan solas).

### Qué ve cada quien (privacidad)

| Dato                           |  Agenda pública  | Código + CI | Enlace secreto |  Personal  |
| ------------------------------ | :--------------: | :---------: | :------------: | :--------: |
| Código, hora, servicio, estado |        ✔         |      ✔      |       ✔        |     ✔      |
| Nombre                         | solo "J. Mamani" |      —      |    completo    |  completo  |
| Motivo de rechazo              |        —         |      ✔      |       ✔        |     ✔      |
| Estudiante, motivo del trámite |        —         |      —      |       ✔        |     ✔      |
| CI y teléfono                  |    **nunca**     |      —      |       —        |     ✔      |
| Cancelar                       |        —         |      —      |       ✔        | (rechazar) |

El código (`R-K7M2Q`) aparece en la agenda pública, por eso **no sirve para cancelar**: cancelar exige el enlace secreto. En la BD solo se guarda el **hash** del enlace, nunca el enlace.

## Reglas configurables (`.env`)

| Variable                      | Por defecto | Qué hace                                                      |
| ----------------------------- | ----------- | ------------------------------------------------------------- |
| `CITA_MAX_ACTIVAS`            | 2           | Citas vigentes por CI **o** teléfono (frena el acaparamiento) |
| `CITA_MAX_DIAS_ANTICIPACION`  | 30          | Hasta cuántos días adelante se reserva                        |
| `CITA_MIN_ANTICIPACION_MIN`   | 60          | No se reserva una hora que empieza en menos de esto           |
| `CITA_PENDIENTE_EXPIRA_HORAS` | 24          | Una cita pendiente sin respuesta se rechaza sola              |

## Modelo de datos

| Grupo        | Modelos                                                                             | Para qué                                                                          |
| ------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Organización | `Sede`, `Usuario`, `Solicitante`                                                    | `Usuario` = personal. `Solicitante` = ficha por CI de quien reserva (sin cuenta). |
| Catálogo     | `Servicio`, `Ventanilla`, `VentanillaServicio`, `HorarioAtencion`, `DiaNoLaborable` | Qué se atiende, dónde y cuándo.                                                   |
| Operación    | `Cita`, `Turno`, `ContadorTurno`                                                    | Reservas, cola y numeración diaria.                                               |

Ideas clave (explicadas en los comentarios del schema):

- **Cita y Turno son distintos.** Cita = reserva futura; Turno = lugar en la cola de hoy. El check-in (Paso 4) convierte una cita en turno.
- **Horarios en minutos desde medianoche** (08:00 = 480) y zona horaria por sede: sin problemas con "08:00" según dónde esté el servidor.
- **La cita guarda una copia** de nombre, teléfono y estudiante con que se reservó: como el CI no es secreto, alguien podría reservar con el CI de otra persona, y esa ficha no debe pisar la de la persona real.
- **Índice único parcial** en `citas`: una sola cita que ocupe la hora por servicio. Una cita cancelada o rechazada la libera.
- **`ContadorTurno`** da el número A-001, A-002... dentro de una transacción. **Orden del enum `PrioridadTurno`** = orden de atención.

## Límites conocidos (léelos antes de vender)

- **La capa de base de datos no se pudo ejecutar donde se desarrolló** (no se pueden descargar los motores de Prisma). Los tests usan una BD falsa en memoria para las reglas de negocio; **las consultas reales de Prisma y el índice único parcial solo se prueban contra PostgreSQL**. Si `pnpm db:generate`, `pnpm typecheck` o la migración dan algún error, pásamelo.
- **Una cita por franja y servicio.** Si un servicio tiene dos ventanillas atendiendo a la vez, igual solo se reserva una cita por hora. Nivel 2: capacidad por franja.
- **Límites por IP**: muchos celulares comparten la IP del operador móvil; los límites son generosos, pero si un colegio grande los toca, súbelos en `public.routes.ts`.
- **Citas falsas con datos inventados**: el límite por CI/teléfono y la aprobación (donde se active) ayudan. Nivel 2: verificar el teléfono con un código por WhatsApp/SMS y captcha (Cloudflare Turnstile).
- **Quien pierde el enlace** no puede cancelar (sí puede consultar con código + CI). Nivel 2: recuperar el enlace por WhatsApp.
- **Vencimiento de pendientes**: se aplica al consultar (sin cron). Basta para un colegio; Nivel 2: un job programado.
- JWT sin revocación (heredado del Nivel 1): un usuario desactivado conserva acceso hasta que su token expire.

## Paso 2 (hecho): cómo estudiarlo

Tres módulos nuevos, todos con la misma forma que ya viste (dto → mapper → service → controller → routes). **Orden de lectura sugerido:**

1. `src/common/sede.ts` — de dónde sale el `sedeId`: del usuario autenticado, **nunca** del body. Es la regla de seguridad de todo el paso.
2. `src/modules/servicios/servicios.dto.ts` — qué se acepta. Fíjate en por qué los campos van **sin defaults** y solo `create` los agrega (si el PATCH los heredara, reiniciaría campos sin avisar).
3. `src/modules/servicios/horarios.validacion.ts` — reglas puras (inicio < fin, ventana ≥ duración, sin solapes). Sus tests están al inicio de `tests/servicios.test.ts`.
4. `src/modules/servicios/servicios.service.ts` — la lógica: duplicados con mensaje claro, no eliminar si hay historial, `advertencias`, y `reemplazarHorarios` dentro de una **transacción**.
5. `src/modules/dias-no-laborables/` — el mismo patrón, más pequeño.
6. `tests/servicios.test.ts` — tres niveles de prueba: funciones puras, HTTP sin BD, y service con una BD falsa.

**Preguntas con respuesta en el código** (las respuestas están en los comentarios):

- ¿Por qué `prefijo` es único por sede? Para que el turno `A-001` nunca sea ambiguo.
- ¿Qué pasa si borras un servicio con citas? No se puede (409): es historial. Se **desactiva**.
- ¿Y si el ADMIN cambia `duracionMin` con citas reservadas? Esas citas conservan su hora (cada cita guarda su `inicio`/`fin`); solo las nuevas usan la duración nueva. La API lo avisa en `advertencias`.
- ¿Por qué `PUT` y no `POST` para los horarios? Porque reemplaza el recurso completo: el ADMIN edita la semana entera y se guarda de golpe, en una transacción.
- ¿Por qué un servicio de otra sede responde 404 y no 403? Para no revelar que existe.

**Límites conocidos de este paso:** un ADMIN sin sede asignada trabaja sobre la primera sede activa (Nivel 1 = un colegio); no hay gestión de sedes ni ventanillas todavía; las consultas de Prisma de este paso se probaron con una BD falsa, así que **verifícalas contra tu PostgreSQL real** (`pnpm dev` y prueba desde el panel).

## Scripts

| Comando                            | Qué hace                              |
| ---------------------------------- | ------------------------------------- |
| `pnpm dev`                         | Servidor con recarga automática       |
| `pnpm build` / `pnpm start`        | Compila a `dist/` y ejecuta           |
| `pnpm typecheck` · `lint` · `test` | Lo mismo que corre el CI              |
| `pnpm db:migrate`                  | Crea/aplica migraciones en desarrollo |
| `pnpm db:deploy`                   | Aplica migraciones en producción      |
| `pnpm db:seed`                     | Datos iniciales (idempotente)         |
| `pnpm db:studio`                   | Explorador visual de la BD            |

## Más información

El roadmap de **Nivel 2 y 3** (refresh token, permisos granulares, auditoría, OpenAPI, despliegue, multi-tenant, notificaciones por WhatsApp, tiempo real...) y el checklist de entrega están en el README de `starter-api`. Para este sistema, las prioridades de Nivel 2 son: tests de integración con BD real, verificación del teléfono por WhatsApp, OpenAPI y notificaciones.
