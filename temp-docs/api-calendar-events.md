# API: Calendar Events — Gestor de Tareas

Endpoint para crear y listar eventos del calendario desde servicios externos.

## Autenticación

Todos los endpoints requieren Bearer token:
```
Authorization: Bearer <EVENTS_API_SECRET>
```

## Endpoints

### `POST /api/calendar/events`

Crea un evento en el calendario.

**Request:**
```json
{
  "title": "Webinar: Planificación con IA",
  "start_date": "2026-05-01",
  "team": "Marketing",
  "description": "Sesión en vivo para docentes",
  "end_date": "2026-05-01",
  "video_link": "https://meet.google.com/xxx",
  "custom_data": {
    "estado": "Pendiente",
    "formato": "Video",
    "pilar": "Educación IA"
  },
  "notify": true
}
```

**Campos:**

| Campo | Tipo | Requerido | Default | Descripción |
|-------|------|-----------|---------|-------------|
| `title` | string | sí | — | Máx 200 chars |
| `start_date` | string | sí | — | Formato YYYY-MM-DD |
| `team` | string | sí | — | Ver opciones abajo |
| `end_date` | string | no | start_date | Formato YYYY-MM-DD |
| `description` | string | no | null | Descripción del evento |
| `video_link` | string | no | null | URL de videollamada |
| `custom_data` | object | no | null | Campos custom por team |
| `notify` | boolean | no | true | Si false, crea como borrador sin notificaciones |

**Teams válidos:** `Marketing`, `Producto`, `Customer Success`, `General`, `Kali Te Enseña`

**custom_data por team:**
- **Marketing**: `{ "estado": "Pendiente|Publicado|...", "formato": "Video|Imagen|...", "pilar": "..." }`
- **Kali Te Enseña**: `{ "pais": "PE|MX|CL|...", "caso_uso": "..." }`
- **Otros**: cualquier objeto JSON

**Respuestas:**
- `201` — Evento creado
  ```json
  { "event": { "id": 123, "title": "...", ... }, "notifications_sent": 5 }
  ```
- `400` — Campo requerido faltante
- `401` — Token inválido o ausente
- `422` — Team no válido
- `500` — Error interno

### `GET /api/calendar/events`

Lista eventos filtrados.

**Query params:**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `from` | YYYY-MM-DD | — | Desde esta fecha |
| `to` | YYYY-MM-DD | — | Hasta esta fecha |
| `team` | string | — | Filtrar por team |
| `limit` | int | 50 | Máx 200 |

**Ejemplo:**
```
GET /api/calendar/events?from=2026-05-01&to=2026-05-31&team=Marketing
```

**Respuesta:**
```json
{
  "events": [
    { "id": 123, "title": "...", "start_date": "2026-05-01", "team": "Marketing", ... }
  ],
  "total": 1
}
```

## Ejemplos curl

**Crear evento:**
```bash
curl -X POST https://tu-gestor.vercel.app/api/calendar/events \
  -H "Authorization: Bearer TU_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title":"Clase en vivo","start_date":"2026-05-15","team":"Kali Te Enseña","custom_data":{"pais":"PE"}}'
```

**Listar eventos del mes:**
```bash
curl "https://tu-gestor.vercel.app/api/calendar/events?from=2026-05-01&to=2026-05-31" \
  -H "Authorization: Bearer TU_SECRET"
```

## Variables de entorno

```
EVENTS_API_SECRET=<string aleatorio seguro>
```

Agregar en `.env.local` (dev) y en Vercel (prod).
