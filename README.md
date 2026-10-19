# Extreme Dance Academy · App

App de alumnos y gestión interna de Extreme Dance Academy: clases, reservas, cuotas,
pagos con Mercado Pago, pases QR y asistencia.

## Estado: Entrega 1 · Fundamentos

| Qué | Estado |
|---|---|
| Estructura del proyecto (Next.js + TypeScript + Tailwind) | Lista |
| Diseño base: tipografías, colores de marca, logo, íconos de la app | Lista (ícono provisorio) |
| App instalable en el celular (PWA) | Lista |
| Reglas de negocio: vencimientos, gracia, semáforo, cancelación 12 h, créditos | Lista, 26 pruebas pasando |
| Base de datos: academias, sedes, salas, reglas configurables, auditoría | Lista, 6 pruebas pasando |
| Verificación automática en GitHub | Configurada, corre al subir el código |
| Inicio de sesión, roles y permisos | Entrega 2 y 3 |

## Cómo está organizado

```
src/
  app/              Pantallas (Next.js). Cada rol tendrá su carpeta.
  components/       Piezas de interfaz reutilizables (ej. el semáforo).
  domain/           Reglas del negocio, sin pantallas ni base de datos.
    billing/        Vencimientos, gracia y semáforo de la cuota.
    bookings/       Cancelaciones y créditos.
    shared/         Fechas de calendario y dinero en centavos.
  config/           Identidad de la academia (lo único que dice "Extreme Dance").
supabase/
  migrations/       Cambios de la base, numerados y en orden.
  tests/            Pruebas de la base.
  seed.sql          Datos de ejemplo para desarrollo.
.github/workflows/  Verificación automática.
```

Las reglas importantes se programan dos veces a propósito: en `src/domain` (para mostrar
estados en pantalla) y en la base de datos (para hacerlas cumplir). Las pruebas de ambos
lados cubren los mismos casos.

## Primer arranque en una computadora

Requisitos: [Node.js 22](https://nodejs.org) o más nuevo.

```bash
npm install          # instala dependencias y genera package-lock.json
npm test             # reglas de negocio
npm run dev          # abre la app en http://localhost:3000
```

Vista de componentes con datos de ejemplo (sólo en desarrollo):
http://localhost:3000/dev/componentes

### Base de datos local (opcional)

Con [Docker](https://www.docker.com/products/docker-desktop/) instalado:

```bash
npx supabase start   # levanta una base Supabase local con las migraciones y el seed
```

Para correr sólo las pruebas de la base contra una base PostgreSQL de prueba:

```bash
DATABASE_URL=postgres://... npm run test:db
```

## Credenciales

Copiá `.env.example` como `.env.local` y completá los valores. `.env.local` no se sube
nunca al repositorio. Las claves privadas (Supabase service role, Mercado Pago) van sólo
en el servidor y en la configuración de Vercel; nunca en el código ni en el chat.
