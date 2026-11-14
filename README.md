# CC-DASRadio

Plataforma de radio musical automática para Discord. Una emisora selecciona aleatoriamente canciones de su catálogo y comparte la misma reproducción entre los servidores conectados.

El nombre acordado es **CC-DASRadio**. El Hito 1 de definición y arquitectura está cerrado. El **Hito 2: empaquetado, entorno local e integración continua** tiene un primer incremento con API, PostgreSQL, un cliente Discord y una web de escucha compartida sin credenciales externas. La [guía de desarrollo local](docs/desarrollo-local.md) explica cómo arrancar, configurar el bot y ejecutar las pruebas. El [plan del Hito 2](docs/hito-2.md) recoge el resto del trabajo; la [guía de reproducción compartida](docs/reproduccion-compartida.md) documenta el reloj central y los comandos de voz, distinguiendo implementación y prueba audible real.

La reproducción tolera cinco segundos de desfase sin rebobinar. El proveedor introduce cinco segundos de silencio entre canciones para preparar y volver a anclar los clientes a la siguiente pista; véase la [guía de reproducción](docs/reproduccion-compartida.md).

Consulta el [mapa de la estructura del proyecto](docs/estructura.md) para localizar los archivos, entender los módulos y ver cómo se comunican los servicios.

**La web es una adición opcional para facilitar la corrección.** Discord sigue siendo la interfaz principal prevista del proyecto. El [tutorial para crear el bot](docs/configurar-discord.md) está disponible aunque se elija no configurarlo.

Para probar la práctica sin crear una cuenta de desarrollador Discord, ejecutar `./scripts/start.sh` y abrir **http://127.0.0.1:8080**. El arranque genera `.env` con claves internas si falta e inicia **web-service, radio-service y PostgreSQL**. La [guía de evaluación web](docs/evaluacion-web.md) explica la escucha compartida entre pestañas, pausa y persistencia. Una instalación limpia incluye dos tonos WAV de prueba. La [guía de carga de música](docs/cargar-musica.md) permite añadir MP3 locales conservando el archivo comprimido.

**Si `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` y `DISCORD_GUILD_ID` están completos, `./scripts/start.sh` incluye automáticamente el bot.** Si faltan o contienen valores de ejemplo, arranca la web sin Discord. `--web-only` omite el bot, `--discord` exige su configuración y `--api-only` inicia solo API y base de datos. En Windows, [scripts/start.ps1](scripts/start.ps1) ofrece la misma detección y los modos `-WebOnly`, `-WithDiscord` y `-ApiOnly`. Al conectarse, el bot comprueba el registro global de `/radio`, disponible para todos los servidores donde se instala; no hay que configurar un ID distinto por servidor. La [guía local](docs/desarrollo-local.md) recoge todos los comandos.

## Problema y usuarios objetivo

Las comunidades de Discord que quieren escuchar música en grupo necesitan una programación continua sin gestionar manualmente una cola de canciones. CC-DASRadio propone una emisora compartida que mantiene su canción y posición entre conexiones.

Los usuarios objetivo son los participantes de comunidades de Discord y los administradores que habilitan la radio en sus canales de voz. El valor del sistema reside en la programación automática, la reproducción compartida y la recuperación de su estado.

## Alcance del MVP

- Una emisora con un catálogo de canciones almacenado en PostgreSQL.
- Selección aleatoria entre las canciones disponibles al finalizar la canción actual.
- Reproducción común en canales de voz de distintos servidores de Discord.
- Incorporación de nuevos servidores al punto actual de la emisora.
- Consulta del título y artista de la canción actual.
- Desconexión de un servidor sin detener la música para los demás.
- Pausa al desconectarse el último servidor y reanudación al conectarse el primero.
- Conservación de canción, posición y estado para recuperar la reproducción tras reinicios.

Quedan fuera del MVP la transcripción, la IA, YouTube, Spotify, el panel web de administración, las recomendaciones complejas, varias emisoras, jingles y anuncios. Evitar repeticiones recientes será una mejora posterior: la selección aleatoria inicial puede repetir canciones.

