# Bacona — Guía de Workflows Dev / Prod

## ¿Qué cambié? → ¿Qué pasos sigo?

| Qué cambié | Dev (local) | Prod (Railway) |
|---|---|---|
| Solo código (`.ts`, `.tsx`, config) | commit → `/dev-apply` | `/deploy` |
| Datos del seed (`seed.ts`, sin schema) | commit → `/dev-apply` (re-seedea local) | `/deploy` + SQL UPDATE puntual (**NO re-seed**) |
| Schema (`schema.prisma`) | commit → `npm run prisma:migrate` → `/dev-apply` | `/deploy` (Railway aplica migración automáticamente) |
| Schema + código | commit → `prisma:migrate` → `/dev-apply` | `/deploy` (migración auto) |
| Schema + datos | commit → `prisma:migrate` → `/dev-apply` | `/deploy` + verificar/actualizar datos prod a mano |

---

## Reglas críticas

### En producción (Railway)
- **NUNCA** ejecutar `npm run db:seed` en Railway — borra todo el historial de ventas, sesiones y pagos.
- Cambios de datos puntuales (planCode, precios, nombres) → SQL UPDATE directo o Prisma Studio con `DATABASE_PUBLIC_URL`.
- Cambios de schema → Railway los aplica solos via `npx prisma migrate deploy` al iniciar. No hay que hacer nada extra.

### En desarrollo (local)
- Docker debe estar corriendo antes de cualquier operación de DB.
- `npm run db:seed` es seguro: borra y recrea datos de prueba, no hay historial real que perder.
- Si cambió `schema.prisma`, siempre migrar **antes** de seedear.

---

## Comandos disponibles

| Comando | Cuándo usarlo |
|---|---|
| `/dev-apply` | Cada vez que querés ver los cambios en local con datos frescos |
| `/deploy` | Cuando local funciona y querés subir a Railway |

---

## Actualizar datos en prod sin re-seedear

Cuando `seed.ts` cambia, el agente `/deploy` te muestra los SQL UPDATE necesarios.
Para ejecutarlos usás Prisma Studio apuntado a la DB de Railway:

```powershell
# 1. Copiar DATABASE_PUBLIC_URL desde Railway dashboard → PostgreSQL → Variables
$env:DATABASE_URL = "postgresql://postgres:PASSWORD@HOST:PORT/railway"
npm run prisma:studio
# 2. Abrís el browser, buscás el registro, editás y guardás
```

---

## Árbol de decisión rápido

```
¿Qué cambiaste?
│
├── Solo archivos .ts/.tsx/.css/config
│   └── Dev: commit → /dev-apply (sin seed)
│       Prod: /deploy
│
├── prisma/seed.ts (datos, sin tocar schema)
│   └── Dev: commit → /dev-apply (con seed automático)
│       Prod: /deploy → SQL UPDATE puntuales
│
├── prisma/schema.prisma
│   └── Dev: npm run prisma:migrate → /dev-apply
│       Prod: /deploy (migración automática en Railway)
│
└── schema + seed juntos
    └── Dev: prisma:migrate → /dev-apply
        Prod: /deploy + revisar datos manualmente
```
