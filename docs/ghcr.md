# Imágenes de la entrega en GHCR

El workflow [CI](../.github/workflows/ci.yml) ejecuta linters, pruebas unitarias y de integración, construcción de imágenes y comprobaciones cliente-API. Una PR dirigida a main —o a la rama de planificación— valida sin publicar paquetes ni utilizar credenciales reales de Discord.

Después de un push a `main`, el job `publish` depende de `validate` y publica las tres imágenes de aplicación con la etiqueta `sha-<hash completo del commit>`:

| Servicio | Imagen |
|---|---|
| API | `ghcr.io/wid4er/cc-dasradio/radio-service:sha-<commit>` |
| Bot Discord | `ghcr.io/wid4er/cc-dasradio/discord-service:sha-<commit>` |
| Web de evaluación | `ghcr.io/wid4er/cc-dasradio/web-service:sha-<commit>` |

Cada imagen lleva las etiquetas OCI de repositorio de origen y revisión. El resumen de cada job registra el nombre, el commit y el digest resultante. No se utiliza una etiqueta mutable `latest` para identificar la entrega.

## Permisos y configuración

Solo el job de publicación recibe `packages: write`, además de `contents: read`. La autenticación usa el `GITHUB_TOKEN` temporal del runner mediante la entrada estándar de Docker. No se configura un token personal ni se usa el token del bot para publicar imágenes. La sesión del registro se cierra al terminar.

GitHub crea inicialmente los paquetes como privados. El propietario debe comprobar su visibilidad y acceso en los ajustes de cada paquete; un paquete público permite descarga anónima. La instalación desde el código fuente sigue construyendo localmente con `./scripts/start.sh`, sin necesitar acceso a paquetes privados.

## Evidencia y trazabilidad

Consultar las [ejecuciones de CI](https://github.com/Wid4er/CC-DASRadio/actions), abrir la correspondiente al commit integrado y comprobar `validate` y los tres jobs `publish`. La [tarea #19](https://github.com/Wid4er/CC-DASRadio/issues/19) registra los enlaces de la publicación real y sus etiquetas; disponer del YAML no acredita por sí solo la publicación. La [tarea #20](https://github.com/Wid4er/CC-DASRadio/issues/20) reúne la verificación final.

La reproducción y persistencia locales, incluida la instalación sin `.env`, se documentan en la [guía de evaluación](evaluacion-web.md). El Hito 1 permanece identificable por su [PR #12](https://github.com/Wid4er/CC-DASRadio/pull/12) y su versión entregada; las imágenes corresponden a la implementación del Hito 2.

Referencias: [publicar imágenes con Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) y [Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
