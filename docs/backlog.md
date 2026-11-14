# Backlog de CC-DASRadio

Las historias del MVP están registradas como Issues reales, con criterios de aceptación, checklist técnico y etiqueta `user-story`. Siguen pendientes de implementación.

## Historias de producto

| Historia | Issue |
|---|---|
| US-01: Iniciar radio | [#1](https://github.com/Wid4er/CC-DASRadio/issues/1) |
| US-02: Detener escucha local | [#2](https://github.com/Wid4er/CC-DASRadio/issues/2) |
| US-03: Seleccionar automáticamente la siguiente canción | [#3](https://github.com/Wid4er/CC-DASRadio/issues/3) |
| US-04: Pausar y reanudar sin conexiones | [#4](https://github.com/Wid4er/CC-DASRadio/issues/4) |
| US-05: Consultar canción actual | [#5](https://github.com/Wid4er/CC-DASRadio/issues/5) |
| US-08: Compartir reproducción entre servidores | [#6](https://github.com/Wid4er/CC-DASRadio/issues/6) |
| US-09: Supervisar disponibilidad y consumo | [#7](https://github.com/Wid4er/CC-DASRadio/issues/7) |
| US-10: Recuperar reproducción tras reinicio | [#8](https://github.com/Wid4er/CC-DASRadio/issues/8) |

Los IDs US-06 y US-07 se reservan para funciones excluidas o futuras: salto global y selección de varias emisoras. No se crean como requisitos del MVP.

## Entregables del Hito 1

[Milestone Hito 1 — Definición del proyecto](https://github.com/Wid4er/CC-DASRadio/milestone/1).

| Tarea | Issue |
|---|---|
| H1-01: Publicar definición, requisitos y arquitectura | [#9](https://github.com/Wid4er/CC-DASRadio/issues/9) |
| H1-02: Preparar flujo de trabajo y plantillas | [#10](https://github.com/Wid4er/CC-DASRadio/issues/10) |
| H1-03: Configurar backlog, milestone y tablero | [#11](https://github.com/Wid4er/CC-DASRadio/issues/11) |

Estas tareas se asocian al milestone del Hito 1. Las historias de funcionalidad permanecen en el backlog sin inventar milestones futuros ni exigir su implementación en este hito.

## Entregables del Hito 2

[Milestone Hito 2 — Empaquetado, entorno local y CI](https://github.com/Wid4er/CC-DASRadio/milestone/2). El [plan de ejecución](hito-2.md) detalla entregables, dependencias y primer objetivo verificable.

| Tarea técnica | Issue |
|---|---|
| H2-00: Planificación y trazabilidad | [#13](https://github.com/Wid4er/CC-DASRadio/issues/13) |
| H2-01: API y persistencia PostgreSQL | [#14](https://github.com/Wid4er/CC-DASRadio/issues/14) |
| H2-02: Cliente Discord e integración | [#15](https://github.com/Wid4er/CC-DASRadio/issues/15) |
| H2-03: Dockerfiles de producción | [#16](https://github.com/Wid4er/CC-DASRadio/issues/16) |
| H2-04: Compose, redes y volumen | [#17](https://github.com/Wid4er/CC-DASRadio/issues/17) |
| H2-05: Linters y pruebas | [#18](https://github.com/Wid4er/CC-DASRadio/issues/18) |
| H2-06: CI y publicación en GHCR | [#19](https://github.com/Wid4er/CC-DASRadio/issues/19) |
| H2-07: Documentación y verificación de entrega | [#20](https://github.com/Wid4er/CC-DASRadio/issues/20) |

Las tareas tienen criterios de aceptación, checklist técnico y etiqueta hito-2. Enlazan las historias originales cuando corresponde; completarlas no cierra automáticamente esas historias. H2-00 se revisa mediante PR de planificación y H2-01 es la primera tarea de implementación preparada.

## Tablero

[Project CC-DASRadio — Hito 1 y backlog](https://github.com/users/Wid4er/projects/1/views/2).

El tablero tiene diecinueve Issues y una tabla agrupada por Milestone, con Status. Las ocho historias originales siguen abiertas en Backlog; las tres tareas del Hito 1 están cerradas en Done. Las ocho tareas técnicas del Hito 2 se agrupan en su propio milestone. Las historias originales todavía no tienen milestone asignado: su cierre se evaluará según sus criterios completos.

Estados disponibles: Backlog, Ready, In Progress, In Review y Done. La [PR #12](https://github.com/Wid4er/CC-DASRadio/pull/12) entrega documentación y plantillas y vincula el cierre de las tareas H1 a su integración. No se cierran historias de funcionalidad por documentarlas.

## Uso individual

1. Elegir una Issue y marcarla en curso.
2. Trabajar en una rama breve con commits semánticos.
3. Abrir una PR vinculada a la Issue.
4. Verificar criterios y cerrar solo el trabajo terminado.

Registrar una historia o definir sus casos de uso no equivale a implementarla.
