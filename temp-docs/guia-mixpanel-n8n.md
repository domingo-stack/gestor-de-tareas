# Guia Completa: Mixpanel → Supabase via n8n

Guia paso a paso para sincronizar datos de Mixpanel al Growth Dashboard.
Prefijo de workflows: `GRW_` (Growth).

---

## Paso 1: Crear Service Account en Mixpanel

1. Ir a **mixpanel.com** → click en el engranaje (Settings) arriba a la derecha
2. Click en **Organization Settings** (no Project Settings)
3. En el menu izquierdo, buscar **Service Accounts**
4. Click en **+ Add Service Account**
5. Configurar:
   - **Name:** `n8n-califica-sync`
   - **Role:** `Admin` (necesario para Query API)
   - **Projects:** seleccionar el proyecto de Califica
6. Click **Create**
7. **IMPORTANTE:** Copiar el **Username** y el **Secret** que aparecen. El secret solo se muestra una vez. Si lo pierdes, tienes que crear uno nuevo.

Ejemplo de lo que obtienes:
```
Username: n8n-califica-sync.abc123.mp-service-account
Secret:   xW8kP9mN2vB5... (string largo)
```

## Paso 2: Obtener Project ID

1. En Mixpanel, click en el engranaje → **Project Settings**
2. Copiar el **Project ID** (es un numero, ej: `3124567`)

## Paso 3: Crear Funnels en Mixpanel

Ir a Mixpanel → **Funnels** → **+ Create Funnel** y crear estos dos:

### Funnel 1: "Onboarding Califica"
Agregar estos pasos en orden:
1. `Registro`
2. `Onboarding > Paso`
3. `IA > Generar Material`
4. `Doc > Descargar`
5. `Pago > Exito`

### Funnel 2: "Paywall Califica"
Agregar estos pasos en orden:
1. `Pago > Paywall visto`
2. `Pago > Ver Planes`
3. `Pago > Intento`
4. `Pago > Exito`

Guardar ambos funnels y anotar sus **IDs** (el ID esta en la URL cuando abres el funnel: `mixpanel.com/project/XXXXX/view/YYYYY/funnels#id=FUNNEL_ID`).

## Paso 4: Referencia de eventos

Ya identificamos los eventos activos del CSV de Mixpanel. Todos los eventos activos usan el formato `Categoría > Acción`. Acá la referencia completa:

### Eventos core (los que usamos en pipelines)

| Evento | Volumen | Uso en pipeline |
|---|---|---|
| `Registro` | 19K | born_event para retention, paso 1 de onboarding |
| `IA > Generar Material` | 204K | Evento de valor principal, proxy de actividad |
| `Nav > Module` | 216K | Navegacion entre modulos, actividad general |
| `Onboarding > Paso` | 64K | Funnel de onboarding |
| `Pago > Paywall visto` | 50K | Paso 1 del funnel de paywall |
| `Pago > Ver Planes` | 4.5K | Paso 2 del funnel de paywall |
| `Pago > Intento` | 7.7K | Paso 3 del funnel de paywall |
| `Pago > Exito` | 2.3K | Conversion a pago |
| `Doc > Descargar` | 93K | Descarga de material generado |

### Eventos secundarios (por si necesitas segmentar despues)

| Categoria | Eventos |
|---|---|
| **IA** | `IA > Generar Material` (204K), `IA > Regenerar` (10.6K) |
| **Doc** | `Doc > Descargar` (93K), `Doc > Accion` (14K) |
| **Aula** | `Aula > Crear` (420), `Aula > Asistencia` (694), `Aula > Agregar Estudiante` (337), `Aula > Exportar Asistencia` (165) |
| **Kalisala** | `Kalisala > Crear` (163), `Kalisala > Alumno Conectado` (1.1K), `Kalisala > Evaluacion Completada`, `Kalisala > Exportar`, `Kalisala > Mensaje Enviado` |
| **Pago** | `Pago > Paywall visto` (50K), `Pago > Ver Planes` (4.5K), `Pago > Intento` (7.7K), `Pago > Exito` (2.3K) |
| **Pagos** (checkout) | `Pagos > Plan Selector Mostrado`, `Pagos > Plan Seleccionado`, `Pagos > Metodo Pago Seleccionado`, `Pagos > Cerrado` |
| **Paywall** (v2) | `Paywall > Mostrado` (136), `Paywall > CTA Click` (7) |
| **Growth** | `Growth > Invitar amigos` (2.5K) |
| **Usuario** | `Usuario > Seguridad` (4.7K), `Usuario > Accion` (231) |
| **Soporte** | `Soporte > Recurso Ayuda` (2.7K) |

