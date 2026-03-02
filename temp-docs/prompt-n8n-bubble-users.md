# Prompt para Claude — Crear pipeline n8n: Bubble Users → Supabase

Copia todo lo de abajo y pégalo en Claude (claude.ai):

---

Necesito que me ayudes paso a paso a crear un flujo en n8n que sincronice usuarios de mi app de Bubble hacia una tabla `growth_users` en Supabase. Ya tengo la carga histórica hecha (340k usuarios via CSV). Ahora necesito el pipeline incremental que corra cada 4 horas y solo traiga los usuarios que cambiaron desde la última sincronización.

## Mi nivel técnico con n8n
- Sé crear flujos básicos, conectar nodos, usar HTTP Request
- Sé usar constraints con JSON en el nodo HTTP Request para filtrar datos de Bubble
- Nunca he ejecutado queries SQL directas en n8n — prefiero usar nodos nativos (Supabase node) o HTTP Request con JSON
- Necesito instrucciones paso a paso con screenshots mentales (dime exactamente qué campo poner dónde)

## Lo que tengo configurado
- n8n funcionando (ya tengo un pipeline de pagos Bubble → Supabase que funciona)
- Credenciales de Bubble API ya configuradas en n8n
- Credenciales de Supabase ya configuradas en n8n
- Tabla `growth_users` en Supabase ya creada y con datos históricos
- Tabla `sync_logs` en Supabase ya existe (la uso para el pipeline de pagos)

## Arquitectura del flujo que necesito

```
[Schedule Trigger] → [Obtener fecha última sync] → [Loop: GET Bubble API con filtro Modified Date] → [Transformar datos] → [Upsert Supabase] → [Registrar sync en sync_logs]
```

## Detalle nodo por nodo

### Nodo 1: Schedule Trigger
- Ejecutar cada 4 horas

### Nodo 2: Obtener fecha de última sincronización
- Necesito leer de la tabla `sync_logs` de Supabase el registro más reciente donde `source = 'bubble_users'` y `status = 'success'`
- Solo necesito el campo `created_at` de ese registro
- Si no hay registros previos, usar como fallback: `2026-03-01T00:00:00Z`
- **IMPORTANTE:** No sé hacer queries SQL en n8n. Necesito que me digas cómo hacerlo con el nodo nativo de Supabase (operación "Get Many" con filtros) o con HTTP Request al REST API de Supabase

### Nodo 3: HTTP Request a Bubble API (con paginación)
- **URL:** `https://califica-app.bubbleapps.io/api/1.1/obj/user`
- **Method:** GET
- **Autenticación:** Bearer token (ya tengo la credencial configurada)
- **Filtro:** Solo traer usuarios donde `Modified Date` sea mayor que la fecha del nodo anterior
- El constraint en JSON sería algo como:
```json
[{"key": "Modified Date", "constraint_type": "greater than", "value": "{{fecha_ultima_sync}}"}]
```
- **Paginación:** Bubble devuelve máximo 100 por request. Necesito hacer loop:
  - Primera llamada: `cursor=0`, `limit=100`
  - Si `response.remaining > 0`: hacer otra llamada con `cursor = cursor_anterior + 100`
  - Repetir hasta `remaining = 0`
- Necesito que me digas exactamente cómo implementar este loop en n8n (¿uso Loop Over Items? ¿un nodo IF con back-connection? ¿SplitInBatches?)

### Nodo 4: Transformar datos (nodo Code)
Cada usuario de Bubble viene así:
```json
{
  "_id": "1772335365197x508735754257703800",
  "email": "reynaelisacanales@gmail.com",
  "Created Date": "Mar 1, 2026 12:22 am",
  "Modified Date": "Mar 1, 2026 12:53 am",
  "Pais": "Perú",
  "Origen": "Recomendación",
  "Evento de Valor": 1,
  "Ultima Conexion": "Mar 1, 2026 12:22 am",
  "Subscription_start": "Mar 1, 2026 12:48 am",
  "Subscription_end": "Mar 1, 2027 12:48 am",
  "Plan gratuito": "no",
  "Plan pagado": "si",
  "Cancelado": "no",
  "Suscripcion": "12 Meses",
  "Numero Invitados": 0
}
```

