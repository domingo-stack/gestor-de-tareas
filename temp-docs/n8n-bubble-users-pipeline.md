# Pipeline n8n: Bubble Users → Supabase `growth_users`

## Estrategia: Carga historica + Sync incremental

Con 340k+ usuarios, **NO** traemos todo cada vez. La estrategia es:

| Fase | Que | Como | Frecuencia |
|---|---|---|---|
| **A** | Carga historica (340k) | CSV export desde Bubble → Supabase | 1 sola vez |
| **B** | Sync incremental | API Bubble filtrado por `Modified Date` → n8n → Supabase | Cada 4h |

---

## FASE A: Carga Historica (CSV)

### Paso 1: Exportar CSV desde Bubble

1. Ve a **Data** → **App Data** → **User**
2. Click en **Export** (o Export as CSV)
3. Selecciona SOLO estos campos:

| Campo en Bubble | Necesario? |
|---|---|
| `unique id` (o `_id`) | **SI** — es el identificador unico |
| `email` | SI |
| `Created Date` | SI |
| `Pais` (o `País`) | SI |
| `Origen` | SI |
| `Evento de Valor` | SI |
| `Ultima Conexion` | SI |
| `Subscription_start` | SI |
| `Subscription_end` | SI |
| `Plan gratuito` | SI |
| `Plan pagado` | SI |
| `Cancelado` | SI |
| `Suscripcion` | **SI** — trae el nombre del plan ("12 Meses", "Gratuito", etc.) |
| `Numero Invitados` | SI |
| Todo lo demas | NO — no lo necesitamos |

> **NOTA:** El campo `PlanID` esta vacio en la mayoria de registros. El nombre del plan real viene en `Suscripcion`.

4. Descarga el CSV

### Paso 2: Preparar el CSV

Abre el CSV en Excel/Sheets y renombra las columnas para que coincidan con Supabase:

| Columna original (Bubble) | Renombrar a | Tipo | Notas |
|---|---|---|---|
| `unique id` o `_id` | `bubble_user_id` | texto | **Obligatorio** — clave unica |
| `email` | `email` | texto | |
| `Pais` o `País` | `country` | texto | |
| `Origen` | `origin` | texto | Canal: Facebook, Google, etc. |
| `Created Date` | `created_date` | fecha/texto | Formato ISO: `2025-06-15T14:30:00Z`. Si viene como `Jun 15, 2025 2:30pm`, convertir (ver abajo) |
| `Ultima Conexion` | `last_login` | fecha/texto | Mismo formato que arriba |
| `Subscription_start` | `subscription_start` | fecha/texto | |
| `Subscription_end` | `subscription_end` | fecha/texto | |
| `Plan gratuito` | `plan_free` | booleano | Bubble exporta `"si"`/`"no"`. Convertir a `true`/`false` (ver transformaciones) |
| `Plan pagado` | `plan_paid` | booleano | Bubble exporta `"si"`/`"no"`. Convertir a `true`/`false` |
| `Cancelado` | `cancelled` | booleano | Bubble exporta `"si"`/`"no"` o `"yes"`/`"no"`. Convertir a `true`/`false` |
| `Suscripcion` | `plan_id` | texto | **Este campo trae el plan real**: "12 Meses", "Gratuito", "1 Mes", etc. |
| `Evento de Valor` | `eventos_valor` | numero | Entero. Si esta vacio, poner `0` |
| `Numero Invitados` | `referral_count` | numero | Entero. Si esta vacio, poner `0` |

**NO incluir** estas columnas (se generan automaticamente):
- `id` — Supabase lo genera (UUID)
- `imported_at` — tiene default `now()`
- `updated_at` — tiene default `now()`

### Transformaciones necesarias en el CSV

#### Fechas
Si Bubble exporta fechas como `Jun 15, 2025 2:30 pm`:
- En Google Sheets: Selecciona la columna → Format → Number → Date time
- O usa formula: `=TEXT(A2, "yyyy-mm-ddThh:mm:ss") & "Z"`
- El formato final debe ser: `2025-06-15T14:30:00Z`
- **Si ya viene en ISO 8601** (`2025-06-15T14:30:00.000Z`), no necesitas cambiar nada

#### Booleanos (IMPORTANTE)
Bubble exporta `"si"`/`"no"` (en espanol) para los campos `Plan gratuito`, `Plan pagado` y `Cancelado`.
Supabase necesita `true`/`false`. Hacer buscar y reemplazar en CADA columna booleana:
- `si` → `true`
- `no` → `false`
- En Sheets: `=IF(LOWER(A2)="si", "true", IF(LOWER(A2)="yes", "true", "false"))`
- Tambien puede venir `"yes"`/`"no"` dependiendo del idioma de Bubble

