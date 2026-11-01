# PosturaIA

Monitoreo de postura en tiempo real por visión computacional, con diagnóstico y
recomendaciones generadas por IA. B2B **multi-tenant** (una organización por
cliente): vista de colaborador (monitoreo + informes en PDF), panel agregado
para RR. HH. y panel de administración de la organización (departamentos,
invitaciones, miembros).

## Tabla de contenido

- [Funcionalidad](#funcionalidad)
- [Stack](#stack)
- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos (Supabase)](#base-de-datos-supabase)
- [Proveedor de IA (Ollama / otros)](#proveedor-de-ia-ollama--otros)
- [Proveedor de correo (invitaciones)](#proveedor-de-correo-invitaciones)
- [Resumen semanal por correo](#resumen-semanal-por-correo)
- [Scripts](#scripts)

## Funcionalidad

- **Multi-tenant**: cada organización (`organizations`) tiene sus propios
  miembros, departamentos y datos, aislados por Row Level Security — ver
  [Base de datos](#base-de-datos-supabase).
- **Monitoreo en vivo**: detección de postura por cámara web (MediaPipe Pose
  Landmarker, en el navegador) con medición de ángulo cervical y torácico.
- **Alertas**: aviso sonoro y en pantalla ante mala postura sostenida (≥ 8 s).
- **Diagnóstico por IA**: al finalizar una sesión, dos agentes en cadena
  (analista biomecánico → coach de ergonomía) generan diagnóstico y
  recomendaciones a partir de las métricas medidas.
- **Informes PDF**: descarga del informe de cada sesión (jsPDF), y envío
  automático del mismo informe por correo al colaborador al cerrar la sesión.
- **Resumen semanal por correo**: cada owner/RR. HH. recibe, una vez por
  semana, un resumen de bienestar postural de su organización (sesiones,
  puntaje promedio, alertas, colaboradores en riesgo alto) — ver
  [Resumen semanal](#resumen-semanal-por-correo).
- **Historial personal**: lista de sesiones propias con score y nivel de riesgo.
- **Panel de RR. HH.**: indicadores agregados por empleado y por departamento
  (sesiones, alertas, score promedio, tendencia, tabla por empleado).
- **Panel de organización** (`/org-settings`, solo owner/RR. HH.): catálogo de
  departamentos, invitación de colaboradores por correo (se unen
  automáticamente a la organización al registrarse con ese correo) y gestión
  de rol/departamento/baja de miembros.
- **Autenticación**: email/contraseña con Supabase Auth. Login con Google queda
  preparado en el código pero no funcional fuera del editor de Lovable (ver
  [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
- **i18n**: interfaz en español e inglés.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | TanStack Start (SSR) + Vite + React 19 |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| Backend / BD | Supabase (Postgres, Auth, RLS) |
| IA | Ollama (local, por defecto) u otro proveedor intercambiable |
| Visión computacional | `@mediapipe/tasks-vision` (cliente, WASM) |
| PDF | jsPDF |
| Gestor de paquetes | Bun (también funciona con npm) |
| Runtime de build | Nitro |

## Requisitos previos

- [Bun](https://bun.sh) ≥ 1.2 (o Node.js ≥ 20 + npm)
- Una cámara web (para el monitoreo)
- [Ollama](https://ollama.com) instalado localmente, **o** Docker, para el
  proveedor de IA por defecto
- Una cuenta de Supabase con el proyecto ya provisto (ver `.env`) o uno propio

## Instalación

```bash
git clone <url-del-repositorio>
cd MVP

bun install        # o: npm install

cp .env.example .env   # completa las variables (ver sección siguiente)

ollama pull qwen3:8b   # modelo de IA local por defecto

bun run dev         # o: npm run dev
```

La app queda disponible en `http://localhost:3000`.

> La cámara solo funciona en un contexto seguro del navegador: `localhost` o
> HTTPS. No funcionará si accedes por una IP sin HTTPS.

## Variables de entorno

Definidas en `.env` (ver `.env.example`):

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | — |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave pública (anon) de Supabase | — |
| `VITE_SUPABASE_PROJECT_ID` | ID del proyecto Supabase | — |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PROJECT_ID` | Mismas credenciales, para el cliente de servidor (SSR) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (bypasa RLS). Solo la usa el job del resumen semanal | — |
| `AI_PROVIDER` | Proveedor de IA activo: `ollama` o `lovable` | `ollama` |
| `OLLAMA_BASE_URL` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo a usar en Ollama | `qwen3:8b` |
| `LOVABLE_API_KEY` | Solo si `AI_PROVIDER=lovable` | — |
| `EMAIL_PROVIDER` | Proveedor de correo para invitaciones/informes/resumen: `console` o `resend` | `console` |
| `RESEND_API_KEY` / `EMAIL_FROM` | Solo si `EMAIL_PROVIDER=resend` | — |
| `LOVABLE_CRON_SECRET` | Secreto que autentica al scheduler del resumen semanal | — |
| `LOVABLE_CRON_SECRET_PREVIOUS` | Secreto anterior, para rotarlo sin downtime (opcional) | — |

## Base de datos (Supabase)

Modelo multi-tenant (`supabase/migrations/`): `organizations`, `departments`,
`organization_members` (usuario × org, con rol y departamento),
`organization_invites` (invitaciones pendientes), `profiles`,
`posture_sessions` y `posture_alerts` (ambas con `org_id`) — todas con RLS
habilitado. Roles (`org_role`): `owner`, `hr`, `employee`.

Para aplicar las migraciones a un proyecto Supabase propio:

```bash
npm install -g supabase
supabase link --project-ref <tu-project-ref>
supabase db push
```

Para un backend 100 % local (sin depender de un proyecto Supabase remoto):

```bash
supabase start      # levanta Postgres/Auth/PostgREST en Docker
supabase db push     # aplica las migraciones
# reemplaza SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY en tu .env
# por los que imprime `supabase start`
```

## Proveedor de IA (Ollama / otros)

Por defecto usa **Ollama local** (`AI_PROVIDER=ollama`), sin costo ni llaves
externas. El diagnóstico se genera con dos llamadas de chat (analista y coach)
contra `${OLLAMA_BASE_URL}/v1/chat/completions`.

Para cambiar de motor de IA no hace falta tocar la lógica de negocio: el
proveedor implementa la interfaz `AIProvider` (`src/domain/ai/ai-provider.ts`)
y se selecciona en `src/infrastructure/ai/ai-provider.factory.ts` según
`AI_PROVIDER`. Ya incluye un segundo adapter (`lovable`) como referencia. Para
agregar uno nuevo (OpenAI, Anthropic, etc.): crear la clase en
`src/infrastructure/ai/providers/`, registrar el `case` en el factory y
definir `AI_PROVIDER` en `.env`.

## Proveedor de correo (invitaciones)

Por defecto usa **`console`** (`EMAIL_PROVIDER=console`): no envía nada por
red, solo imprime el correo (con el enlace de invitación) en los logs del
servidor. Así el flujo de invitar colaboradores funciona completo en
desarrollo/Docker sin contratar nada — y el panel de organización siempre
ofrece un botón "Copiar enlace" como respaldo, sin importar el proveedor.

Para enviar correos reales: `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` +
`EMAIL_FROM` (ver [Resend](https://resend.com)). Mismo patrón de puerto +
adapters que la IA: la interfaz es `EmailProvider`
(`src/domain/notifications/email-provider.ts`), los adapters viven en
`src/infrastructure/notifications/providers/` y se eligen en
`email-provider.factory.ts` según `EMAIL_PROVIDER`.

## Resumen semanal por correo

Una vez por semana, cada **owner/RR. HH.** de cada organización activa recibe
un correo con el resumen de bienestar postural del equipo: sesiones,
colaboradores activos, puntaje promedio, alertas totales y los colaboradores
en riesgo alto (máx. 5). Usa el mismo `EMAIL_PROVIDER` que las invitaciones
y los informes de sesión.

A diferencia de esos dos (que responden a una acción de un usuario logueado),
este es un **job de cron**: no hay sesión de usuario detrás, así que:

- Corre con el cliente de Supabase de **service role**
  (`SUPABASE_SERVICE_ROLE_KEY`, en `src/infrastructure/supabase/client.server.ts`)
  — bypasa RLS a propósito, porque necesita leer todas las organizaciones.
- El endpoint (`sendWeeklyDigestFn`,
  `src/infrastructure/server-functions/send-weekly-digest.server.ts`) está
  protegido por `requireCronAuth`: exige un header
  `Authorization: Bearer <LOVABLE_CRON_SECRET>`, no un JWT de usuario.

**Cómo programarlo:**

- **Lovable Cloud**: panel *Scheduled Functions* → crear un cron semanal
  (p. ej. lunes 8:00 a. m.) apuntando a `sendWeeklyDigestFn`. Lovable
  gestiona `LOVABLE_CRON_SECRET` por su cuenta.
- **Self-hosted**: define `LOVABLE_CRON_SECRET` en tu `.env` y programa
  cualquier scheduler externo (cron del sistema, GitHub Actions, un
  `cron` de tu proveedor cloud) para que haga `POST` al endpoint de esta
  función con ese mismo valor en el header `Authorization`.

Es "mejor esfuerzo" por organización y por destinatario: si una
organización no tiene admins con correo, o un envío puntual falla, se
registra en los logs y se sigue con el resto — no se detiene por un caso
aislado.

## Scripts

| Comando | Descripción |
|---|---|
| `bun run dev` | Servidor de desarrollo (`localhost:3000`) |
| `bun run build` | Build de producción |
| `bun run preview` | Sirve el build de producción |
| `bun run lint` | ESLint |
| `bun run format` | Prettier |
