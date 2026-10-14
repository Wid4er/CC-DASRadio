# Flujo de desarrollo

El Hito 1 prepara la definición y gestión del proyecto; no exige implementar todas las historias de producto.

## Ramas y revisión

- `main` conserva versiones revisadas del proyecto.
- Crear ramas breves desde main: `feature/discord-service`, `feature/radio-service`, `feature/database`, `docs/requirements`, `docs/nist` o `fix/<descripcion>`.
- Integrar mediante Pull Requests asociados a un Issue. Revisar documentación y comportamiento antes de unirlos.
- No se afirma que existan protecciones de rama, revisores o checks automáticos configurados: esos ajustes en GitHub siguen pendientes.

## Commits semánticos

Formato: `tipo: descripción breve`. Tipos: `feat`, `fix`, `docs`, `refactor`, `test` y `chore`.

```text
docs: specify radio use cases and REST contract
feat: add station playback persistence
fix: pause playback after last connection leaves
test: verify shared playback transitions
chore: configure project templates
```

Un commit describe una unidad coherente. El script local push.cmd permite elegir su mensaje y sube la rama actual; no sustituye la revisión mediante PR.

## Historias y trazabilidad

Crear historias como Issues reales con «Como [rol], quiero [acción], para [beneficio]», criterios observables, tareas técnicas y etiqueta `user-story`. Vincular requisitos RF y casos CU cuando correspondan.

Los casos de uso documentan interacciones; las historias planifican incrementos de desarrollo. Una historia registrada no equivale a funcionalidad implementada.

## Milestone y tablero

El milestone del Hito 1 agrupa entregables de definición y configuración. Las historias de implementación forman el backlog, sin dar su funcionalidad por terminada en este hito. No crear hitos futuros hasta disponer de sus enunciados.

El [GitHub Project](https://github.com/users/Wid4er/projects/1/views/2) tiene una vista agrupada por Milestone y estados Backlog, Ready, In Progress, In Review y Done. Las [historias y tareas](docs/backlog.md) están registradas como Issues. Las historias funcionales permanecen en Backlog y los entregables documentales en In Review hasta verificar su entrega.

## Validación de cambios

Para documentación, revisar enlaces relativos, ejemplos JSON y coherencia con requisitos, API y arquitectura. Para implementación, indicar pruebas pertinentes al cambio; no exigir pruebas de código a una edición exclusivamente documental.

No incluir tokens ni credenciales. Mantener separado el acceso a PostgreSQL: solo radio-service accede directamente. Skip, transcripción y almacenamiento de objetos quedan fuera del MVP acordado.