#### Numeros vacios
Si `Evento de Valor` o `Numero Invitados` estan vacios:
- Reemplazar celdas vacias con `0`
- En Sheets: seleccionar columna → Find & Replace → Find: (vacio) → Replace: `0`

### Paso 3: Importar CSV a Supabase

**Opcion A: Desde el dashboard (recomendada para < 500k filas)**

1. Ve a **Supabase** → **Table Editor** → tabla `growth_users`
2. Click en **Insert** → **Import data from CSV**
3. Selecciona tu CSV preparado
4. Verifica que el mapeo de columnas sea correcto
5. Click **Import**

**Opcion B: Si el CSV es muy grande (> 100MB)**

Divide el CSV en chunks de 50k filas y sube cada uno por separado. O usa esta alternativa con `psql`:

```bash
# Conectar a Supabase via psql (la conexion string esta en Settings → Database)
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# Importar CSV
\copy growth_users(bubble_user_id, email, country, origin, created_date, last_login, subscription_start, subscription_end, plan_free, plan_paid, cancelled, plan_id, eventos_valor, referral_count) FROM '/ruta/al/archivo.csv' WITH CSV HEADER;
```

### Paso 4: Verificar la carga

Ejecuta estas queries en Supabase SQL Editor:

```sql
-- Total de usuarios cargados
SELECT COUNT(*) as total FROM growth_users;

-- Debe dar ~340,000

-- Verificar que no haya duplicados
SELECT bubble_user_id, COUNT(*)
FROM growth_users
GROUP BY bubble_user_id
HAVING COUNT(*) > 1;
-- Debe dar 0 filas

-- Muestra de datos
SELECT bubble_user_id, email, country, origin, plan_paid, eventos_valor
FROM growth_users
LIMIT 10;

-- Distribucion por pais (top 10)
SELECT country, COUNT(*) as total
FROM growth_users
WHERE country IS NOT NULL
GROUP BY country
ORDER BY total DESC
LIMIT 10;

-- Pagados vs gratuitos
SELECT
  CASE WHEN plan_paid THEN 'Pagado' ELSE 'Gratuito' END as tipo,
  COUNT(*) as total
FROM growth_users
GROUP BY plan_paid;
```

---

## FASE B: Sync Incremental (pipeline n8n)

Este pipeline solo trae usuarios **modificados desde la ultima sincronizacion**.

### Arquitectura del flujo

```
[Schedule Trigger]  →  [Leer ultima sync]  →  [Loop: API Bubble con filtro Modified Date]
      (4h)               (sync_logs)              (solo cambios recientes)
                                                         |
                                                         v
                                              [Transformar datos]  →  [Supabase Upsert]  →  [Log sync]
                                                  (mapeo campos)       (growth_users)       (sync_logs)
```

### Paso 1: Schedule Trigger

- **Nodo:** Schedule Trigger
- **Intervalo:** Every 4 hours
- **Cron:** `0 */4 * * *`

### Paso 2: Leer fecha de ultima sync

**Nodo:** Supabase (o HTTP Request)

```sql
SELECT created_at FROM sync_logs
WHERE source = 'bubble_users' AND status = 'success'
ORDER BY created_at DESC
LIMIT 1;
```

Si no hay registros previos (primera ejecucion del incremental), usa la fecha de la carga historica como fallback, por ejemplo: `2026-03-01T00:00:00Z`.

Guarda el resultado en una variable: `lastSyncDate`

### Paso 3: API de Bubble con filtro Modified Date

**Nodo:** HTTP Request (dentro de un Loop)

**URL:**
```
https://TU-APP.bubbleapps.io/api/1.1/obj/user
```

**Method:** GET

**Query Parameters:**

| Parametro | Valor |
|---|---|
| `constraints` | `[{"key":"Modified Date","constraint_type":"greater than","value":"{{lastSyncDate}}"}]` |
| `limit` | `100` |
| `cursor` | `0` (primera pagina), luego incrementar |

**Headers:**
| Header | Valor |
|---|---|
| `Authorization` | `Bearer TU_BUBBLE_API_TOKEN` |

**IMPORTANTE:** El parametro `constraints` debe ir URL-encoded. En n8n, puedes usar una expresion:

```
{{ encodeURIComponent('[{"key":"Modified Date","constraint_type":"greater than","value":"' + $json.lastSyncDate + '"}]') }}
```