### Eventos legacy (NO usar, nomenclatura vieja)
`Login`, `LoginPorLink`, `ContraseñaCorreo`, `ContraseñaSMS`, `Generacion *`, `Ficha*`, `Boton Pago *`, `RegenerarInicio`, `Ver Actualizaciones`, etc. — son la version anterior. Ignorarlos.

### Eventos nativos de Mixpanel ($ prefix)
`$session_start`, `$session_end`, `$identify` — estos los maneja Mixpanel automaticamente. `$session_start` es util como proxy de actividad si no quieres usar `Nav > Module`.

## Paso 5: Configurar Variables en n8n

Ir a n8n → **Settings** → **Variables** y agregar:

| Variable | Valor |
|---|---|
| `MIXPANEL_PROJECT_ID` | El Project ID del paso 2 |
| `MIXPANEL_SA_USERNAME` | El username del Service Account del paso 1 |
| `MIXPANEL_SA_SECRET` | El secret del Service Account del paso 1 |
| `MIXPANEL_BORN_EVENT` | `Registro` |
| `MIXPANEL_ACTIVITY_EVENT` | `IA > Generar Material` (evento core del producto, 204K eventos) |
| `MIXPANEL_ONBOARDING_FUNNEL_ID` | ID del funnel "Onboarding Califica" del paso 3 |
| `MIXPANEL_PAYWALL_FUNNEL_ID` | ID del funnel "Paywall Califica" del paso 3 |

Tambien crear un **Credential** tipo **HTTP Request** → **Basic Auth**:
- **Name:** `Mixpanel Service Account`
- **User:** pegar el username del SA
- **Password:** pegar el secret del SA

---

## Workflow 1: `GRW_Sync_Mixpanel_Metrics` (DAU/WAU/MAU)

**Objetivo:** Traer metricas de engagement diario: usuarios activos por dia/semana/mes, separados en pagados y gratuitos.

**Frecuencia:** Diario a las 4 AM UTC (11 PM Lima)

### Nodo 1 — Schedule Trigger
- **Tipo:** Schedule Trigger
- **Cron:** `0 4 * * *` (UTC — 11 PM Lima)

### Nodo 2 — Set Variables
- **Tipo:** Set
- **Campos:**
  - `projectId`: `{{ $env.MIXPANEL_PROJECT_ID }}`
  - `dateYesterday`: `{{ $now.minus(1, 'day').format('yyyy-MM-dd') }}`
  - `date7dAgo`: `{{ $now.minus(7, 'days').format('yyyy-MM-dd') }}`
  - `date30dAgo`: `{{ $now.minus(30, 'days').format('yyyy-MM-dd') }}`
  - `activityEvent`: `{{ $env.MIXPANEL_ACTIVITY_EVENT }}`

### Nodo 3a — HTTP Request (DAU - diario, ultimos 30 dias)
- **Tipo:** HTTP Request
- **Nombre del nodo:** `Mixpanel DAU`
- **Metodo:** GET
- **URL:** `https://mixpanel.com/api/2.0/segmentation`
- **Authentication:** Predefined Credential Type → `Mixpanel Service Account`
- **Send Query Parameters:** Yes
  - `project_id`: `{{ $json.projectId }}`
  - `event`: `IA > Generar Material`
  - `from_date`: `{{ $json.date30dAgo }}`
  - `to_date`: `{{ $json.dateYesterday }}`
  - `type`: `unique`
  - `unit`: `day`

