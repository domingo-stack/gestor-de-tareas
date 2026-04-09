# Plan Mixpanel — Fase 3 (Pendiente)

## Contexto
El Growth Dashboard (`/revenue`) tiene 8 tabs. Las fases 1-2 y 4 ya estan implementadas con datos de `rev_orders` (pagos) y `growth_users` (usuarios Bubble via n8n). La Fase 3 requiere integrar datos de **Mixpanel** para completar dos tabs: **Comportamiento** y parte de **Conversion**.

## Estado actual
- **Tablas Supabase creadas** (vacias, sin datos):
  - `growth_events` — eventos de Mixpanel
  - `growth_funnels` — funnels de Mixpanel
  - `growth_retention` — cohortes de retencion
  - `growth_metrics_daily` — metricas diarias (DAU/WAU/MAU)
- **Componente placeholder**: `RetentionCohort.tsx` existe pero sin datos reales
- **Conversion tab**: tiene un placeholder para "Onboarding funnel from Mixpanel"

---

## Lo que falta implementar

### 1. Pipeline n8n: Mixpanel → Supabase
Crear workflows en n8n que extraigan datos de la API de Mixpanel y los inserten en las tablas de Supabase:

- **growth_events**: Eventos clave del producto (signup, login, create_project, paywall_view, etc.)
- **growth_funnels**: Datos de funnels predefinidos en Mixpanel (onboarding funnel, conversion funnel)
- **growth_retention**: Cohortes semanales/mensuales de retencion
- **growth_metrics_daily**: DAU, WAU, MAU calculados diariamente

La frecuencia deberia ser diaria (cron nocturno), similar al pipeline existente de Bubble Users.

### 2. Tab Comportamiento (completo)
Este tab esta 100% pendiente. Debe mostrar:

- **DAU / WAU / MAU**: Grafico de tendencia con los 3 valores en el tiempo. Fuente: `growth_metrics_daily`.
- **Cohortes de retencion**: Tabla triangular clasica (semana de registro vs semana N). Fuente: `growth_retention`.
- **Paywall insights**: Metricas de conversion en el paywall — cuantos ven paywall, cuantos pagan, tasa de conversion. Fuente: `growth_events` filtrado por eventos de paywall.

### 3. Tab Conversion — Funnel de Onboarding (parcial)
El tab de Conversion ya funciona con datos de `growth_users`, pero falta agregar:

- **Funnel de onboarding desde Mixpanel**: Visualizar los pasos del funnel (ej: signup → first_login → create_project → invite_team → first_payment). Fuente: `growth_funnels`.
- Esto iria como una seccion adicional dentro del tab existente, debajo del funnel actual.

### 4. RPCs PostgreSQL
Crear RPCs para computar las metricas en el servidor (patron ya establecido en fases anteriores):

- `get_behavior_metrics` — DAU/WAU/MAU trends + retention cohorts
- `get_onboarding_funnel` — funnel steps desde growth_funnels

---

## Tablas Supabase (schema esperado)

```sql
-- growth_events: eventos individuales de Mixpanel
-- Columnas esperadas: id, event_name, user_id, timestamp, properties (jsonb)

-- growth_funnels: datos de funnels
-- Columnas esperadas: id, funnel_name, step_number, step_name, count, period_start

-- growth_retention: cohortes
-- Columnas esperadas: id, cohort_date, period_number, users_count, retention_pct

-- growth_metrics_daily: metricas agregadas
-- Columnas esperadas: id, date, dau, wau, mau
```

> Nota: El schema exacto de estas tablas debe validarse contra lo que ya existe en Supabase antes de empezar. Pueden haber sido creadas con columnas diferentes.

---

## Orden sugerido de implementacion
1. Configurar pipeline n8n Mixpanel → Supabase (sin esto no hay datos)
2. Validar que las tablas tengan datos
3. Crear RPCs PostgreSQL
4. Implementar tab Comportamiento
5. Agregar funnel de onboarding al tab Conversion

## Dependencias
- Acceso a la API de Mixpanel (API key, project token)
- Definir cuales eventos de Mixpanel son relevantes
- Definir los funnels a trackear (pasos del onboarding)
