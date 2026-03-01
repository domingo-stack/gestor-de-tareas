# Pipeline n8n: Bubble Users → Supabase `growth_users`

## Resumen

Este pipeline sincroniza la tabla **User** de Bubble hacia la tabla **growth_users** de Supabase cada 4 horas. Usa upsert (insertar o actualizar) basado en `bubble_user_id`.

---

## Arquitectura del flujo

```
[Schedule Trigger]  →  [Loop: Paginacion Bubble]  →  [Transformar datos]  →  [Supabase Upsert]  →  [Log sync]
      (4h)                   (100 por pagina)           (mapeo + fechas)        (growth_users)       (sync_logs)
```

---

## Paso 1: Schedule Trigger

- **Nodo:** Schedule Trigger
- **Configuracion:**
  - Trigger interval: Every 4 hours
  - (O usa Cron: `0 */4 * * *`)

---

## Paso 2: Obtener usuarios de Bubble (con paginacion)

Bubble devuelve maximo 100 registros por request. Necesitas paginar.

### Nodo: HTTP Request (dentro de un Loop)

**URL:**
```
https://TU-APP.bubbleapps.io/api/1.1/obj/user
```

**Method:** GET

**Query Parameters:**
| Parametro | Valor | Descripcion |
|---|---|---|
| `cursor` | `0` (primera vez), luego el cursor del response anterior | Posicion de paginacion |
| `limit` | `100` | Registros por pagina |
| `sort_field` | `Created Date` | Ordenar por fecha de creacion |
| `sort_order` | `desc` | Mas recientes primero |

**Headers:**
| Header | Valor |
|---|---|
| `Authorization` | `Bearer TU_BUBBLE_API_TOKEN` |

**Autenticacion:** Usa credencial tipo "Header Auth" con:
- Name: `Authorization`
- Value: `Bearer TU_BUBBLE_API_TOKEN`

### Response de Bubble (estructura)

```json
{
  "response": {
    "cursor": 100,
    "results": [
      {
        "_id": "1234567890x...",
        "Created Date": "2025-06-15T14:30:00.000Z",
        "email": "usuario@ejemplo.com",
        "Evento de Valor": 3,
        "Ultima Conexion": "2026-02-28T10:00:00.000Z",
        "Subscription_start": "2025-07-01T00:00:00.000Z",
        "Subscription_end": "2026-07-01T00:00:00.000Z",
        "plan gratuito": true,
        "plan pagado": false,
        "Cancelado": false,
        "Origen": "Facebook",
        "Pais": "Chile",
        "PlanID": "Anual",
        "Numero Invitados": 2
      }
    ],
    "remaining": 250,
    "count": 350
  }
}
```

### Logica de paginacion

Usa un **Loop** (nodo "Loop Over Items" o "IF" con loop manual):

1. Primera llamada: `cursor=0`
2. Leer `response.remaining` del resultado
3. Si `remaining > 0`: hacer otra llamada con `cursor = cursor_anterior + 100`
4. Si `remaining = 0`: salir del loop
5. Acumular todos los `results` en un array

**Alternativa simple:** Si tienes menos de 10,000 usuarios, puedes hacer un loop fijo de N iteraciones (ej: 100 iteraciones = 10,000 usuarios max).

---

## Paso 3: Transformar datos (nodo Code / Set)

Este es el paso MAS IMPORTANTE. Aqui mapeas campos de Bubble a columnas de Supabase.

### Nodo: Code (JavaScript)

```javascript
// Recibe items de Bubble y los transforma para Supabase
const results = [];

for (const item of $input.all()) {
  const bubbleUser = item.json;

  // --- MAPEO DE CAMPOS ---
  const mapped = {
    // Identificador unico de Bubble (OBLIGATORIO - es la clave del upsert)
    bubble_user_id: bubbleUser._id,

    // Email
    email: bubbleUser.email || null,

    // Pais - viene directo de Bubble
    country: bubbleUser["Pais"] || bubbleUser["País"] || null,

    // Canal de adquisicion
    origin: bubbleUser["Origen"] || null,

    // Fecha de registro en Bubble
    // Bubble envia ISO 8601: "2025-06-15T14:30:00.000Z" → NO necesita transformacion
    created_date: bubbleUser["Created Date"] || null,

    // Ultima conexion
    last_login: bubbleUser["Ultima Conexion"] || bubbleUser["Última Conexión"] || null,

    // Fechas de suscripcion
    subscription_start: bubbleUser["Subscription_start"] || null,
    subscription_end: bubbleUser["Subscription_end"] || null,

    // Booleanos de plan
    plan_free: bubbleUser["plan gratuito"] === true,
    plan_paid: bubbleUser["plan pagado"] === true,
    cancelled: bubbleUser["Cancelado"] === true,

    // Nombre del plan (texto exacto)
    plan_id: bubbleUser["PlanID"] || null,

    // Contador de eventos de valor (entero)
    eventos_valor: parseInt(bubbleUser["Evento de Valor"]) || 0,

    // Numero de invitados referidos
    referral_count: parseInt(bubbleUser["Numero Invitados"]) || 0,

    // Timestamps de sync
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  results.push({ json: mapped });
}

return results;
```

