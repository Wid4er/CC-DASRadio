# Primera versión ejecutable

Este incremento implementa la API y PostgreSQL, los comandos Discord /radio start, /radio stop y /radio now, y una web que consume la misma emisora. La [guía de evaluación web](evaluacion-web.md) permite probar audio y persistencia sin cuenta Discord. El reloj reside en la API; véase la [guía de reproducción compartida](reproduccion-compartida.md).

Prueba manual en Discord: el usuario confirmó el funcionamiento de `/radio now` el **4 de noviembre de 2026**, tras configurar el bot, registrar el comando y arrancar el entorno. Esta comprobación histórica corresponde al cliente de consulta. El incremento de voz del 11 de noviembre se verifica por separado y requiere probar /radio start en un canal real.

## Preparar y arrancar API y base de datos

Se necesita Docker con contenedores Linux y Docker Compose. Ejecutar desde la raíz de CC-DASRadio. No hace falta instalar Python o Node en el host para usar los contenedores.

### Arranque en Linux (CachyOS / Arch)

El arranque guiado necesita Bash y Python 3, usando únicamente su biblioteca estándar. Los servicios se ejecutan con Python 3.13 y Node 24 dentro de Docker; las versiones del host pueden ser distintas.

En CachyOS / Arch se necesitan los paquetes `docker` y `docker-compose`. Se recomienda también `docker-buildx` para construir con BuildKit; sin él, esta versión del proyecto puede construirse con el constructor clásico de Docker. Si Docker y Compose ya están instalados, comprobar el motor antes de arrancar:

```bash
sudo systemctl start docker
docker info
docker compose version
```