Y necesito transformarlo a este formato para Supabase:
```json
{
  "bubble_user_id": "1772335365197x508735754257703800",
  "email": "reynaelisacanales@gmail.com",
  "country": "Perú",
  "origin": "Recomendación",
  "created_date": "2026-03-01T00:22:00.000Z",
  "last_login": "2026-03-01T00:22:00.000Z",
  "subscription_start": "2026-03-01T00:48:00.000Z",
  "subscription_end": "2027-03-01T00:48:00.000Z",
  "plan_free": false,
  "plan_paid": true,
  "cancelled": false,
  "plan_id": "12 Meses",
  "eventos_valor": 1,
  "referral_count": 0,
  "updated_at": "2026-03-01T12:00:00.000Z"
}
```

Las transformaciones necesarias son:
1. **Fechas:** Bubble puede enviar en formato ISO o en formato legible ("Mar 1, 2026 12:22 am"). Necesito convertir a ISO 8601.
2. **Booleanos:** Bubble envía `"si"`/`"no"` como texto. Necesito convertir a `true`/`false`.
3. **Números:** `Evento de Valor` y `Numero Invitados` pueden venir como string. Necesito `parseInt() || 0`.
4. **Campo plan:** El nombre del plan viene en `Suscripcion` (NO en `PlanID` que está vacío).

Aquí está el código JavaScript que necesito en el nodo Code:

```javascript
function toBool(val) {
  if (val === true) return true;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    return lower === 'si' || lower === 'sí' || lower === 'yes' || lower === 'true';
  }
  return false;
}

function toISO(dateVal) {
  if (!dateVal) return null;
  // Si ya es ISO, devolverlo
  if (typeof dateVal === 'string' && dateVal.includes('T')) return dateVal;
  // Intentar parsear formato Bubble: "Mar 1, 2026 12:22 am"
  const parsed = new Date(dateVal);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const results = [];
for (const item of $input.all()) {
  const u = item.json;
  results.push({
    json: {
      bubble_user_id: u._id,
      email: u.email || null,
      country: u["Pais"] || u["País"] || null,
      origin: u["Origen"] || null,
      created_date: toISO(u["Created Date"]),
      last_login: toISO(u["Ultima Conexion"] || u["Última Conexión"]),
      subscription_start: toISO(u["Subscription_start"]),
      subscription_end: toISO(u["Subscription_end"]),
      plan_free: toBool(u["Plan gratuito"] || u["plan gratuito"]),
      plan_paid: toBool(u["Plan pagado"] || u["plan pagado"]),
      cancelled: toBool(u["Cancelado"]),
      plan_id: u["Suscripcion"] || u["Suscripción"] || null,
      eventos_valor: parseInt(u["Evento de Valor"]) || 0,
      referral_count: parseInt(u["Numero Invitados"]) || 0,
      updated_at: new Date().toISOString()
    }
  });
}
return results;
```

### Nodo 5: Upsert a Supabase
- **Tabla:** `growth_users`
- **Operación:** Upsert
- **Columna de conflicto:** `bubble_user_id` (tiene constraint UNIQUE)
- Si el usuario ya existe → actualizar todos los campos
- Si el usuario es nuevo → insertarlo
- Si hay más de 500 items, necesito hacer batching (Split In Batches de 500)
- Puedo usar el nodo nativo de Supabase o HTTP Request con header `Prefer: resolution=merge-duplicates`

### Nodo 6: Registrar en sync_logs
- Insertar un registro en `sync_logs` con:
  - `source`: `"bubble_users"`
  - `records_processed`: cantidad total de usuarios procesados
  - `status`: `"success"`
  - `created_at`: fecha actual ISO

### Error handling
- Si algo falla, registrar en `sync_logs` con `status: "error"` y el mensaje de error

## Lo que necesito de ti

1. Guíame paso a paso para crear cada nodo
2. Dime exactamente qué configurar en cada campo de cada nodo
3. Para el loop de paginación de Bubble, dime exactamente qué estructura de nodos usar y cómo conectarlos
4. Para leer la última sync de sync_logs, dime cómo hacerlo sin SQL (usando nodo Supabase o HTTP Request con filtros JSON)
5. Si hay algo que no se puede hacer sin SQL, dame la alternativa más simple

Empecemos nodo por nodo. Primero muéstrame cómo configurar el Schedule Trigger y el nodo para leer la última fecha de sync.