### Tabla de mapeo campo por campo

| Campo Bubble (exacto) | Columna Supabase | Tipo | Transformacion | Ejemplo |
|---|---|---|---|---|
| `_id` | `bubble_user_id` | text | Ninguna, pasa directo | `"1694638573805x..."` |
| `email` | `email` | text | Ninguna | `"user@email.com"` |
| `Pais` o `País` | `country` | text | Ninguna | `"Chile"` |
| `Origen` | `origin` | text | Ninguna | `"Facebook"` |
| `Created Date` | `created_date` | timestamptz | Ninguna (ya es ISO 8601) | `"2025-06-15T14:30:00.000Z"` |
| `Ultima Conexion` | `last_login` | timestamptz | Ninguna (ya es ISO 8601) | `"2026-02-28T10:00:00.000Z"` |
| `Subscription_start` | `subscription_start` | timestamptz | Ninguna (ya es ISO 8601) | `"2025-07-01T00:00:00.000Z"` |
| `Subscription_end` | `subscription_end` | timestamptz | Ninguna (ya es ISO 8601) | `"2026-07-01T00:00:00.000Z"` |
| `plan gratuito` | `plan_free` | boolean | Comparar `=== true` | `true` / `false` |
| `plan pagado` | `plan_paid` | boolean | Comparar `=== true` | `true` / `false` |
| `Cancelado` | `cancelled` | boolean | Comparar `=== true` | `true` / `false` |
| `PlanID` | `plan_id` | text | Ninguna | `"Anual"`, `"1 Mes"` |
| `Evento de Valor` | `eventos_valor` | integer | `parseInt()` o `\|\| 0` | `3` |
| `Numero Invitados` | `referral_count` | integer | `parseInt()` o `\|\| 0` | `2` |
| *(generado)* | `imported_at` | timestamptz | `new Date().toISOString()` | `"2026-03-01T..."` |
| *(generado)* | `updated_at` | timestamptz | `new Date().toISOString()` | `"2026-03-01T..."` |

### Notas sobre transformaciones

1. **Fechas:** Bubble envia fechas en formato ISO 8601 (`"2025-06-15T14:30:00.000Z"`). Supabase acepta este formato directamente en columnas `timestamptz`. **NO necesitas transformar fechas.**

2. **Booleanos:** Bubble puede enviar `true`, `false`, `null`, o `""`. Usa `=== true` para asegurar un booleano limpio. Si el campo no existe, sera `false`.

3. **Enteros:** `Evento de Valor` y `Numero Invitados` pueden venir como string o number. Usa `parseInt()` con fallback `|| 0`.

4. **Campos con acentos:** Bubble puede tener el campo como `"Pais"` o `"País"`, `"Ultima Conexion"` o `"Última Conexión"`. El codigo maneja ambos. **Verifica en tu API de Bubble como se llaman exactamente** haciendo una llamada de prueba.

5. **Nulls:** Si un campo no existe en Bubble, enviar `null` a Supabase. No envies `undefined` ni `""` para fechas (Supabase rechazara strings vacios en columnas timestamptz).

---

## Paso 4: Upsert a Supabase

### Nodo: Supabase (o HTTP Request)

**Opcion A: Nodo Supabase nativo de n8n**

- **Operation:** Upsert
- **Table:** `growth_users`
- **Conflict column:** `bubble_user_id`
- **Columns to send:** Todas las del mapeo anterior

**Opcion B: HTTP Request (si el nodo nativo da problemas)**

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

**Body:** El array de objetos mapeados del paso anterior.

El header `Prefer: resolution=merge-duplicates` convierte el POST en un UPSERT. Supabase detecta conflicto en `bubble_user_id` (tiene constraint UNIQUE) y actualiza el registro existente.

**IMPORTANTE:** Usa el `SERVICE_ROLE_KEY` (no el anon key) para bypasear RLS. El anon key no tiene permisos de escritura en `growth_users`.

