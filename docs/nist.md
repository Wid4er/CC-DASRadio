# Encuadre NIST e impacto económico

Análisis de diseño para el Hito 1. Las asignaciones a CC-DASRadio son una interpretación del proyecto a partir de los estándares, no una certificación ni evidencia de servicios ya desplegados.

## NIST SP 800-145

El estándar define cinco características de la nube: autoservicio, acceso por red, recursos compartidos, elasticidad y medición. El análisis siguiente distingue objetivos de la aplicación y capacidades todavía no implementadas. [NIST SP 800-145, sección 2](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-145.pdf).

| Característica | Aplicación al diseño de CC-DASRadio | Límite del entorno doméstico |
|---|---|---|
| Autoservicio bajo demanda | Start permite incorporarse sin intervención del operador; el controlador crea la conexión y usa recursos solo mientras hay conexiones activas. | Activar una función no demuestra aprovisionamiento cloud. El despliegue de contenedores sigue siendo responsabilidad del operador; no hay aprovisionamiento automático acreditado. |
| Acceso amplio a la red | Los usuarios acceden mediante Discord; control, audio y persistencia utilizan interfaces de red. No requieren instalar un cliente propio de radio. | La API interna no tiene por qué ser pública. La disponibilidad depende de Discord, la conexión doméstica y el servidor. |
| Puesta en común de recursos | Varias comunidades usan el mismo catálogo, base de datos y reproductor. La carga y decodificación comunes evitan preparar una programación independiente por servidor. | Cada conexión consume red y procesamiento; compartir recursos no los convierte en ilimitados. |
| Elasticidad rápida | La separación permite dimensionar API, audio y cliente por sus cargas. Se prevé estudiar réplicas de radio-service con distribución de peticiones. | Docker Compose y un solo servidor no aportan autoscaling por sí mismos. Replicar el reproductor común exige coordinación y el hardware limita la capacidad; esa elasticidad está prevista, no demostrada. |
| Servicio medido | Se prevén medidas de conexiones, minutos emitidos, selecciones, peticiones, errores, CPU, RAM, almacenamiento y bytes enviados para conocer consumo y ajustar capacidad. | Las métricas aún no están instrumentadas. No existe facturación automática ni tarifa comercial. |

La interfaz al consumidor tiene orientación SaaS: se utiliza la radio sin administrar sus servicios. El servidor doméstico con contenedores se presenta como entorno de simulación, no como una nube privada NIST plenamente implementada. Azure u otro proveedor serían alternativas futuras, no actores actuales ni despliegues contratados.

Para justificar un despliegue cloud completo posteriormente habrá que concretar aprovisionamiento, medición y mecanismos de escalado. En el Hito 1 se documenta cómo motivan el diseño y qué limita la simulación.

## NIST SP 500-292

El marco distingue consumidor, proveedor, intermediario, auditor y operador de red. Los roles describen responsabilidades, no obligan a que todas existan en cada despliegue. [NIST SP 500-292, sección 2](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-292.pdf).

| Actor | Asignación en el escenario previsto | Relación e impacto económico |
|---|---|---|
| Cloud Consumer | Comunidades y usuarios que utilizan CC-DASRadio mediante Discord. | Solicitan reproducción al proveedor del proyecto. No se plantea cobro en el MVP; consumen su propia conectividad y los recursos compartidos de la emisora. |
| Cloud Provider | Autor/operador de CC-DASRadio sobre su servidor doméstico, como responsable del servicio en la simulación. | Mantiene catálogo, procesos, almacenamiento y disponibilidad. Asume electricidad, equipo, conexión y tiempo de mantenimiento. Un proveedor comercial no está contratado. |
| Cloud Broker | No hay un broker independiente identificado. | CC-DASRadio presta una aplicación propia; integrar Discord no demuestra negociación o intermediación entre proveedores cloud. No se añade una comisión de broker al modelo. |
| Cloud Auditor | No hay auditor independiente contratado. | Las comprobaciones del desarrollador y la revisión académica no se presentan como una auditoría cloud independiente. Una auditoría futura tendría un coste aún no estimado. |
| Cloud Carrier | Proveedores de conectividad de la infraestructura doméstica y de los consumidores, sin identificar empresas concretas. | Transportan comunicaciones entre el servicio, Discord y los clientes. La capacidad de subida y la tarifa de red influyen en el servicio. |

Discord es una plataforma externa de voz e interacciones. No se asigna automáticamente el papel de carrier, broker o proveedor de la infraestructura de CC-DASRadio. PostgreSQL y Docker son tecnologías, no organizaciones que desempeñen esos roles por sí mismas.

## Impacto económico y medición prevista

El prototipo doméstico evita contratar infraestructura cloud inicialmente, pero sigue consumiendo electricidad, almacenamiento, conectividad y trabajo de administración. No se estima un coste monetario sin conocer potencia, tarifas, tamaño del catálogo y demanda.

| Recurso | Métrica propuesta | Efecto en coste o capacidad |
|---|---|---|
| CPU y RAM | Uso por servicio, tamaño del audio cargado y número de conexiones activas. | Determina cuántos servidores puede atender el equipo y si necesita ampliarse. |
| Red | Bytes enviados a Discord y tráfico de descarga interno. | La emisión debe enviarse a cada conexión; compartir programación no elimina ese tráfico. |
| Almacenamiento | Tamaño del catálogo binario, base de datos y copias previstas. | Los archivos y las copias ocupan disco y afectan al tiempo de mantenimiento. |
| Electricidad | Potencia medida y horas encendido. | Permite estimar consumo energético del servidor. |
| Operación | Horas de mantenimiento, errores y tiempo de recuperación. | Representa trabajo del proveedor y disponibilidad percibida por consumidores. |

Relaciones para estimar, sin atribuirles mediciones actuales:

- Energía en kWh = potencia media medida en kW × horas encendido.
- Transferencia útil aproximada = bitrate de audio × tiempo emitido × conexiones, convirtiendo bits a bytes y añadiendo después el overhead real.
- Escuchar la misma canción en dos servidores requiere dos envíos de voz aunque el archivo y la programación se compartan.
- Pausar al salir la última conexión reduce reproducción y transferencia de audio; no apaga el servidor ni elimina el consumo base de contenedores y PostgreSQL.

El servicio medido permitirá comparar consumo y errores con conexiones atendidas. El modelo de negocio del MVP es un prototipo académico sin cobro; sus costes corresponden al operador. En una migración futura se evaluarían cómputo, almacenamiento, transferencia y operación sin asumir tarifas concretas.

## Evidencias futuras

- Métricas instrumentadas y observadas durante pruebas.
- Comprobación de pausa sin conexiones y reproducción compartida.
- Persistencia del estado con reinicios y almacenamiento durable de PostgreSQL.
- Evaluación del cuello de botella de red y de la coordinación necesaria para replicar.

Estas evidencias se obtendrán al implementar. El Hito 1 entrega el encuadre, sus hipótesis y límites.