> Esto retorna `{ data: { series: ["2026-03-10", ...], values: { "IA > Generar Material": { "2026-03-10": 2706, ... } } } }`

### Nodo 3b — HTTP Request (WAU - semanal, ultimos 30 dias)
- **Tipo:** HTTP Request (en paralelo con 3a)
- **Nombre del nodo:** `Mixpanel WAU`
- **Misma config que 3a pero con:**
  - `unit`: `week`

### Nodo 3c — HTTP Request (MAU - mensual, ultimos 60 dias)
- **Tipo:** HTTP Request (en paralelo con 3a y 3b)
- **Nombre del nodo:** `Mixpanel MAU`
- **Misma config que 3a pero con:**
  - `from_date`: `{{ $now.minus(60, 'days').format('yyyy-MM-dd') }}`
  - `unit`: `month`

### Nodo 4 — Function Node (Transform Metrics)

Conectar los 3 nodos HTTP (DAU, WAU, MAU) al Function Node usando un **Merge** node (mode: Append) o leyendo cada input por nombre.

```javascript
// Leer los 3 responses por nombre de nodo
const dauRaw = $('Mixpanel DAU').first().json;
const wauRaw = $('Mixpanel WAU').first().json;
const mauRaw = $('Mixpanel MAU').first().json;

const eventName = 'IA > Generar Material';

// DAU: valores diarios
const dauValues = dauRaw?.data?.values?.[eventName] || {};

// WAU: valores semanales — asignar el valor de la semana a cada dia de esa semana
const wauValues = wauRaw?.data?.values?.[eventName] || {};
const wauByDate = {};
for (const [weekStart, count] of Object.entries(wauValues)) {
  // Asignar el WAU de la semana a todos los dias de ese rango
  const start = new Date(weekStart);
  for (let d = 0; d < 7; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const key = day.toISOString().slice(0, 10);
    wauByDate[key] = count;
  }
}

// MAU: valores mensuales — asignar a cada dia del mes
const mauValues = mauRaw?.data?.values?.[eventName] || {};
const mauByDate = {};
for (const [monthStart, count] of Object.entries(mauValues)) {
  const start = new Date(monthStart);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  for (let d = 0; d < daysInMonth; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const key = day.toISOString().slice(0, 10);
    mauByDate[key] = count;
  }
}

// Combinar: una fila por dia
const dates = Object.keys(dauValues).sort();
const results = dates.map(date => ({
  json: {
    date,
    dau: dauValues[date] || 0,
    wau: wauByDate[date] || 0,
    mau: mauByDate[date] || 0,
    dau_paid: 0,   // Se puede segmentar despues con propiedad de usuario
    dau_free: 0,
    wau_paid: 0,
    wau_free: 0,
    mau_paid: 0,
    mau_free: 0,
  }
}));

return results;
```

> **Resultado esperado:** Un array de 30 objetos, uno por dia, con DAU/WAU/MAU. Los campos `_paid` y `_free` quedan en 0 por ahora — para segmentar necesitas agregar `&on=properties["plan_paid"]` al query de segmentation (lo puedes hacer despues).

### Nodo 5 — Supabase Upsert (growth_metrics_daily)
- **Tipo:** Supabase (o HTTP Request)
- **Operacion:** Upsert
- **Tabla:** `growth_metrics_daily`
- **Conflict column:** `date`
- **Campos mapeados:**
  - `date`: `{{ $json.date }}`
  - `dau`: `{{ $json.dau }}`
  - `wau`: `{{ $json.wau }}`
  - `mau`: `{{ $json.mau }}`

Si usas HTTP Request directo a Supabase REST API:
- **Metodo:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/growth_metrics_daily`
- **Query Params:**
  - `on_conflict`: `date`
- **Headers:**
  - `apikey`: `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates,return=minimal`
- **Body:** `={{ $input.all().map(item => item.json) }}`

### Nodo 6 — Supabase Insert (Sync Log)
- **Tipo:** HTTP Request
- **Metodo:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/mkt_sync_logs`
- **Headers:** (mismos que arriba)
- **Body:**
```json
{
  "source": "mixpanel_metrics",
  "status": "success",
  "records_processed": {{ $input.all().length }},
  "finished_at": "{{ $now.toISO() }}"
}
```

