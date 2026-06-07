Sos el agente de workflow de desarrollo local para el proyecto Bacona (Next.js + Prisma + PostgreSQL en Docker).

Ejecutá el siguiente flujo en orden, mostrando claramente el número y nombre de cada paso antes de ejecutarlo. Si un paso falla, detenete y explicá qué falló antes de continuar.

---

## PASO 1 — Analizar qué cambió

Ejecutá `git status` y `git diff --name-only HEAD` (o contra el último commit si no hay staged changes).

Clasificá los cambios en estas categorías:
- **Schema**: ¿cambió `prisma/schema.prisma`?
- **Seed**: ¿cambió `prisma/seed.ts`?
- **Código**: ¿cambiaron archivos `.ts`, `.tsx`, `.css`, config?
- **Sin commitear**: ¿hay cambios unstaged o untracked relevantes?

Mostrá un resumen claro: "Detecté: [código] [seed] [schema]" antes de continuar.

---

## PASO 2 — Commitear cambios pendientes

Si hay cambios sin commitear (staged o unstaged en archivos relevantes del proyecto):
- Preguntale al usuario un mensaje de commit, o proponé uno descriptivo basado en los cambios detectados.
- Hacé `git add` de los archivos relevantes y commiteá.
- Si no hay nada que commitear, indicalo y pasá al siguiente paso.

---

## PASO 3 — Migración de schema (solo si cambió schema.prisma)

Si en el Paso 1 detectaste cambios en `prisma/schema.prisma`:
- Ejecutá `npm run prisma:migrate` (que internamente corre `npx prisma migrate dev`).
- Si el comando pide un nombre para la migración, derivalo del cambio (ej: "add_plan_code_to_cc").
- **Si este paso falla, detenete.** No sigas con seed ni dev server.

Si no hubo cambios de schema, indicá "Sin cambios de schema — salteando migración" y pasá al Paso 4.

---

## PASO 4 — Verificar Docker

Ejecutá `docker ps` y buscá un contenedor corriendo con imagen `postgres`.

- Si está corriendo: indicalo y continuá.
- Si no está corriendo: ejecutá `docker compose up -d` y esperá 3 segundos para que levante. Verificá nuevamente.
- Si Docker Desktop no está instalado o da error: avisá al usuario y detenete.

---

## PASO 5 — Liberar puerto 3000 (si hay dev server corriendo)

En PowerShell, verificá si el puerto 3000 está en uso:
```powershell
netstat -ano | findstr :3000
```

Si está ocupado, matá el proceso:
```powershell
$pid = (netstat -ano | findstr :3000 | Select-String -Pattern '\s(\d+)$').Matches[0].Value.Trim()
Stop-Process -Id $pid -Force
```

Si el puerto está libre, indicalo y continuá.

---

## PASO 6 — Seedear la base de datos (solo si cambió seed.ts o fue solicitado)

Si en el Paso 1 detectaste cambios en `prisma/seed.ts`, O si el usuario pidió explícitamente re-seedear:
- Avisá: "Esto borra y recrea todos los datos de desarrollo."
- Ejecutá `npm run db:seed`.
- **Si falla, detenete.**

Si no hubo cambios en seed.ts y no fue solicitado, indicá "Sin cambios de seed — salteando" y continuá.

---

## PASO 7 — Levantar el servidor de desarrollo

Ejecutá `npm run dev` en background.

Indicá al usuario: "Servidor iniciando en http://localhost:3000 — abrí el browser cuando veas 'Ready' en la terminal."

---

## RESUMEN FINAL

Al terminar, mostrá una tabla con los pasos ejecutados y su resultado:

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | Análisis | Detectado: [lista] |
| 2 | Commit | [commiteado / nada que commitear] |
| 3 | Migración | [ejecutada / salteada] |
| 4 | Docker | [ya corría / levantado] |
| 5 | Puerto 3000 | [liberado / ya libre] |
| 6 | Seed | [ejecutado / salteado] |
| 7 | Dev server | Corriendo en localhost:3000 |
