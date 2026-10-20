# Hito 2 — Plan de ejecución

El enunciado «Empaquetado Cloud Native, Entorno Local e Integración Continua (CI)» exige imágenes de producción para los microservicios, un entorno Compose de al menos tres contenedores y CI que valide y publique imágenes en GHCR.

Este documento organiza el trabajo del hito. El Hito 1 está cerrado. El primer incremento implementa la API, PostgreSQL y el cliente de consulta /radio now; el [estado y la ejecución local](desarrollo-local.md) distinguen lo disponible de la reproducción de voz pendiente. La funcionalidad descrita aquí es la adaptación propuesta para disponer de componentes reales que empaquetar; no se atribuye al enunciado una exigencia literal de terminar todas las historias del MVP.

Seguimiento: [milestone Hito 2](https://github.com/Wid4er/CC-DASRadio/milestone/2), [Project agrupado por Milestone](https://github.com/users/Wid4er/projects/1/views/2) y [backlog](backlog.md).

## Entregables y criterios de cierre

| Enunciado | Entrega prevista | Evidencia necesaria |
|---|---|---|
| Dockerfile por microservicio | Dockerfiles para radio-service y discord-service. | Construcción multietapa, bases minimalistas justificadas, dependencias reproducibles, caché, usuario no root y puertos necesarios. |
| Entorno local funcional | compose.yaml con radio-service, discord-service y PostgreSQL. | Arranque con un comando tras completar la configuración local y comunicación entre los tres contenedores. |
| Redes aisladas | Redes internas definidas en Compose y acceso saliente del bot a Discord. | Verificación de conectividad y exposición limitada a los accesos necesarios. |
| Persistencia | Volumen gestionado para PostgreSQL. | Catálogo, audio y estado conservados al recrear contenedores sin eliminar el volumen. |
| Configuración | .env.example documentado y .env local excluido de Git. | Arranque reproducible sin credenciales reales versionadas. |
| Calidad y pruebas | Linters de ambos lenguajes y Dockerfiles; pruebas unitarias y de integración. | Ejecución reproducible y detección de fallos en CI. |
| Integración continua | .github/workflows/ci.yml para push a main y pull_request dirigida a main. | Ejecuciones reales de las comprobaciones. |
| Publicación | Imágenes de los dos microservicios en GHCR, etiquetadas con el hash del commit. | Paquetes publicados desde main después de superar los controles; las PR validan sin publicar. |

PostgreSQL tendrá su propio contenedor usando su imagen oficial. El enunciado pide un Dockerfile por microservicio y tres contenedores: no exige expresamente un tercer Dockerfile para la base de datos. Versiones y bases concretas se fijarán al implementar.

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

El objetivo parcial es ejecutar docker compose up --build y comprobar la API con persistencia real. La entrega final del hito requiere también el tercer contenedor, discord-service, y su integración funcional.

## Integración con Discord y pruebas

El cliente se construye de forma incremental: primero now y comunicación real con la API, después start, stop y reproducción. El objetivo final conserva las decisiones del Hito 1: un reproductor compartido, incorporación al punto actual, pausa al salir la última conexión y recuperación desde el punto guardado. Solo radio-service accede a PostgreSQL.

Las pruebas unitarias ejercitarán la selección, errores y transiciones del controlador. Las de integración utilizarán PostgreSQL y HTTP reales con Discord simulado, sin depender de credenciales externas para ejecutarse en CI. La reproducción efectiva y la escucha en varios servidores tendrán comprobación manual con un bot de pruebas.

## Decisiones pendientes

- Entorno de ejecución inicial: este Windows o el servidor doméstico; sistema y disponibilidad real del motor Docker.
- Aplicación/bot de Discord y servidores de prueba disponibles.
- Audios de prueba y método de carga; catálogo definitivo todavía sin elegir.
- Versiones del stack, formato y límites de audio, migraciones, intervalos de guardado, timeouts y tratamiento de peticiones tardías.

Estas decisiones se resolverán antes de las tareas que dependan de ellas. No se añaden fechas de entrega, proveedores comerciales, varias emisoras ni nuevas funciones fuera del MVP.

## Gestión y revisión

Rama de planificación: docs/hito-2. Integración mediante PR hacia main con commits semánticos. Las siguientes ramas serán breves y asociadas a tareas concretas.

El Project existente se mantiene agrupado por Milestone. Las historias originales siguen abiertas en Backlog; las tareas técnicas se asignan al Hito 2. La tarea de planificación pasa a In Review al abrir su PR y solo se cierra tras revisión e integración.

El hito no se cierra por registrar tareas ni por crear archivos de configuración: hacen falta las comprobaciones y evidencias de los entregables anteriores.
