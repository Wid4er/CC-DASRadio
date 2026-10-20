# Primera versión ejecutable

Este incremento implementa la API y PostgreSQL y prepara discord-service para /radio now. Todavía no implementa start, stop, voz, sincronización entre servidores ni recuperación del reproductor de audio. La posición persistida de la API sí se conserva entre reinicios.

## Preparar y arrancar API y base de datos

Se necesita Docker con contenedores Linux y Docker Compose. Ejecutar desde la raíz de CC-DASRadio. No hace falta instalar Python o Node en el host para usar los contenedores.

En PowerShell, si todavía no existe .env:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Completar POSTGRES_PASSWORD y SERVICE_TOKEN con valores locales propios. Dejar COMPOSE_PROFILES vacío mientras se prepara el bot. No sobrescribir un .env existente ni incluirlo en Git. La configuración local preparada durante el desarrollo ya contiene credenciales aleatorias y no se ha publicado.

```powershell
docker compose up -d --build --wait radio-service
Invoke-RestMethod http://127.0.0.1:8000/health
```

Se crean PostgreSQL y la API. Los healthchecks esperan disponibilidad real de las dependencias. SEED_DEMO=true carga de forma idempotente una emisora y dos tonos WAV de un segundo generados localmente. Son audios de prueba; el formato del catálogo musical definitivo sigue pendiente.

La documentación interactiva de la API está en http://127.0.0.1:8000/docs. Usar Authorize con SERVICE_TOKEN para las operaciones internas. Health no requiere token. El puerto de desarrollo solo se publica en 127.0.0.1 y puede cambiarse mediante RADIO_PORT.

Se implementan las seis rutas de [api-rest.md](api-rest.md). La emisora parte en idle: no se selecciona ni reproduce una canción por consultar now. Para probar metadatos de una selección, ejecutar POST advance con reason initial desde la documentación de la API. Loading indica selección, no reproducción efectiva.

## Redes y datos

- backend es una red interna que comparten únicamente PostgreSQL y radio-service.
- control permite a discord-service consultar la API y acceder a Discord. El bot no comparte la red de PostgreSQL.
- PostgreSQL no publica su puerto al host.
- postgres-data conserva esquema, metadatos, audio y estado. PostgreSQL 18 utiliza el volumen montado en /var/lib/postgresql.
- La API aplica migraciones SQL versionadas al arrancar, dentro de una transacción y con bloqueo para evitar migraciones concurrentes.
- El catálogo de demostración no sobrescribe la selección ni la posición existentes.

Para detener sin borrar los datos:

```powershell
docker compose down
```

Volver a arrancar conserva el volumen. No usar down -v si se quieren mantener esos datos.

## Preparar el bot

Añadir al .env local:

- DISCORD_TOKEN: token del bot.
- DISCORD_CLIENT_ID: ID de la aplicación.
- DISCORD_GUILD_ID: ID del servidor de pruebas.
- STATION_ID: 1 para el catálogo de demostración.
- COMPOSE_PROFILES: discord para incluir el tercer servicio en el arranque habitual.

Invitar el bot al servidor de pruebas con los scopes bot y applications.commands. Este incremento solo consulta la API: no necesita Message Content Intent ni permisos de voz.

Construir y registrar el comando una vez:

```powershell
docker compose build discord-service
docker compose run --rm discord-service node dist/register-commands.js
docker compose up -d --build
```

El registro crea o actualiza /radio únicamente en el servidor indicado y conserva los demás comandos de la aplicación. No se ejecuta automáticamente en cada arranque.

En Discord, /radio now muestra la canción seleccionada, estado y último punto guardado; si no existe selección, lo indica. Las menciones procedentes del catálogo están deshabilitadas. Si la API falla, el usuario recibe un mensaje sin detalles internos.

Se puede verificar la comunicación del contenedor cliente con la API antes de disponer del token de Discord:

```powershell
docker compose run --rm discord-service node dist/check-api.js
```

Este comando no inicia sesión en Discord y no registra comandos.

## Pruebas y calidad

```powershell
docker compose -f compose.yaml -f compose.test.yaml run --build --rm radio-tests
docker compose build discord-service
```

El primer comando ejecuta Ruff y pruebas unitarias y de integración con PostgreSQL real. Cada prueba de integración usa un esquema aleatorio exclusivo y elimina únicamente ese esquema al finalizar. No necesita ni utiliza las credenciales de Discord.

La construcción del cliente ejecuta Biome, comprobación de tipos y siete pruebas con el runner de Node: formato, configuración, manejo de errores, petición HTTP y timeout. La integración real cliente-API se verifica con check-api.js.

El workflow ci.yml ejecuta estas validaciones y Hadolint en pushes y PR configuradas, sin un token de Discord. Este incremento todavía no publica imágenes en GHCR; esa parte de H2-06 sigue pendiente.

## Imágenes y dependencias

Python 3.13 y Node 24 usan imágenes oficiales slim basadas en Debian Bookworm, fijadas por digest. Se prefieren a una base con compiladores incluidos porque las dependencias elegidas disponen de distribuciones binarias y el cliente todavía no decodifica audio.

Los dos Dockerfiles separan preparación/compilación de ejecución y terminan con un usuario numérico no root: 10001 para la API y 1000 para Discord. Las dependencias se copian antes del código para aprovechar caché. La imagen de producción Python no incluye las herramientas de pruebas; la etapa test es independiente.

requirements.lock y requirements-dev.lock fijan las dependencias Python con hashes para varias plataformas; package-lock.json fija las de Node. Las actualizaciones de versiones, hashes y digests se revisan conjuntamente.

Referencias de implementación: [FastAPI en contenedores](https://fastapi.tiangolo.com/deployment/docker/), [transacciones Psycopg](https://www.psycopg.org/psycopg3/docs/basic/transactions.html), [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres) y [registro de comandos discord.js](https://discordjs.guide/legacy/app-creation/deploying-commands).