Diamond City Radio de Fallout es una referencia posible de programación; el catálogo definitivo está pendiente de elegir y no se incluye todavía contenido musical en el repositorio.

## Comandos y casos de uso

La [especificación de casos de uso](docs/casos-de-uso.md) define actores, precondiciones, disparadores, flujos principales, alternativas, postcondiciones y garantías ante fallos. Incluye requisitos funcionales y trazabilidad hacia historias de usuario.

| Caso | Objetivo |
|---|---|
| CU-01 | Iniciar o reanudar la emisora sin conexiones previas. |
| CU-02 | Incorporar otro servidor a la reproducción actual. |
| CU-03 | Detener escucha local y pausar solo al salir el último servidor. |
| CU-04 | Consultar título, artista y estado. |
| CU-05 | Continuar automáticamente la programación al finalizar una canción. |
| CU-06 | Recuperar el último punto guardado tras un reinicio. |
| CU-07 | Supervisar disponibilidad y errores. |

CU-05 es un escenario de soporte disparado por un evento interno; el usuario no ejecuta un comando adicional. Las historias de usuario se utilizarán para planificar el trabajo en GitHub y no sustituyen estos casos.

| Comando | Comportamiento previsto |
|---|---|
| `/radio start` | Conecta el bot al canal de voz del usuario. Si es la primera conexión activa, reanuda la emisora; si ya se reproduce, incorpora ese servidor al punto actual. |
| `/radio stop` | Desconecta el bot únicamente del servidor que ejecuta el comando. Si era la última conexión, pausa la emisora y guarda la posición. |
| `/radio now` | Consulta la canción actual y su estado. |

Cualquier usuario puede ejecutar `/radio start` y `/radio stop`, sin exigir un rol administrativo. Stop solo desconecta el bot del servidor solicitante. `/radio now` es una consulta del título y artista actuales y no modifica la emisión.

`/radio skip` queda fuera del MVP para preservar la reproducción común y evitar cambiar la canción para otros servidores. No se añade una reproducción desincronizada por servidor. Los comandos de selección y listado de varias emisoras se reservan para una ampliación.

Flujo de ejemplo:

1. El servidor A conecta el bot: se carga la canción y se reanuda desde la posición guardada.
2. El servidor B conecta el bot: escucha la misma reproducción desde su punto actual.
3. El servidor A desconecta el bot: la música continúa en B.
4. El servidor B desconecta el bot: se pausa y guarda la posición.
5. Una nueva conexión reanuda desde ese punto.

La pausa depende de las conexiones de voz activas del bot, no del número de personas en los canales. La reproducción compartida no garantiza sincronización exacta entre dispositivos: pueden existir diferencias de recepción por la red.

## Arquitectura inicial

