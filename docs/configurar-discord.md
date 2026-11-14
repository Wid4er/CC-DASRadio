# Crear el bot de Discord — tutorial opcional

Discord es la interfaz principal prevista de CC-DASRadio. El cliente web es una **adición opcional para facilitar la evaluación**, especialmente si el bot no está configurado o no funciona. El docente puede continuar con la web sin crear una cuenta de desarrollador.

Con el entorno arrancado, esta guía también está disponible en **http://127.0.0.1:8080/ayuda/discord**. La página de la radio incluye un enlace desplegable a ella; no bloquea la escucha ni solicita credenciales. Si cambia `WEB_PORT`, usar ese puerto.

## Continuar sin Discord

Desde la raíz de CC-DASRadio, ejecutar `./scripts/start.sh --web-only`. En Windows, ejecutar `scripts/start.ps1 -WebOnly`. Se prepara web, API y PostgreSQL. La [guía de evaluación](evaluacion-web.md) describe las pruebas de escucha compartida y persistencia.

El arranque web predeterminado facilita la corrección y no convierte la configuración Discord en un requisito. Sin opciones, el lanzador incluye Discord si están completos el token y los dos IDs. Si faltan o contienen valores de ejemplo, continúa con la web. Esta detección del lanzador es local: no valida el token ni instala el bot. Una vez conectado, el propio bot comprueba y actualiza su comando global /radio si falta o cambió.

## 1. Crear la aplicación

Entrar en el [Discord Developer Portal](https://discord.com/developers/applications), iniciar sesión y seleccionar **New Application**. Darle un nombre, por ejemplo `CC-DASRadio`.

En **General Information**, copiar **Application ID**: este valor corresponde a `DISCORD_CLIENT_ID`.

## 2. Generar el token

En **Bot → Token → Reset Token**, generar el token y copiarlo directamente a `DISCORD_TOKEN` en el `.env` local. El Client Secret de OAuth2 es otra credencial.

El token es una contraseña: no introducirlo en la web de evaluación, enviarlo al chat ni publicarlo en Git. Si se expone, regenerarlo. El formulario del Developer Portal puede pedir confirmación de identidad.

El cliente usa los intents normales Guilds y GuildVoiceStates; no necesita activar **Privileged Gateway Intents**. Dejar **Interactions Endpoint URL** vacío, porque este código recibe las interacciones mediante la conexión del bot al Gateway de Discord.

## 3. Instalarlo en un servidor de pruebas

En **Installation**, habilitar **Guild Install** y elegir **Discord Provided Link**. En los ajustes de Guild Install, añadir los scopes `bot` y `applications.commands`.

Conceder **View Channels**, **Send Messages**, **Connect** y **Speak**, sin Administrator. Los permisos deben estar permitidos también en el canal de voz elegido. Abrir el enlace de instalación, seleccionar un servidor que se pueda gestionar y autorizar el bot.

## 4. Obtener el ID del servidor

En Discord, ir a **Ajustes de usuario → Avanzado → Modo desarrollador**. Hacer clic derecho en el icono del servidor de pruebas y seleccionar **Copiar ID del servidor**. Es el valor de `DISCORD_GUILD_ID`, no el ID del canal. Se conserva como servidor de referencia en la configuración; los comandos son globales y no quedan limitados a ese servidor.

Completar los tres campos del bot en el `.env` existente:

```dotenv
DISCORD_TOKEN=token_del_bot
DISCORD_CLIENT_ID=id_de_la_aplicacion
DISCORD_GUILD_ID=id_del_servidor
```

Conservar las claves internas de PostgreSQL y `SERVICE_TOKEN`. El lanzador detecta los tres campos y activa el perfil sin necesidad de cambiar `COMPOSE_PROFILES`. `--discord` permite exigirlos; `--web-only` omite el bot aunque estén configurados.

## 5. Registrar el comando y arrancar

Desde la raíz del repositorio:

```bash
docker compose build discord-service
docker compose run --rm discord-service node dist/register-commands.js
./scripts/start.sh --discord
```

En Windows, sustituir la última línea por:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -WithDiscord
```

El registro es global para la aplicación: `/radio start`, `/radio stop` y `/radio now` se ofrecen en todos los servidores donde se instala el bot con `bot` y `applications.commands`. El bot comprueba la definición al conectar y solo la actualiza si cambió; `register-commands.js` permite forzar esa comprobación manualmente. No hay que cambiar `DISCORD_GUILD_ID` ni repetir el registro al añadir otro servidor.

Entrar en un canal de voz normal del servidor y ejecutar `/radio start` en un canal de texto. El bot se incorpora a la canción y posición del proveedor. `/radio stop` lo retira solo de ese servidor; `/radio now` consulta la emisión. Se puede escuchar al mismo tiempo desde la web. Las llamadas privadas y los canales de escenario quedan fuera de este incremento. La [guía de reproducción compartida](reproduccion-compartida.md) explica el reloj, las conexiones y las pruebas.

## Si no funciona

Comprobar primero `docker compose ps -a discord-service`. El arranque con `./scripts/start.sh` añade el bot automáticamente cuando sus tres campos están completos; `./scripts/start.sh --discord` permite exigirlos y `--web-only` omite su arranque. Un contenedor detenido no puede responder a las interacciones, aunque el comando siga apareciendo en Discord.

Que el registro muestre «conectado a Discord» confirma el inicio de sesión del bot, pero no su instalación en un servidor. Verificar que DASRadio figura como miembro del servidor de pruebas. Si solo se instaló la aplicación para el usuario, repetir la instalación eligiendo **Guild Install / Añadir al servidor**, con los scopes `bot` y `applications.commands`. Después comprobar la aplicación del bot y su registro global según el paso 5.

Consultar `docker compose logs --tail=30 discord-service`. Si el comando no aparece, confirmar que la aplicación está instalada en ese servidor con `applications.commands`, revisar el mensaje de registro global en los logs y recargar Discord. Puede repetirse el registro manual del paso 5. Si el bot no conecta, revisar el token y la conectividad. Si aparece un error del socket de Docker, revisar el servicio y los permisos del host como indica la [guía local](desarrollo-local.md).

Se puede continuar con `./scripts/start.sh --web-only`, o el script PowerShell con `-WebOnly`. Este modo selecciona la web y sus dependencias sin necesitar que el bot funcione; no detiene automáticamente un bot que ya estuviera arrancado.

Referencias: [creación e instalación de aplicaciones](https://docs.discord.com/developers/quick-start/getting-started) y [localización de los IDs](https://support-dev.discord.com/hc/en-us/articles/360028717192-Where-can-I-find-my-Application-Team-Server-ID).