---

## Workflow 2: `GRW_Sync_Mixpanel_Retention` (Cohortes)

**Objetivo:** Traer datos de retencion por cohortes semanales y diarias.

**Frecuencia:** Diario a las 4:30 AM UTC

### Nodo 1 — Schedule Trigger
- **Tipo:** Schedule Trigger
- **Cron:** `30 4 * * *` (UTC)

### Nodo 2 — Set Variables
- **Tipo:** Set
- **Campos:**
  - `projectId`: `{{ $env.MIXPANEL_PROJECT_ID }}`
  - `fromDate`: `{{ $now.minus(90, 'days').format('yyyy-MM-dd') }}`
  - `toDate`: `{{ $now.minus(1, 'day').format('yyyy-MM-dd') }}`
  - `bornEvent`: `Registro`
  - `activityEvent`: `IA > Generar Material`

### Nodo 3a — HTTP Request (Retention Semanal)
- **Tipo:** HTTP Request
- **Metodo:** GET
- **URL:** `https://mixpanel.com/api/2.0/retention`
- **Authentication:** Predefined Credential Type → `Mixpanel Service Account`
- **Query Parameters:**
  - `project_id`: `{{ $json.projectId }}`
  - `from_date`: `{{ $json.fromDate }}`
  - `to_date`: `{{ $json.toDate }}`
  - `retention_type`: `birth`
  - `born_event`: `Registro`
  - `event`: `IA > Generar Material`
  - `unit`: `week`
  - `interval_count`: `9`

> **Nota:** Usamos `IA > Generar Material` como evento de actividad porque es el core del producto (204K eventos). Si prefieres medir actividad mas general, puedes usar `Nav > Module` (216K). Tambien puedes crear un segundo workflow con `$session_start` para comparar.

### Nodo 3b — HTTP Request (Retention Diaria)
- **Tipo:** HTTP Request (en paralelo con 3a)
- **Misma config que 3a pero con:**
  - `unit`: `day`
  - `interval_count`: `31`

### Nodo 4 — Function Node (Transform Retention)
```javascript
// Procesar ambos responses (semanal y diario)
const weeklyInput = $('HTTP Request Semanal').all();
const dailyInput = $('HTTP Request Diaria').all();

const results = [];

// --- WEEKLY RETENTION ---
const weeklyData = weeklyInput[0]?.json || {};
for (const [cohortDate, cohortInfo] of Object.entries(weeklyData)) {
  if (cohortDate === 'meta') continue; // skip metadata
  const counts = cohortInfo.counts || [];
  const first = cohortInfo.first || counts[0] || 0;

  for (let period = 0; period < counts.length; period++) {
    const usersCount = counts[period];
    const retentionPct = first > 0 ? Math.round((usersCount / first) * 10000) / 100 : 0;

    results.push({
      json: {
        cohort_date: cohortDate,
        period_number: period,
        period_type: 'week',
        users_count: usersCount,
        retention_pct: retentionPct,
        cohort_size: first
      }
    });
  }
}

// --- DAILY RETENTION (solo dias clave: 1, 3, 7, 14, 30) ---
const dailyData = dailyInput[0]?.json || {};
const keyDays = [1, 3, 7, 14, 30];

for (const [cohortDate, cohortInfo] of Object.entries(dailyData)) {
  if (cohortDate === 'meta') continue;
  const counts = cohortInfo.counts || [];
  const first = cohortInfo.first || counts[0] || 0;

  for (const day of keyDays) {
    if (day >= counts.length) continue;
    const usersCount = counts[day];
    const retentionPct = first > 0 ? Math.round((usersCount / first) * 10000) / 100 : 0;

    results.push({
      json: {
        cohort_date: cohortDate,
        period_number: day,
        period_type: 'day',
        users_count: usersCount,
        retention_pct: retentionPct,
        cohort_size: first
      }
    });
  }
}

return results;
```