El servicio debe estar activo y el usuario debe tener acceso a Docker. Si aparece un error de permisos, revisar la configuración de acceso del equipo según la [guía de Docker para Linux](https://docs.docker.com/engine/install/linux-postinstall/). No es necesario ejecutar el lanzador con sudo. Referencias: [Docker en Arch](https://wiki.archlinux.org/title/Docker) y [arranque del motor](https://docs.docker.com/engine/daemon/start/).

Después de añadir el usuario al grupo `docker`, abrir una nueva sesión o ejecutar `newgrp docker` en la terminal antes de iniciar el proyecto.

Desde la raíz del repositorio, arrancar web, API y PostgreSQL:

```bash
./scripts/start.sh
```

Si falta `.env`, se crea con claves internas aleatorias y permisos 600 y el arranque continúa sin exigir campos Discord. Un `.env` existente conserva sus valores. Si Compose encuentra `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` y `DISCORD_GUILD_ID` completos, también se inicia Discord automáticamente; las variables heredadas respetan la precedencia de Compose. Si faltan o contienen marcadores de ejemplo, se informa de los nombres pendientes y se inicia la web sin el bot. La detección comprueba la configuración local, no valida el token contra Discord. Abrir **http://127.0.0.1:8080**; `WEB_PORT` permite cambiar el puerto.

Para arrancar solo API y PostgreSQL:

```bash
./scripts/start.sh --api-only
curl --fail --silent --show-error http://127.0.0.1:8000/health
```

Para iniciar solo la web aunque el bot esté configurado:

```bash
./scripts/start.sh --web-only
```

Este modo selecciona qué arrancar; para detener un bot que ya estuviera funcionando, usar `docker compose stop discord-service`.

El arranque automático incluye el bot al completar sus tres campos. Para exigir la configuración Discord y recibir un error si está incompleta, usar:

```bash
./scripts/start.sh --discord
```

El lanzador funciona desde cualquier directorio y admite rutas con espacios. Compose interpreta `.env`; el lanzador no lo ejecuta como código ni imprime sus valores. Las variables exportadas tienen la precedencia habitual de Compose.

Los entornos `.venv`, `node_modules` y `dist` copiados desde Windows no son portables. No se necesitan para este arranque: los Dockerfiles instalan y compilan las dependencias Linux desde los locks, excluyendo esas carpetas locales del contexto. La web no tiene dependencias npm de ejecución; Biome solo se instala en la etapa de validación.

### Primer arranque guiado en Windows

Ejecutar desde la raíz del repositorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

Si `.env` no existe, el script lo genera desde `.env.example` con claves aleatorias para PostgreSQL y la API y continúa con web, API y base de datos. Las credenciales Discord son opcionales. La web está en http://127.0.0.1:8080.

El bot se incluye automáticamente si sus tres campos están completos. `-WebOnly` inicia solo la web y sus dependencias. `-WithDiscord` exige la configuración del bot. Si falta `.env` en ese modo, se crea y el programa se detiene para completarlo. Un archivo existente conserva sus valores. Los secretos no se imprimen ni se pasan como argumentos.

En la carpeta local Practica también existe start.cmd, fuera del repositorio, que delega en este arranque. El modo `-ApiOnly` inicia solo API y PostgreSQL:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -ApiOnly
```

Si se usa Compose directamente en lugar del arranque guiado, hay que preparar previamente .env; los siguientes comandos directos siguen disponibles:

```powershell
docker compose up -d --build --wait radio-service
Invoke-RestMethod http://127.0.0.1:8000/health
```

Se crean PostgreSQL y la API. Los healthchecks esperan disponibilidad real de las dependencias. SEED_DEMO=true carga de forma idempotente una emisora y dos tonos WAV de un segundo generados localmente. Son audios de prueba; el formato del catálogo musical definitivo sigue pendiente.

La documentación interactiva de la API está en http://127.0.0.1:8000/docs. Usar Authorize con SERVICE_TOKEN para las operaciones internas. Health no requiere token. El puerto de desarrollo solo se publica en 127.0.0.1 y puede cambiarse mediante RADIO_PORT.

Se implementan las seis rutas de [api-rest.md](api-rest.md). La emisora parte en idle: no se selecciona ni reproduce una canción por consultar now. Para probar metadatos de una selección, ejecutar POST advance con reason initial desde la documentación de la API. Loading indica selección, no reproducción efectiva.

## Redes y datos

- backend es una red interna que comparten únicamente PostgreSQL y radio-service.
- control permite a web-service y discord-service consultar la API, y al bot acceder a Discord. El bot no comparte la red de PostgreSQL.
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

Este paso es opcional para evaluar mediante la web. El [tutorial completo de Discord](configurar-discord.md) explica cómo crear la aplicación, generar el token, invitar el bot y obtener los IDs. Con la web arrancada también se puede consultar en **/ayuda/discord**, desde el desplegable de ayuda de la radio. Si el bot no está preparado o no conecta, continuar con `./scripts/start.sh --web-only` (o `-WebOnly` en PowerShell).

Añadir al .env local:

- DISCORD_TOKEN: token del bot.
- DISCORD_CLIENT_ID: ID de la aplicación.
- DISCORD_GUILD_ID: ID del servidor de referencia; se conserva en el lanzador, pero no limita el alcance global de los comandos.
- STATION_ID: 1 para el catálogo de demostración.
- COMPOSE_PROFILES: discord solo si se quiere añadir el bot a los tres servicios web/API/base de datos al ejecutar Compose directamente; el lanzador lo activa automáticamente al detectar los tres campos del bot, o al usar --discord / -WithDiscord.

Invitar el bot a los servidores con los scopes bot y applications.commands. Para reproducir necesita Ver canal, Enviar mensajes, Conectar y Hablar; no requiere intents privilegiados.

El bot registra /radio globalmente al conectar y lo actualiza cuando cambia su definición. La misma comprobación puede ejecutarse manualmente:

En Linux:

```bash
docker compose build discord-service
docker compose run --rm discord-service node dist/register-commands.js
./scripts/start.sh --discord
```

En Windows:

```powershell
docker compose build discord-service
docker compose run --rm discord-service node dist/register-commands.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -WithDiscord
```

El registro crea o actualiza únicamente /radio en el ámbito global y conserva los demás comandos de la aplicación. Sirve para todos los servidores donde se instala el bot. Al arrancar, compara la definición y evita volver a publicarla si ya coincide. No es necesario cambiar DISCORD_GUILD_ID al invitarlo a otro servidor.

En Discord, /radio now muestra la canción seleccionada, estado y posición actual calculada por el proveedor; si no existe selección, lo indica. Las menciones procedentes del catálogo están deshabilitadas. Si la API falla, el usuario recibe un mensaje sin detalles internos.

Se puede verificar la comunicación del contenedor cliente con la API antes de disponer del token de Discord:

```powershell
docker compose run --rm discord-service node dist/check-api.js
```

Este comando no inicia sesión en Discord y no registra comandos.

## Pruebas y calidad

Los siguientes comandos sirven tanto en Bash (Linux) como en PowerShell (Windows):

```sh
docker compose -f compose.yaml -f compose.test.yaml run --build --rm radio-tests
docker compose build discord-service web-service
python3 -m unittest discover -s scripts/tests -v
```

El primer comando ejecuta Ruff y pruebas unitarias y de integración con PostgreSQL real. Cada prueba de integración usa un esquema aleatorio exclusivo y elimina únicamente ese esquema al finalizar. No necesita ni utiliza las credenciales de Discord.

La construcción del cliente ejecuta Biome, comprobación de tipos y 23 pruebas con el runner de Node: formato, configuración, registro global, voz compartida, manejo de errores, petición HTTP y timeout. La integración real cliente-API se verifica con check-api.js.

La construcción de web-service ejecuta Biome y las pruebas del proxy de sesiones y del servidor HTTP. Las pruebas del reloj compartido se ejecutan en radio-service. La [guía web](evaluacion-web.md) explica la integración con PostgreSQL real y la prueba de varios oyentes.

El workflow ci.yml ejecuta estas validaciones y Hadolint en pushes y PR configuradas, sin un token de Discord. El job publish publica las tres imágenes únicamente después de validate y ante un push a main; usa GITHUB_TOKEN con packages: write. Las PR no publican. Véase la [guía GHCR](ghcr.md).

## Imágenes y dependencias

Python 3.13 y Node 24 usan imágenes oficiales slim basadas en Debian Bookworm, fijadas por digest. Se prefieren a una base con compiladores incluidos porque permiten instalar únicamente las dependencias necesarias. El bot incluye FFmpeg para convertir al vuelo a Opus; la API conserva los archivos originales y la web decodifica en el navegador.

Los tres Dockerfiles separan preparación/compilación de ejecución y terminan con un usuario numérico no root: 10001 para la API y 1000 para Discord y la web. Las dependencias se copian antes del código para aprovechar caché. La imagen de producción Python no incluye las herramientas de pruebas; la etapa test es independiente.

requirements.lock y requirements-dev.lock fijan las dependencias Python con hashes para varias plataformas; package-lock.json fija las de Node. Las actualizaciones de versiones, hashes y digests se revisan conjuntamente.

### Estabilidad de las bases y privilegios

Se mantienen bases de Debian Bookworm con versiones de Python y Node elegidas explícitamente. Las imágenes oficiales de esos lenguajes ya incluyen el entorno de ejecución sobre Debian slim; no hace falta sustituirlas por Debian vacío e instalar los lenguajes manualmente.

Una etiqueta como `debian:bookworm-slim` también puede cambiar de contenido. La garantía de reconstruir con la misma base la aporta `@sha256:...`, que ya fija todas las bases externas de los tres Dockerfiles y la imagen PostgreSQL de Compose. No usar `latest` ni eliminar los digests. Las actualizaciones de bases deben ser cambios explícitos, revisados y validados en CI; fijarlas no sustituye la revisión de parches de seguridad. Véanse las [buenas prácticas de Docker](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions).

Los privilegios se revisan en dos niveles:

- **Procesos de la aplicación:** las etapas finales declaran `USER 10001:10001` en radio-service y `USER 1000:1000` en discord-service y web-service. No ejecutar estos servicios con `user: root`, `privileged: true` ni montarles el socket de Docker. El uso de root durante pasos de construcción, incluida la instalación de herramientas en la etapa de pruebas Python, no cambia el usuario final de ejecución. PostgreSQL usa su imagen oficial y no tiene un usuario forzado en Compose; su inicialización y los permisos del volumen deben comprobarse antes de cambiar ese comportamiento.
- **Motor Docker del host:** ejecutar el cliente sin sudo mediante el grupo `docker` sigue concediendo control del motor con privilegios equivalentes a root. El entorno Linux comprobado usa este acceso y no se presenta como rootless. Para ejecutar también el motor sin root, evaluar [Docker Rootless](https://docs.docker.com/engine/security/rootless/); migrar requiere comprobar redes y persistencia y no se realiza automáticamente desde el lanzador. Véase también la [advertencia oficial sobre el grupo docker](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user).

Referencias de implementación: [FastAPI en contenedores](https://fastapi.tiangolo.com/deployment/docker/), [transacciones Psycopg](https://www.psycopg.org/psycopg3/docs/basic/transactions.html), [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres) y [registro de comandos discord.js](https://discordjs.guide/legacy/app-creation/deploying-commands).