### Respuesta esperada de Bubble

```json
{
  "response": {
    "cursor": 100,
    "results": [
      {
        "_id": "1694638573805x...",
        "Created Date": "2025-06-15T14:30:00.000Z",
        "Modified Date": "2026-03-01T08:15:00.000Z",
        "email": "usuario@ejemplo.com",
        "Evento de Valor": 3,
        "Ultima Conexion": "2026-02-28T10:00:00.000Z",
        ...
      }
    ],
    "remaining": 50,
    "count": 150
  }
}
```

### Logica de paginacion

1. Primera llamada: `cursor=0`
2. Leer `response.remaining`
3. Si `remaining > 0`: cursor = cursor + 100, repetir
4. Si `remaining = 0`: salir del loop

Con cambios frecuentes (diarios), espera entre **500 y 5,000 usuarios** por sync (no 340k).

### Paso 4: Transformar datos

**Nodo: Code (JavaScript)**

```javascript
// Helper: convierte "si"/"yes"/true a booleano
function toBool(val) {
  if (val === true) return true;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    return lower === 'si' || lower === 'sí' || lower === 'yes' || lower === 'true';
  }
  return false;
}

const results = [];

for (const item of $input.all()) {
  const u = item.json;

  const mapped = {
    // === CLAVE UNICA (para upsert) ===
    bubble_user_id: u._id,

    // === CAMPOS DE TEXTO ===
    email: u.email || null,
    country: u["Pais"] || u["País"] || null,
    origin: u["Origen"] || null,

    // === FECHAS ===
    // Bubble envia ISO 8601 → Supabase lo acepta directo
    // NO necesitan transformacion
    created_date: u["Created Date"] || null,
    last_login: u["Ultima Conexion"] || u["Última Conexión"] || null,
    subscription_start: u["Subscription_start"] || null,
    subscription_end: u["Subscription_end"] || null,

    // === PLAN (nombre real del plan) ===
    // El campo "Suscripcion" trae el plan: "12 Meses", "Gratuito", "1 Mes", etc.
    // El campo "PlanID" suele estar vacio — NO usarlo
    plan_id: u["Suscripcion"] || u["Suscripción"] || null,

    // === BOOLEANOS ===
    // Bubble envia "si"/"no" (texto en espanol) via API
    // Convertimos a booleano real
    plan_free: toBool(u["Plan gratuito"] || u["plan gratuito"]),
    plan_paid: toBool(u["Plan pagado"] || u["plan pagado"]),
    cancelled: toBool(u["Cancelado"]),

    // === NUMEROS ===
    // parseInt con fallback a 0
    eventos_valor: parseInt(u["Evento de Valor"]) || 0,
    referral_count: parseInt(u["Numero Invitados"]) || 0,

    // === TIMESTAMPS DE SYNC ===
    updated_at: new Date().toISOString()
  };

  results.push({ json: mapped });
}

return results;
```

### Tabla de mapeo rapido

| Campo Bubble | Columna Supabase | Transformacion |
|---|---|---|
| `_id` | `bubble_user_id` | Ninguna |
| `email` | `email` | `\|\| null` |
| `Pais` / `País` | `country` | Intentar ambos nombres |
| `Origen` | `origin` | `\|\| null` |
| `Created Date` | `created_date` | Ninguna (ya es ISO) |
| `Ultima Conexion` | `last_login` | Intentar ambos nombres |
| `Subscription_start` | `subscription_start` | Ninguna |
| `Subscription_end` | `subscription_end` | Ninguna |
| `Plan gratuito` | `plan_free` | `toBool()` — convierte "si"/"no" a true/false |
| `Plan pagado` | `plan_paid` | `toBool()` — convierte "si"/"no" a true/false |
| `Cancelado` | `cancelled` | `toBool()` — convierte "si"/"no" a true/false |
| `Suscripcion` | `plan_id` | `\|\| null` — trae "12 Meses", "Gratuito", etc. (NO usar PlanID) |
| `Evento de Valor` | `eventos_valor` | `parseInt() \|\| 0` |
| `Numero Invitados` | `referral_count` | `parseInt() \|\| 0` |
| *(generado)* | `updated_at` | `new Date().toISOString()` |

### Paso 5: Upsert a Supabase

**Nodo: HTTP Request**

**URL:**
```
https://TU-PROJECT.supabase.co/rest/v1/growth_users
```

**Method:** POST

**Headers:**