### Nodo 5 — Supabase Upsert (growth_retention)
- **Tipo:** HTTP Request
- **Metodo:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/growth_retention`
- **Query Params:**
  - `on_conflict`: `cohort_date,period_number,period_type`
- **Headers:** (mismos que workflow 1)
- **Body:** `={{ $input.all().map(item => item.json) }}`

### Nodo 6 — Supabase Insert (Sync Log)
- Mismo patron que workflow 1, con `source`: `mixpanel_retention`

---

## Workflow 3: `GRW_Sync_Mixpanel_Funnels` (Onboarding + Paywall)

**Objetivo:** Traer datos de funnels predefinidos en Mixpanel.

**Frecuencia:** Diario a las 5 AM UTC

### Nodo 1 — Schedule Trigger
- **Tipo:** Schedule Trigger
- **Cron:** `0 5 * * *` (UTC)

### Nodo 2 — Set Variables
- **Tipo:** Set
- **Campos:**
  - `projectId`: `{{ $env.MIXPANEL_PROJECT_ID }}`
  - `fromDate`: `{{ $now.minus(30, 'days').format('yyyy-MM-dd') }}`
  - `toDate`: `{{ $now.minus(1, 'day').format('yyyy-MM-dd') }}`
  - `onboardingFunnelId`: `{{ $env.MIXPANEL_ONBOARDING_FUNNEL_ID }}` ← el ID del funnel "Onboarding Califica" (pasos: Registro → Onboarding > Paso → IA > Generar Material → Doc > Descargar → Pago > Exito)
  - `paywallFunnelId`: `{{ $env.MIXPANEL_PAYWALL_FUNNEL_ID }}` ← el ID del funnel "Paywall Califica" (pasos: Pago > Paywall visto → Pago > Ver Planes → Pago > Intento → Pago > Exito)

### Nodo 3a — HTTP Request (Funnel Onboarding)
- **Tipo:** HTTP Request
- **Metodo:** GET
- **URL:** `https://mixpanel.com/api/2.0/funnels`
- **Authentication:** `Mixpanel Service Account`
- **Query Parameters:**
  - `project_id`: `{{ $json.projectId }}`
  - `funnel_id`: `{{ $json.onboardingFunnelId }}`
  - `from_date`: `{{ $json.fromDate }}`
  - `to_date`: `{{ $json.toDate }}`
  - `unit`: `week`

> **Funnel Onboarding contiene:** Registro → Onboarding > Paso → IA > Generar Material → Doc > Descargar → Pago > Exito

### Nodo 3b — HTTP Request (Funnel Paywall)
- **Tipo:** HTTP Request (en paralelo con 3a)
- **Misma config pero con:**
  - `funnel_id`: `{{ $json.paywallFunnelId }}`

> **Funnel Paywall contiene:** Pago > Paywall visto → Pago > Ver Planes → Pago > Intento → Pago > Exito

### Nodo 4 — Function Node (Transform Funnels)
```javascript
const onboardingInput = $('HTTP Request Onboarding').all();
const paywallInput = $('HTTP Request Paywall').all();

const results = [];

function processFunnel(input, funnelName) {
  const data = input[0]?.json?.data || input[0]?.json || {};
  const meta = input[0]?.json?.meta || {};

  for (const [periodDate, periodData] of Object.entries(data)) {
    if (periodDate === 'meta') continue;
    const steps = periodData.steps || [];
    const firstCount = steps[0]?.count || 0;

    for (const step of steps) {
      const convPct = firstCount > 0
        ? Math.round((step.count / firstCount) * 10000) / 100
        : 0;

      results.push({
        json: {
          funnel_name: funnelName,
          step_number: step.step_order || step.stepIndex || 0,
          step_name: step.event || step.stepName || `Step ${step.step_order}`,
          count: step.count || 0,
          conversion_pct: convPct,
          period_start: periodDate,
        }
      });
    }
  }
}

processFunnel(onboardingInput, 'onboarding');
processFunnel(paywallInput, 'paywall');

return results;
```

