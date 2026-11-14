# Cargar MP3 locales sin recodificación

`scripts/import-mp3.py` carga archivos MP3 en PostgreSQL a través de una orden de mantenimiento de `radio-service`. La web y Discord siguen usando la API y no acceden directamente a la base de datos.

Estos pasos también están disponibles en **Cargar música**, en http://127.0.0.1:8080/ayuda/musica. Se puede consultar esa sección o la guía de Discord mientras suena la radio: la navegación interna conserva el reproductor. Ejecutar los comandos de mantenimiento sí detiene temporalmente la escucha.

El MP3 se conserva **byte a byte, comprimido**, con `Content-Type: audio/mpeg`. No se transforma a PCM, WAV ni Base64. Se extraen título, artista y duración con `ffprobe`; estos metadatos se almacenan separados del archivo. El límite de esta herramienta es de 32 MiB por archivo.

Requisitos: Docker, Python 3 y `ffprobe` (incluido con FFmpeg) en el equipo que importa. No se añade FFmpeg a la imagen de la API; el bot sí lo utiliza para convertir audio a Opus ni se necesitan credenciales en los argumentos de consola. La orden se ejecuta dentro de `radio-service`, que ya dispone de la configuración interna.

## Procedimiento

Desde la raíz de CC-DASRadio, construir la API con la herramienta de importación y pausar los clientes durante la sustitución del catálogo de ejemplo. Tras importar se recrea la API para renovar el estado del controlador; se conserva el volumen. Si se utiliza el bot, volver a arrancarlo después con `./scripts/start.sh --discord`:

```bash
docker compose stop web-service discord-service
docker compose up -d --build --wait radio-service
python3 scripts/import-mp3.py --replace-demo "/ruta/a/primera cancion.mp3" "/ruta/a/segunda cancion.mp3"
docker compose up -d --force-recreate --wait radio-service
docker compose up -d --build --wait web-service
```

Abrir http://127.0.0.1:8080 y conectar. Un MP3 ya importado en esa emisora no se duplica cuando se vuelve a pasar exactamente el mismo archivo. Los originales permanecen en su carpeta de origen.

`--replace-demo` es opcional. Desactiva únicamente los dos tonos WAV originales, identificados por metadatos y bytes exactos; no borra sus filas ni desactiva canciones personalizadas. Si el punto pausado pertenece a uno de esos tonos, se deja la emisora en `idle` para seleccionar una canción nueva al conectar. Se rechaza la sustitución si el tono figura en reproducción o preparación: primero hay que pausar su controlador.

Para ampliar un catálogo existente conservando los tonos y el punto actual, omitir `--replace-demo`. `--station-id N` permite elegir otra emisora existente. Si una importación falla, se puede volver a levantar la web con `docker compose up -d --wait web-service`.

## Qué comprobar

- Comparar el SHA-256 del archivo de origen con los bytes devueltos por la API.
- Verificar `audio/mpeg`, duración y metadatos de cada canción.
- Reproducir ambas canciones en el navegador y comprobar la incorporación de una segunda pestaña, la salida individual y la pausa final.
- Comprobar la reanudación desde un punto guardado y la persistencia tras recrear los contenedores.

La prueba HTTP de `web-service/test/check-live.mjs` admite los tonos WAV y archivos MP3; comprueba sus cabeceras sin asumir que todo el catálogo es WAV.

Los archivos personales no se copian al repositorio ni se incorporan a las imágenes. Una instalación nueva sigue obteniendo los tonos generados por el seed; la música importada queda en el volumen PostgreSQL local.