La [versión entregada del Hito 1](https://github.com/Wid4er/CC-DASRadio/tree/55c2c8e54b07857b4f50999aa83585ea186d1c3d) conserva el diseño de referencia. Los apartados siguientes describen su evolución implementada en el Hito 2; las decisiones se explican en la [guía de reproducción compartida](docs/reproduccion-compartida.md).

### discord-service

Gestiona `/radio start`, `/radio stop` y `/radio now`, las conexiones de voz y un reproductor común con varias conexiones suscritas. Recibe audio y posición actual desde `radio-service` y convierte el audio a Opus para Discord. El proveedor mantiene el reloj y decide avance, pausa y reanudación.

El controlador único de `radio-service` realiza el avance al finalizar una canción. Los servidores conectados no seleccionan canciones por separado. Este servicio no accede directamente a PostgreSQL.

### web-service

Cliente web de evaluación añadido en el Hito 2. Sirve la página y obtiene audio y posición actual a través de radio-service. Conserva la credencial interna en el servidor y no accede a PostgreSQL. La API cuenta las conexiones web y Discord: la última salida pausa y guarda; una nueva conexión reanuda desde ese punto.

Esta ampliación permite evaluar la práctica sin Discord. Web y bot consumen una misma emisora del proveedor; no seleccionan canciones ni avanzan el reloj por separado.

### radio-service

Gestiona catálogo, selección aleatoria, reloj actual, conexiones y estado recuperable de la emisora. Es propietario de PostgreSQL y entrega metadatos, posición actual y bytes del audio mediante su API. No contiene lógica de conexión específica de Discord. El Hito 2 centraliza aquí el reloj que la primera web de evaluación mantenía temporalmente.

### PostgreSQL

Almacena metadatos, archivos de audio binarios y estado recuperable. No se utilizarán Object Storage, MinIO ni Redis en el MVP. El reproductor mantiene su estado operativo en memoria, mientras que los puntos de recuperación se guardan en PostgreSQL mediante `radio-service`.

Los servicios se diseñan para desplegarse independientemente. La separación permite cambiar el cliente de Discord sin modificar el catálogo o la selección musical. El MVP prevé un único controlador de reproducción por emisora; replicar ese controlador requiere coordinación adicional y no basta con lanzar copias independientes.

### Diagrama de componentes y flujos

```mermaid
flowchart LR
    USUARIO["Usuarios de Discord"]
    DISCORD["Discord · canales de voz de varios servidores"]

    subgraph DS["discord-service · TypeScript"]
        CONTROL["Comandos y conexiones"]
        PLAYER["Reproductor común de la emisora"]
        CONTROL --> PLAYER
    end

    BROWSER["Navegadores de evaluación"]
    WEB["web-service · página y proxy"]
    BROWSER -->|"HTTP y audio"| WEB
    WEB -->|"REST y audio"| RADIO
    RADIO["radio-service · API y lógica de negocio"]
    DB[("PostgreSQL · catálogo, audio y estado recuperable")]

    USUARIO -->|"Comandos /radio"| DISCORD
    DISCORD -->|"Interacciones · Gateway"| CONTROL
    CONTROL -->|"HTTP REST · consultas"| RADIO
    PLAYER -->|"HTTP REST · sesión y posición actual"| RADIO
    RADIO -->|"HTTP · bytes de audio"| PLAYER
    RADIO <-->|"Protocolo PostgreSQL"| DB
    PLAYER -->|"Audio Opus · UDP/RTP + DAVE"| DISCORD
```

El audio procede de PostgreSQL a través de `radio-service`. No se devuelven URLs de almacenamiento externo. Las conexiones de voz también requieren señalización WebSocket; el diagrama destaca el flujo de comandos, control y audio.

## Selección musical

Al finalizar una canción, el controlador interno de `radio-service` realiza la selección. El servicio obtiene las canciones disponibles de la emisora, elige una aleatoriamente, actualiza la canción actual y devuelve sus metadatos. Se propone elegir con igual probabilidad. Un catálogo vacío impide el avance y devuelve un error explícito; un archivo que falle no se confirma como reproducido y no provoca un bucle ilimitado de selecciones.

En el Hito 2, playing expresa que avanza el reloj del proveedor; no acredita que cada cliente haya emitido audio. La comprobación del audio se hace también en los clientes y en las pruebas de reproducción. El historial detallado y la exclusión de canciones recientes no son requisitos del MVP.

## Persistencia y audio

Modelo definido en el Hito 1 e implementado mediante migraciones en el Hito 2:

| Entidad | Campos principales |
|---|---|
| `Station` | `id`, `name`, `description`, `enabled` |
| `Track` | `id`, `station_id`, `title`, `artist`, `duration_ms`, `enabled` |
| `TrackAudio` | `track_id`, `content_type`, `data` de tipo `bytea` |
| `StationPlayback` | `station_id`, `current_track_id`, `position_ms`, `status`, `updated_at` |

Separar audio y metadatos evita recuperar los binarios en consultas de catálogo. La distribución incluye tonos WAV generados; el importador acepta MP3 de hasta 32 MiB y conserva sus bytes comprimidos. El bot convierte al vuelo a Opus para Discord.

Al pausar se guarda la posición; durante la reproducción se guardan puntos de recuperación cada cinco segundos. Tras un reinicio se reconstruirá el reproductor desde el último punto guardado, aplicando búsqueda temporal o decodificación desde esa posición. La recuperación puede repetir un pequeño tramo si el proceso termina entre dos puntos de guardado.

Las conexiones de voz deben reconstruirse desde Discord; el estado guardado no demuestra que sigan activas tras un reinicio. Las desconexiones detectadas retiran la conexión del recuento y aplican la regla de última conexión. Si falla el guardado, el punto queda en memoria y se informa; tras una caída solo se recupera el último guardado confirmado. La búsqueda temporal está cubierta por las pruebas automatizadas y la evaluación web; sigue pendiente acreditar la escucha audible manual en Discord.

## API REST

La [especificación REST](docs/api-rest.md) define entradas, respuestas, validaciones y errores. El contrato del Hito 1 está implementado y se amplía con [estado en directo y conexiones](docs/reproduccion-compartida.md).

| Método y ruta | Entrada | Salida correcta |
|---|---|---|
| `GET /health` | Sin cuerpo. | `200` con status y disponibilidad de PostgreSQL; `503` si no está preparado. |
| `GET /api/v1/stations` | Sin cuerpo. | `200` con array de emisoras habilitadas. |
| `GET /api/v1/stations/{id}/playback` | ID de emisora. | `200` con canción, posición registrada, estado y metadatos. |
| `POST /api/v1/stations/{id}/advance` | JSON con reason initial o track_finished. | `200` con selección aleatoria, posición 0 y estado loading. |
| `PATCH /api/v1/stations/{id}/playback` | JSON con canción, posición y estado. | `200` con estado actualizado y fecha de guardado. |
| `GET /api/v1/tracks/{id}/audio` | ID de canción. | `200` con bytes y tipo de contenido del archivo. |

Control utiliza JSON; el audio es binario, sin URLs de almacenamiento externo. Las operaciones, salvo health, utilizan una credencial interna; los usuarios siguen accediendo mediante los comandos de Discord.

Payload de avance:

```json
{
  "reason": "track_finished"
}
```

Payload de progreso o pausa:

```json
{
  "current_track_id": 42,
  "position_ms": 65000,
  "status": "paused"
}
```

Respuesta de consulta orientativa:

```json
{
  "station_id": 1,
  "current_track_id": 42,
  "position_ms": 65000,
  "status": "paused",
  "track": {
    "id": 42,
    "title": "Canción de ejemplo",
    "artist": "Artista de ejemplo",
    "duration_ms": 192000,
    "content_type": "audio/ogg"
  }
}
```

Estados definidos: idle, loading, playing, paused y error. Loading distingue selección e inicio efectivo; la posición es el último punto comunicado y puede tener retraso.

Errores principales: `401` por credencial interna inválida, `404` por recurso inexistente, `409` por catálogo vacío o conflicto de estado, `422` por entrada inválida y `500/503` por fallo interno o dependencia no disponible. Salvo health, siguen el formato:

```json
{
  "error": {
    "code": "empty_catalog",
    "message": "La emisora no tiene canciones disponibles."
  }
}
```

Solo el controlador común realiza el avance. POST advance no se reintenta automáticamente si se pierde la respuesta; se consulta el estado antes de continuar. La deduplicación completa y la coordinación de réplicas se reservarán para implementación. No se añade WebSocket entre microservicios.

## Stack inicial

| Componente | Propuesta | Motivo |
|---|---|---|
| `discord-service` | Node.js, TypeScript, `discord.js` y `@discordjs/voice` | Un reproductor puede distribuir audio a varias conexiones de voz y pausar o reanudar. |
| `radio-service` | Python y FastAPI | API de catálogo, programación y entrega de audio separada del cliente. |
| `web-service` | Node.js y Web Audio en el navegador | Cliente de evaluación del proveedor compartido, sin cuenta Discord. |
| Persistencia | PostgreSQL | Metadatos, binarios y estado recuperable en una misma base de datos. |

El primer incremento fija Python 3.13, Node 24 y las dependencias de API y cliente mediante locks e imágenes por digest; véase la [guía local](docs/desarrollo-local.md). API, audio binario y estado persistido se han probado con PostgreSQL. Se incorporan @discordjs/voice 0.19.2, DAVE y FFmpeg para voz y búsqueda temporal; la validación automatizada y la escucha real se distinguen en la [guía de reproducción](docs/reproduccion-compartida.md).

Referencias de diseño:

- [AudioPlayer y conexiones suscritas](https://discordjs.dev/docs/packages/voice/main/AudioPlayer:Class).
- [Conexión de voz y suscripción al reproductor](https://discordjs.dev/docs/packages/voice/main/VoiceConnection:Class).
- [Datos binarios bytea en PostgreSQL](https://www.postgresql.org/docs/current/datatype-binary.html).
- [FastAPI](https://fastapi.tiangolo.com/).
- [Semántica HTTP](https://httpwg.org/specs/rfc9110.html#safe.methods).

## Entorno de referencia para el Hito 1

El entorno previsto es un servidor doméstico del autor, donde los dos microservicios y PostgreSQL se desplegarán mediante Docker y Docker Compose. No se ha contratado ni seleccionado un proveedor comercial como Azure. En este hito se documenta el entorno; su implementación se reserva para hitos posteriores.

Este entorno permite probar servicios separados, comunicación por red y almacenamiento persistente. Docker por sí solo no acredita todas las características NIST de una nube: el autoservicio de recursos, la medición y los mecanismos de elasticidad deben explicarse como capacidades previstas o limitaciones. El servidor tiene recursos físicos limitados; no se promete elasticidad automática ni sincronización perfecta por añadir contenedores.

Para el mapeo NIST se distinguirán los usuarios consumidores del servicio y el autor como responsable de proveerlo sobre su infraestructura. El operador de red corresponde a la conectividad utilizada; broker y auditor deben analizarse sin inventar organizaciones que no participan. Los papeles no presentes se documentarán explícitamente y, si se propone un escenario futuro, se identificará como hipotético.

## Justificación NIST SP 800-145

Se analiza cómo las características de la nube motivan el proyecto, distinguiendo el diseño del entorno doméstico de sus límites. Docker no acredita por sí solo una nube completa. [Estándar NIST SP 800-145](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-145.pdf).

| Característica | Aplicación y límite |
|---|---|
| Autoservicio bajo demanda | Start incorpora servidores sin intervención del operador y usa conexiones bajo demanda. El aprovisionamiento automático de infraestructura todavía no está implementado. |
| Acceso amplio a la red | Discord ofrece la interfaz de usuario; API, audio y persistencia se comunican por red. La disponibilidad depende del servidor y su conectividad. |
| Recursos compartidos | Varias comunidades comparten catálogo, base de datos y reproductor; cada conexión añade tráfico y procesamiento. |
| Elasticidad rápida | Los servicios se dimensionan por separado; se prevé estudiar réplicas de API/audio. El controlador compartido necesita coordinación y el servidor doméstico tiene capacidad limitada. |
| Servicio medido | Se prevén conexiones, minutos, peticiones, errores, CPU, RAM, disco y bytes enviados. No se presentan métricas ni facturación como ya implementadas. |

La aplicación tiene orientación SaaS para el consumidor. El despliegue doméstico se considera una simulación; no se declara nube privada NIST plenamente implementada. La [justificación detallada](docs/nist.md) recoge mecanismos previstos y límites.

## Actores NIST SP 500-292

El mapeo es una interpretación del escenario de referencia según el [NIST SP 500-292](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-292.pdf).

| Actor | Asignación y relación |
|---|---|
| Consumidor | Comunidades y usuarios que utilizan la radio; no administran sus servicios. |
| Proveedor | Autor/operador responsable de ofrecer el servicio sobre su servidor doméstico y mantenerlo. |
| Intermediario / broker | No hay uno independiente. Integrar Discord no convierte automáticamente al proyecto en broker cloud. |
| Auditor | No existe auditor independiente contratado; las pruebas propias y la revisión académica no se presentan como auditoría cloud. |
| Operador de red / carrier | Proveedores de conectividad del servidor y de los consumidores, sin inventar empresas concretas. |

Discord es una plataforma externa. Azure y otros proveedores son alternativas futuras, no actores contratados. Los roles ausentes se identifican expresamente; sus responsabilidades y relaciones económicas se detallan en [el análisis NIST](docs/nist.md).

## Impacto económico

El MVP es un prototipo académico sin cobro. El operador asume electricidad, almacenamiento, conectividad y mantenimiento aunque utilice hardware propio. Los consumidores emplean su conexión para acceder mediante Discord.

Los costes dependen del catálogo, número de conexiones, horas de emisión y recursos medidos. Compartir reproductor evita preparar una programación por servidor, pero requiere enviar audio a cada conexión. Pausar sin conexiones reduce emisión y transferencia; no elimina el consumo base del servidor.

Energía estimada = potencia media medida × horas encendido. Transferencia útil aproximada = bitrate × tiempo × conexiones, con conversión de bits a bytes y overhead adicional. No se atribuyen importes sin medidas y tarifas. El [análisis económico](docs/nist.md) especifica métricas y responsabilidades por actor.

## Gestión del desarrollo

La [guía de contribución](CONTRIBUTING.md) define main estable, ramas feature/docs/fix e integración mediante Pull Requests. Se utilizan commits semánticos de tipo feat, fix, docs, refactor, test y chore.

Están preparadas la [plantilla de historia de usuario](.github/ISSUE_TEMPLATE/user_story.md) y la [plantilla de Pull Request](.github/PULL_REQUEST_TEMPLATE.md). Las historias deben incluir criterios observables, tareas técnicas, etiqueta user-story y trazabilidad a los casos de uso.

El [backlog](docs/backlog.md) contiene ocho historias como Issues reales, con la etiqueta user-story, criterios de aceptación y tareas técnicas. Las [tres tareas del Hito 1](https://github.com/Wid4er/CC-DASRadio/milestone/1) se agrupan en su milestone de definición y gestión. Las historias de funcionalidad permanecen abiertas hasta verificar sus criterios completos, aunque el Hito 2 ya implementa parte de ellas.

El [Project CC-DASRadio](https://github.com/users/Wid4er/projects/1/views/2) está activo con diecinueve Issues, una vista agrupada por Milestone y los estados Backlog, Ready, In Progress, In Review y Done. Conserva ocho historias funcionales abiertas y tres tareas cerradas del Hito 1. Las ocho tareas técnicas del [Hito 2](https://github.com/Wid4er/CC-DASRadio/milestone/2) enlazan esas historias sin duplicarlas.

La [PR #12](https://github.com/Wid4er/CC-DASRadio/pull/12) integró en main la documentación y las plantillas del Hito 1. Las historias funcionales no se cierran por entregar documentación.

## Entrega del Hito 1 y decisiones posteriores

La entrega incluye definición y alcance, casos de uso formales, arquitectura, persistencia, API REST, NIST, análisis económico y configuración de la gestión en GitHub. La revisión documental verifica ejemplos JSON, enlaces locales, trazabilidad RF/CU y coherencia con el enunciado.

El Hito 2 incorpora la implementación del proveedor común, voz Opus, importación MP3, web y recuperación persistente. Siguen pendientes el catálogo musical definitivo, la comprobación audible manual en Discord y las métricas completas. El [workflow y las imágenes GHCR](docs/ghcr.md) se vinculan a cada commit publicado. El primer incremento y sus instrucciones están en la [guía local](docs/desarrollo-local.md). Estas decisiones no implicaban entregar una radio funcional durante el Hito 1.
