# Hito 2 — Plan de ejecución

El enunciado «Empaquetado Cloud Native, Entorno Local e Integración Continua (CI)» exige imágenes de producción para los microservicios, un entorno Compose de al menos tres contenedores y CI que valide y publique imágenes en GHCR.

Este documento organiza el trabajo del hito. El Hito 1 está cerrado. El incremento actual implementa la API, PostgreSQL, el cliente web y los comandos de consulta y voz de Discord; el [estado y la ejecución local](desarrollo-local.md) distingue la implementación probada automáticamente de la comprobación audible manual pendiente. La funcionalidad descrita aquí es la adaptación propuesta para disponer de componentes reales que empaquetar; no se atribuye al enunciado una exigencia literal de terminar todas las historias del MVP.

Ampliación solicitada el 2026-11-04: [cliente web de evaluación](evaluacion-web.md) con escucha compartida entre navegadores. La evaluación predeterminada ya no requiere crear un bot Discord. Se mantienen API y PostgreSQL. La voz está implementada; sigue pendiente acreditar la escucha manual en canales Discord.

Seguimiento: [milestone Hito 2](https://github.com/Wid4er/CC-DASRadio/milestone/2), [Project agrupado por Milestone](https://github.com/users/Wid4er/projects/1/views/2) y [backlog](backlog.md).

## Entregables y criterios de cierre

| Enunciado | Entrega prevista | Evidencia necesaria |
|---|---|---|
| Dockerfile por microservicio | Dockerfiles para radio-service, discord-service y el cliente web de evaluación. | Construcción multietapa, bases minimalistas justificadas, dependencias reproducibles, caché, usuario no root y puertos necesarios. |
| Entorno local funcional | compose.yaml con web-service, radio-service y PostgreSQL; discord-service opcional mediante perfil. | Arranque con un comando tras completar la configuración local y comunicación entre los tres contenedores. |
| Redes aisladas | Redes internas definidas en Compose y acceso saliente del bot a Discord. | Verificación de conectividad y exposición limitada a los accesos necesarios. |
| Persistencia | Volumen gestionado para PostgreSQL. | Catálogo, audio y estado conservados al recrear contenedores sin eliminar el volumen. |
| Configuración | .env.example documentado y .env local excluido de Git. | Arranque reproducible sin credenciales reales versionadas. |
| Calidad y pruebas | Linters de ambos lenguajes y Dockerfiles; pruebas unitarias y de integración. | Ejecución reproducible y detección de fallos en CI. |
| Integración continua | .github/workflows/ci.yml para push a main y pull_request dirigida a main. | Ejecuciones reales de las comprobaciones. |
| Publicación | Imágenes de los tres microservicios en GHCR, etiquetadas con el hash del commit. | Paquetes publicados desde main después de superar los controles; las PR validan sin publicar. |

PostgreSQL tendrá su propio contenedor usando su imagen oficial. El enunciado pide un Dockerfile por microservicio y tres contenedores: no exige expresamente un tercer Dockerfile para la base de datos. Las versiones y bases concretas están fijadas por digest en los Dockerfiles y documentadas en la guía local.

## Tareas y dependencias

Las tareas técnicas enlazan las historias originales sin duplicarlas. Una tarea terminada no cierra automáticamente una historia: hay que verificar todos los criterios de la historia.

| Tarea | Issue | Depende de |
|---|---|---|
| H2-00: Preparar planificación y trazabilidad | [#13](https://github.com/Wid4er/CC-DASRadio/issues/13) | Sin dependencias. |
| H2-01: API y persistencia PostgreSQL | [#14](https://github.com/Wid4er/CC-DASRadio/issues/14) | H2-00. |
| H2-02: Cliente Discord e integración | [#15](https://github.com/Wid4er/CC-DASRadio/issues/15) | H2-01. |
| H2-03: Dockerfiles de producción | [#16](https://github.com/Wid4er/CC-DASRadio/issues/16) | H2-01 y H2-02. |
| H2-04: Compose, redes y volumen | [#17](https://github.com/Wid4er/CC-DASRadio/issues/17) | H2-01, H2-02 y H2-03 para su cierre completo. |
| H2-05: Linters y pruebas | [#18](https://github.com/Wid4er/CC-DASRadio/issues/18) | H2-01 y H2-02 para completar cobertura. |
| H2-06: CI y GHCR | [#19](https://github.com/Wid4er/CC-DASRadio/issues/19) | H2-03, H2-04 y H2-05 para publicar la entrega completa. |
| H2-07: Documentación y verificación final | [#20](https://github.com/Wid4er/CC-DASRadio/issues/20) | Entregables anteriores. |

Las dependencias indican cuándo puede cerrarse cada tarea. Dockerfiles, Compose, pruebas y CI se incorporarán progresivamente desde los primeros incrementos; no hay que esperar a terminar toda la funcionalidad para empezarlos.

## Primera entrega funcional

Después de revisar e integrar esta planificación, comenzar H2-01 en una rama breve feature/radio-service:

1. Fijar la estructura y dependencias de radio-service y su configuración por entorno.
2. Crear conexión, migraciones y un pequeño catálogo reproducible en PostgreSQL, manteniendo audio binario separado de metadatos.
3. Implementar health y consultas de catálogo y reproducción; continuar con selección, audio y guardado conforme al contrato REST.
4. Añadir pruebas pertinentes y una primera ejecución parcial de Compose con API y PostgreSQL.
5. Comprobar que el catálogo y el punto de reproducción guardado sobreviven a la recreación de contenedores conservando el volumen.

El objetivo parcial es ejecutar docker compose up --build y comprobar la API con persistencia real. La entrega final exige al menos tres contenedores funcionales. Desde la ampliación web, la evaluación predeterminada usa web-service, radio-service y PostgreSQL. Discord añade opcionalmente /radio start, /radio stop y /radio now, consumiendo el mismo proveedor.

## Integración con Discord y pruebas

El cliente se construye de forma incremental: primero now y comunicación real con la API, después start, stop y reproducción. El objetivo final conserva las decisiones del Hito 1: un reproductor compartido, incorporación al punto actual, pausa al salir la última conexión y recuperación desde el punto guardado. Solo radio-service accede a PostgreSQL.

Las pruebas unitarias ejercitarán la selección, errores y transiciones del controlador. Las de integración utilizarán PostgreSQL y HTTP reales con Discord simulado, sin depender de credenciales externas para ejecutarse en CI. La reproducción efectiva y la escucha en varios servidores tendrán comprobación manual con un bot de pruebas.

## Decisiones pendientes

- Entorno local comprobado: CachyOS/Linux con Docker y Compose; se conserva el lanzador Windows.
- Bot Discord configurado y /radio now probado el 2026-11-04; no se exige al docente gracias al cliente web.
- Catálogo de distribución: dos tonos WAV de un segundo generados localmente; [importación MP3](cargar-musica.md) sin recodificar y con límite de 32 MiB. El catálogo musical definitivo sigue sin elegir.
- Stack, migraciones, Opus para voz, puntos de recuperación cada cinco segundos, concesiones de 45 segundos y silencio común de cinco segundos documentados en la [guía de reproducción](reproduccion-compartida.md).
- Pendientes: comprobación audible manual de Discord y validación de los paquetes publicados por el workflow en [#19](https://github.com/Wid4er/CC-DASRadio/issues/19).

Estas decisiones se resolverán antes de las tareas que dependan de ellas. No se añaden fechas de entrega, proveedores comerciales, varias emisoras ni nuevas funciones fuera del MVP.

## Incremento de voz del 11 de noviembre de 2026

Se incorporan /radio start y /radio stop, un reproductor común para conexiones de voz, FFmpeg/Opus y DAVE. El reloj se centraliza en radio-service para que web y Discord consuman canción, posición actual y audio del mismo proveedor. Se mantienen los documentos del Hito 1 y se explica esta evolución en la [guía de reproducción compartida](reproduccion-compartida.md).

Las pruebas automatizadas no sustituyen la prueba de escucha en un canal ni acreditan escucha manual en varios servidores. El workflow configura validación en PR y publicación de tres imágenes en GHCR desde main tras superar los controles. La [guía GHCR](ghcr.md) explica etiquetas, permisos y cómo comprobar la ejecución real en #19.

## Gestión y revisión

Rama de planificación: docs/hito-2. Integración mediante PR hacia main con commits semánticos. Las siguientes ramas serán breves y asociadas a tareas concretas.

El Project existente se mantiene agrupado por Milestone. Las historias originales siguen abiertas en Backlog; las tareas técnicas se asignan al Hito 2. La tarea de planificación pasa a In Review al abrir su PR y solo se cierra tras revisión e integración.

El hito no se cierra por registrar tareas ni por crear archivos de configuración: hacen falta las comprobaciones y evidencias de los entregables anteriores.