### Batching

Si tienes muchos usuarios (1000+), envia en lotes de 500:
- Usa un nodo "Split In Batches" antes del upsert
- Batch size: 500
- Esto evita timeouts y limites de tamano de body

---

## Paso 5: Log de sincronizacion

### Nodo: Supabase Insert (o HTTP Request)

**Table:** `sync_logs`

```json
{
  "source": "bubble_users",
  "records_processed": {{ $items.length }},
  "status": "success",
  "created_at": "{{ new Date().toISOString() }}"
}
```

Si ya tienes una tabla `sync_logs` con otras columnas, adapta los nombres. La idea es registrar cuantos usuarios se sincronizaron y cuando.

---

## Paso 6: Manejo de errores

Agrega un nodo **Error Trigger** al final del flujo que:
1. Registre el error en `sync_logs` con `status: "error"` y el mensaje de error
2. (Opcional) Envie una notificacion por email/Slack

---

## Verificacion post-implementacion

Despues de ejecutar el pipeline por primera vez, corre estas queries en Supabase SQL Editor para verificar:

```sql
-- Cuantos usuarios se sincronizaron?
SELECT COUNT(*) FROM growth_users;

-- Distribucion por pais
SELECT country, COUNT(*) as total
FROM growth_users
GROUP BY country
ORDER BY total DESC;

-- Distribucion por origen (canal)
SELECT origin, COUNT(*) as total
FROM growth_users
GROUP BY origin
ORDER BY total DESC;

-- Usuarios pagados vs gratuitos
SELECT
  plan_paid,
  COUNT(*) as total
FROM growth_users
GROUP BY plan_paid;

-- Usuarios con eventos de valor
SELECT
  CASE
    WHEN eventos_valor = 0 THEN 'Sin activar'
    WHEN eventos_valor >= 1 THEN 'Activados (1+)'
  END as status,
  COUNT(*) as total
FROM growth_users
GROUP BY CASE
    WHEN eventos_valor = 0 THEN 'Sin activar'
    WHEN eventos_valor >= 1 THEN 'Activados (1+)'
  END;

-- Proximas renovaciones (7 dias)
SELECT email, plan_id, subscription_end
FROM growth_users
WHERE subscription_end BETWEEN now() AND now() + interval '7 days'
  AND cancelled = false
ORDER BY subscription_end;
```

---

## Resumen visual del flujo n8n

```
1. [Schedule Trigger] - Cada 4 horas
        |
2. [Set Variable] - cursor = 0
        |
3. [Loop Start] ←←←←←←←←←←←←←←←←←←←|
        |                               |
4. [HTTP Request] - GET Bubble API      |
   URL: .../api/1.1/obj/user            |
   ?cursor={{cursor}}&limit=100         |
        |                               |
5. [Code] - Transformar campos          |
   (mapeo Bubble → Supabase)            |
        |                               |
6. [Supabase] - Upsert growth_users     |
   Conflict: bubble_user_id             |
        |                               |
7. [IF] - remaining > 0?  ──SI──→ cursor += 100 ──→|
        |
       NO
        |
8. [Supabase] - Insert sync_logs
   source: "bubble_users"
   records_processed: total
        |
9. [End]
```

---

## Checklist antes de activar

- [ ] Token API de Bubble configurado en n8n (credencial Header Auth)
- [ ] URL de Supabase y Service Role Key configurados
- [ ] Verificar nombres exactos de campos en Bubble (hacer 1 llamada de prueba)
- [ ] Ejecutar manualmente 1 vez y revisar datos en Supabase
- [ ] Verificar que las queries de verificacion devuelven datos correctos
- [ ] Activar el schedule (cada 4 horas)

---

## FAQ

**P: Que pasa si un usuario se elimina en Bubble?**
R: No se elimina de `growth_users`. El pipeline solo hace upsert (crear o actualizar). Si necesitas detectar eliminados, tendrias que comparar IDs, pero por ahora no es necesario.

**P: Que pasa si cambio un nombre de campo en Bubble?**
R: El pipeline dejara de mapear ese campo (sera `null`). Actualiza el mapeo en el nodo Code.

**P: Cuanto tarda la sincronizacion?**
R: Depende de la cantidad de usuarios. ~100 usuarios/segundo es tipico. 5,000 usuarios ≈ 50 segundos.

**P: Puedo ejecutar manualmente?**
R: Si. En n8n, abre el flujo y haz click en "Execute Workflow". Util para la primera carga.