### Nodo 5 — Supabase Upsert (growth_funnels)
- **Tipo:** HTTP Request
- **Metodo:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/growth_funnels`
- **Query Params:**
  - `on_conflict`: `funnel_name,step_number,period_start`
- **Headers:** (mismos de siempre)
- **Body:** `={{ $input.all().map(item => item.json) }}`

### Nodo 6 — Supabase Insert (Sync Log)
- Mismo patron, con `source`: `mixpanel_funnels`

---

## SQL: Verificar y ajustar tablas

Ejecutar en Supabase SQL Editor **antes** de crear los workflows.

### Verificar schemas actuales

```sql
-- Ver columnas de cada tabla
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('growth_metrics_daily', 'growth_retention', 'growth_funnels', 'growth_events')
ORDER BY table_name, ordinal_position;
```

### Ajustes esperados (ejecutar despues de verificar)

```sql
-- growth_metrics_daily: agregar columnas si faltan
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS dau_paid int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS dau_free int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS wau_paid int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS wau_free int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS mau_paid int DEFAULT 0;
ALTER TABLE growth_metrics_daily ADD COLUMN IF NOT EXISTS mau_free int DEFAULT 0;

-- growth_retention: agregar period_type y cohort_size
ALTER TABLE growth_retention ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'week';
ALTER TABLE growth_retention ADD COLUMN IF NOT EXISTS cohort_size int DEFAULT 0;
-- Crear constraint unico (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_retention_unique') THEN
    ALTER TABLE growth_retention ADD CONSTRAINT growth_retention_unique
      UNIQUE (cohort_date, period_number, period_type);
  END IF;
END $$;

-- growth_funnels: agregar columnas si faltan
ALTER TABLE growth_funnels ADD COLUMN IF NOT EXISTS conversion_pct numeric DEFAULT 0;
-- Crear constraint unico (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'growth_funnels_unique') THEN
    ALTER TABLE growth_funnels ADD CONSTRAINT growth_funnels_unique
      UNIQUE (funnel_name, step_number, period_start);
  END IF;
END $$;
```

---

## Checklist final

- [ ] Service Account creado en Mixpanel
- [ ] Project ID anotado
- [ ] Nombres exactos de eventos anotados (registro, actividad, paywall, pago)
- [ ] Funnels creados en Mixpanel (onboarding + paywall)
- [ ] Variables configuradas en n8n (7 variables + 1 credential)
- [ ] SQL de verificacion ejecutado en Supabase
- [ ] SQL de ajustes ejecutado en Supabase
- [ ] Workflow 1 creado y ejecutado manualmente → verificar datos en `growth_metrics_daily`
- [ ] Workflow 2 creado y ejecutado manualmente → verificar datos en `growth_retention`
- [ ] Workflow 3 creado y ejecutado manualmente → verificar datos en `growth_funnels`
- [ ] Los 3 workflows activados con cron

---

## Troubleshooting

**Error 401 Unauthorized:**
- Verificar que el Service Account tiene role Admin
- Verificar que el Project seleccionado es el correcto
- Verificar que username y secret estan bien copiados (sin espacios extra)

**Error 402 Payment Required:**
- Algunos endpoints requieren plan Growth o Enterprise de Mixpanel
- La API de Retention y Funnels esta disponible en todos los planes

**Error 429 Rate Limit:**
- Maximo 60 queries/hora y 5 concurrentes
- Agregar un nodo Wait de 2 segundos entre HTTP Requests si es necesario

**Response vacio {}:**
- Verificar que los nombres de eventos son exactos (case-sensitive)
- Verificar que el rango de fechas tiene datos
- Probar primero en el Mixpanel UI que los datos existen

**Datos de retention no coinciden con Mixpanel UI:**
- La API retorna datos raw, el UI puede aplicar filtros adicionales
- Verificar que `born_event` y `event` son los mismos que usas en el reporte de Mixpanel
