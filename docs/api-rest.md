# API REST — Contrato del Hito 1

Interfaz interna de radio-service consumida por discord-service. Es una especificación de diseño, no una API desplegada. Control y metadatos usan JSON; el audio se devuelve como bytes. Identificadores de ejemplo y canciones son ficticios.

## Convenciones

- Rutas bajo `/api/v1`, salvo `/health`.
- IDs positivos, posición y duración como enteros en milisegundos, no negativos.
- Las fechas se representan en UTC con formato ISO 8601.
- Un controlador por emisora serializa las operaciones de selección y de progreso.
- Cambiar de canción es una operación POST; las consultas GET no avanzan la programación. [Semántica HTTP](https://httpwg.org/specs/rfc9110.html#safe.methods).
- La propuesta de autenticación interna es `Authorization: Bearer <service-token>`, configurado mediante variables de entorno. Los comandos públicos de Discord no exponen este token.
- En el entorno doméstico la API y PostgreSQL estarán en la red interna de contenedores; no se prevé publicar sus puertos directamente a Internet. Si el tráfico sale de ese entorno, se utilizará HTTPS.

## Estados de reproducción

| Estado | Significado |
|---|---|
| `idle` | La emisora aún no tiene una canción seleccionada; posición 0. |
| `loading` | Canción elegida y audio en preparación; no confirma reproducción efectiva. |
| `playing` | El reproductor ha confirmado inicio y mantiene alguna conexión activa. |
| `paused` | Canción detenida en un punto; podrá reanudarse. |
| `error` | El controlador comunicó un fallo que impide continuar. |

Transiciones previstas: idle → loading por primera selección; loading → playing al iniciar; playing → loading al terminar y avanzar; loading/playing → paused al salir la última conexión; paused → playing al reanudar; loading/playing → error si falla el audio. El punto guardado se conserva ante errores.

Un estado playing persistido antes de una caída no implica que existan conexiones tras reiniciar. El controlador reconstruye sus conexiones y trata el punto guardado como recuperable antes de reanudar, sin sumar el tiempo de caída a la posición.

## GET /health

Sin cuerpo. Consulta preparación de la API y acceso a PostgreSQL; no modifica reproducción. Puede consultarse en la red interna sin token y no devuelve credenciales o datos del catálogo.

`200 OK`:

```json
{
  "status": "ok",
  "database": "available"
}
```

`503 Service Unavailable` si falta una dependencia:

```json
{
  "status": "unavailable",
  "database": "unavailable"
}
```

## GET /api/v1/stations

Sin cuerpo. Lista las emisoras habilitadas. El MVP tendrá una; un catálogo de emisoras vacío devuelve un array vacío.

`200 OK`:

```json
[
  {
    "id": 1,
    "name": "DAS Radio",
    "description": "Emisora musical compartida",
    "enabled": true
  }
]
```

No incluye archivos binarios ni provoca selección de canciones.

## GET /api/v1/stations/{id}/playback

Sin cuerpo. Devuelve el último estado registrado y los metadatos de la canción. La posición puede tener retraso frente al reproductor en memoria.

`200 OK`:

```json
{
  "station_id": 1,
  "current_track_id": 42,
  "position_ms": 65000,
  "status": "paused",
  "updated_at": "2026-10-13T10:00:00Z",
  "track": {
    "id": 42,
    "title": "Canción de ejemplo",
    "artist": "Artista de ejemplo",
    "duration_ms": 192000,
    "content_type": "audio/ogg"
  }
}
```

Si aún no hay selección, `current_track_id` y `track` son null, position_ms es 0 y status es idle. Emisora inexistente: `404`.

## POST /api/v1/stations/{id}/advance

Selecciona aleatoriamente una canción habilitada de la emisora, actualiza el estado a loading y coloca position_ms a 0. Solo lo solicita el controlador común, no cada conexión de Discord. La selección y el cambio de estado se realizan en una transacción de radio-service.

Primera selección:

```json
{
  "reason": "initial"
}
```

Al terminar una canción:

```json
{
  "reason": "track_finished"
}
```

`200 OK`:

```json
{
  "station_id": 1,
  "current_track_id": 43,
  "position_ms": 0,
  "status": "loading",
  "track": {
    "id": 43,
    "title": "Siguiente canción de ejemplo",
    "artist": "Artista de ejemplo",
    "duration_ms": 180000,
    "content_type": "audio/ogg"
  }
}
```

Reason solo admite initial y track_finished. Initial con canción existente o track_finished sin canción actual producen `409 state_conflict`. Un catálogo sin canciones disponibles produce `409 empty_catalog`. La misma canción puede volver a seleccionarse.

La operación no es idempotente: no se reintenta automáticamente si se pierde la respuesta. El controlador consulta playback antes de continuar y, si no puede resolver la ambigüedad, comunica un error en lugar de encadenar nuevas selecciones. Una deduplicación completa de peticiones queda para la implementación.

## PATCH /api/v1/stations/{id}/playback

Comunica progreso, pausa, inicio efectivo o error de la canción actual. En este contrato se requieren los tres campos de ejemplo; no permite seleccionar otra canción.

```json
{
  "current_track_id": 43,
  "position_ms": 30000,
  "status": "playing"
}
```

`200 OK`:

```json
{
  "station_id": 1,
  "current_track_id": 43,
  "position_ms": 30000,
  "status": "playing",
  "updated_at": "2026-10-13T10:05:00Z"
}
```

Validaciones: canción igual a la selección actual; posición entre 0 y duración; estado loading, playing, paused o error; transición compatible. Discord-service serializa los guardados y espera el resultado antes de enviar otro avance o actualización, para evitar que una actualización anterior sobrescriba otra.

Una canción diferente o transición incompatible produce `409 state_conflict`; valores fuera de rango, `422 invalid_payload`. La protección frente a peticiones tardías de procesos antiguos y la coordinación de varios controladores se reservarán para implementación; el MVP no replica el controlador.

El intervalo de guardado periódico y los timeouts serán configurables; no se fija una garantía de pérdida máxima antes de medir el sistema. Al pausar se intenta guardar inmediatamente. Si falla, se mantiene el punto en memoria y se informa; tras una caída se recupera el último punto confirmado por PostgreSQL.

## GET /api/v1/tracks/{id}/audio

Sin cuerpo. Devuelve el archivo binario de una canción disponible de la emisora. No devuelve JSON con una URL ni accede a almacenamiento externo.

Respuesta orientativa para un archivo Ogg:

```http
HTTP/1.1 200 OK
Content-Type: audio/ogg
Content-Length: 1234567

[bytes del archivo]
```

El tipo y longitud reales corresponden al archivo almacenado; Ogg es un ejemplo, el formato definitivo sigue pendiente. Canción inexistente: `404 track_not_found`; binario ausente o incoherente: `500 audio_unavailable`.

La recuperación temporal se realiza en el decodificador del reproductor después de obtener el audio. Este contrato no ofrece un parámetro de segundos ni promete soporte HTTP Range para recuperar por tiempo.

## Errores comunes

Salvo health, los errores siguen este formato, sin traza interna ni credenciales:

```json
{
  "error": {
    "code": "empty_catalog",
    "message": "La emisora no tiene canciones disponibles."
  }
}
```

| HTTP | Uso |
|---|---|
| `401` | Token interno ausente o inválido. |
| `404` | Emisora o canción inexistente. |
| `409` | Catálogo vacío, selección incompatible o conflicto de estado. |
| `422` | JSON, identificadores, estado o posición no válidos. |
| `500` | Error interno, incluido audio incoherente; respuesta sin detalles sensibles. |
| `503` | Dependencia no disponible o servicio temporalmente no preparado. |

Si falla una consulta, no se detiene innecesariamente un audio ya cargado. Si falla el avance o no puede obtenerse el siguiente audio, se comunica un error operativo y se evita un bucle de reintentos. La API interna no equivale a autorización de comandos: cualquier usuario puede usar start y stop, mientras que solo discord-service se autentica ante radio-service.

## Relación con requisitos

| Casos de uso | Operaciones |
|---|---|
| CU-01, CU-02 | Playback y audio; advance solo si falta selección. |
| CU-03 | PATCH de pausa únicamente al salir la última conexión. |
| CU-04 | GET playback. |
| CU-05 | POST advance, GET audio, PATCH de inicio efectivo. |
| CU-06 | GET playback y audio, después PATCH al reanudar. |
| CU-07 | GET health y observación operativa. |

La especificación sintética satisface el diseño de interfaces del Hito 1. Versiones, pruebas, límites de archivo, timeouts y garantías de recuperación se validarán en los hitos de implementación.