| Header | Valor |
|---|---|
| `apikey` | `TU_SUPABASE_ANON_KEY` |
| `Authorization` | `Bearer TU_SUPABASE_SERVICE_ROLE_KEY` |
| `Content-Type` | `application/json` |
| `Prefer` | `resolution=merge-duplicates` |

**Body:** Array de objetos del paso anterior.

El header `Prefer: resolution=merge-duplicates` hace que Supabase:
- Si `bubble_user_id` **no existe** → INSERT (usuario nuevo)
- Si `bubble_user_id` **ya existe** → UPDATE (actualiza todos los campos)

**Batching:** Si un sync trae > 500 usuarios, usa "Split In Batches" con batch size = 500.

### Paso 6: Log de sincronizacion

**Nodo: Supabase Insert**

**Tabla:** `sync_logs`

```json
{
  "source": "bubble_users",
  "records_processed": 1523,
  "status": "success",
  "created_at": "2026-03-01T12:00:00Z"
}
```

### Paso 7: Error handling

Agrega un nodo **Error Trigger** que inserte en `sync_logs`:

```json
{
  "source": "bubble_users",
  "records_processed": 0,
  "status": "error",
  "error_message": "{{ $json.error.message }}",
  "created_at": "2026-03-01T12:00:00Z"
}
```

---

## Diagrama visual del flujo n8n

```
1. [Schedule Trigger] ─── Cada 4 horas
         │
2. [Supabase] ─── SELECT ultima sync de sync_logs
         │               WHERE source = 'bubble_users'
         │               → lastSyncDate
         │
3. [Set Variable] ─── cursor = 0, totalProcessed = 0
         │
4. [Loop Start] ←←←←←←←←←←←←←←←←←←←←←←|
         │                                 │
5. [HTTP Request] ─── GET Bubble API       │
         │   ?constraints=[Modified Date   │
         │    > lastSyncDate]              │
         │   &limit=100&cursor={{cursor}}   │
         │                                 │
6. [Code] ─── Transformar campos           │
         │     (mapeo Bubble → Supabase)   │
         │                                 │
7. [HTTP Request] ─── POST Supabase        │
         │   upsert growth_users           │
         │   Prefer: merge-duplicates      │
         │                                 │
8. [IF] ─── remaining > 0?                 │
         │        │                        │
        NO       SI → cursor += 100 ──────→|
         │
9. [Supabase] ─── INSERT sync_logs
         │         source: bubble_users
         │         records_processed: total
         │
10. [End]
```

---

## Checklist

### Carga historica (1 sola vez)
- [ ] Exportar CSV de Bubble con los 14 campos listados
- [ ] Renombrar columnas segun tabla de mapeo
- [ ] Convertir fechas a ISO 8601 si es necesario
- [ ] Convertir booleanos yes/no a true/false
- [ ] Rellenar numeros vacios con 0
- [ ] Importar CSV en Supabase (Table Editor → Import CSV)
- [ ] Ejecutar queries de verificacion
- [ ] Confirmar ~340k registros en `growth_users`

### Pipeline incremental (n8n)
- [ ] Token API de Bubble configurado en n8n
- [ ] URL de Supabase + Service Role Key configurados
- [ ] Verificar nombre exacto del campo `Modified Date` en API de Bubble
- [ ] Verificar nombres exactos de todos los campos (hacer 1 GET de prueba)
- [ ] Crear el flujo con los nodos del diagrama
- [ ] Ejecutar manualmente 1 vez y revisar datos
- [ ] Activar schedule (cada 4 horas)

---

## FAQ

**P: Cuantos usuarios traera cada sync incremental?**
R: Solo los modificados desde la ultima sync. Con cambios frecuentes, estimamos 500-5,000 por sync. Mucho menos que los 340k totales.

**P: Que pasa si la sync falla a mitad de camino?**
R: El upsert es idempotente. Si falla y se re-ejecuta, simplemente procesa los mismos usuarios de nuevo sin duplicar. Los que ya se insertaron se actualizan.

**P: Necesito crear la tabla sync_logs?**
R: Si ya la tienes del pipeline de pagos, no. Solo asegura que tenga las columnas `source`, `records_processed`, `status`, `error_message`, `created_at`.

**P: Que pasa con usuarios eliminados en Bubble?**
R: No se eliminan de `growth_users`. El filtro por `Modified Date` no detecta eliminaciones. Si necesitas purgar, hazlo manualmente.

**P: Puedo ejecutar la sync incremental antes de la carga historica?**
R: Si, pero tendras pocos datos. Lo ideal es: primero CSV, luego activar el pipeline.
