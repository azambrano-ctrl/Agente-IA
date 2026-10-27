# 🤖 Agente de IA en WhatsApp para un ISP

El WhatsApp de tu proveedor de internet atendiendo solo:

- 💰 **"¿Cuánto debo?"**: identifica al cliente y le consulta el saldo a tu servidor (VPS + CRM) o a la planilla cargada (saldo, vencimiento, último pago, si está suspendido y cómo pagar).
- 🏠 **"Quiero instalar internet"**: le hace todas las preguntas (cobertura, plan, titular, DNI, dirección, entre calles, vivienda, email, ubicación y día), le muestra un resumen, la carga en el sistema, reserva la franja y se la manda al técnico.
- 🚨 **"No tengo internet"**: revisa si hay un corte en la zona, lo guía con los pasos básicos y, si no se resuelve, carga la incidencia en el sistema y **la despacha a un técnico por WhatsApp**. El técnico contesta `TOMO`, `EN CAMINO` y `LISTO`, y el cliente recibe un aviso en cada paso.
- 🗂️ **Bajas, cambios de plan, facturación o "quiero hablar con alguien"**: las deriva a la oficina con número de gestión.
- 🖥️ **Panel web** para la oficina: órdenes, técnicos, clientes, carga de CSV y registro de pagos.

```
Cliente ─► WhatsApp ─► Agente IA ─► Sistema (clientes · deudas · órdenes)
                                       │
                                       └─► Técnico por WhatsApp ─► TOMO / EN CAMINO / LISTO ─► aviso al cliente
```

Node.js 20.12 o más nuevo, **sin dependencias** (no hace falta `npm install`). Los datos se guardan en `data/`.

---

## 1 · Configurar

```bash
cp .env.example .env     # completá los valores (abajo se explica cada uno)
```

| Variable | De dónde sale |
|---|---|
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | developers.facebook.com › tu App › WhatsApp › Configuración de la API |
| `WHATSAPP_VERIFY_TOKEN` | Una frase que inventás vos; la misma va en el webhook de Meta |
| `WHATSAPP_APP_SECRET` | App › Configuración › Básica (valida que los mensajes vengan de Meta) |
| `WHATSAPP_PLANTILLA_TECNICO` | Plantilla aprobada en Meta para avisar a un técnico fuera de la ventana de 24 h (ver más abajo) |
| `OPENROUTER_API_KEY`, `MODELO` | openrouter.ai. Para cambiar de modelo cambiás una línea |
| `ADMIN_WHATSAPP` | Números de la oficina que reciben órdenes y gestiones nuevas |
| `PANEL_USUARIO`, `PANEL_CLAVE` | Acceso a `https://TU-DOMINIO/panel` |

En Meta › WhatsApp › Configuración › Webhook poné la URL `https://TU-DOMINIO/webhook` y el token de verificación, y suscribite al campo **messages**.

## 2 · Tu empresa: `negocio.json`

| Campo | Qué poner |
|---|---|
| `nombre`, `direccion` | Nombre comercial y oficina |
| `planes` | Nombre, velocidad y precio |
| `instalacion` | Costo, equipo y plazo |
| `cobertura` | Barrios o localidades con servicio |
| `avisos` | Cortes vigentes, ej. `[{"zona": "Alberdi", "mensaje": "Corte de fibra, vuelve 18 h"}]`. Mientras haya un aviso en una zona, el agente no despacha técnicos ahí |
| `pagos` | Medios de pago, alias y vencimiento |
| `soporte` | Pasos de diagnóstico antes de mandar un técnico |
| `visitas` | Horarios de instalación, duración de la franja y cantidad de cuadrillas |
| `tecnicos` | `nombre`, `telefono` (formato WhatsApp, ej. `5493511234567`) y `zonas` que cubre |

Con el servidor andando, `negocio.json` se recarga solo: cargás o sacás un corte y se aplica al instante.

## 3 · Conectar tu servidor de saldos (VPS + CRM)

Si ya tenés un servidor que consulta los saldos en el CRM, el agente le pregunta a él. No hace falta que el CRM tenga API: alcanza con que tu VPS responda a una URL.

```env
CRM_SALDO_URL=http://IP-DE-TU-VPS:8080/saldo?dni={dni}
# o por número de WhatsApp:  ...?telefono={telefono}   (le llega sin 54 9, ej. 3515551234)
# o con los dos datos:       ...?dni={dni}&cliente={numeroCliente}
CRM_SALDO_METODO=GET         # o POST: manda {"dni","numeroCliente","telefono"} en JSON
CRM_TOKEN=                   # si pide Authorization: Bearer
```

Lo que devuelva tu VPS se interpreta solo:

- **JSON** con cualquier nombre de campo habitual (`saldo`/`deuda`/`total`, `nombre`/`razon_social`, `dni`/`documento`, `celular`, `domicilio`, `barrio`, `estado`, `vencimiento`…), aunque venga anidado en `data` o `cliente`, y con montos tipo `24.000,00`. Si usás nombres raros: `CRM_CAMPOS={"saldo":"datos.deuda_total"}`.
- **Texto** (ej. `Saldo: $24.000 - Vence 10/03`): se le pasa tal cual al agente, que lo lee y se lo explica al cliente.
- **404** o `{"encontrado": false}`: el cliente no existe.

Probalo antes de salir en vivo:

```bash
npm run probar-saldo -- dni=30111222
```

Muestra la respuesta cruda de tu VPS y cómo la entendió el agente.

**Seguridad:** el saldo se da solo si el teléfono del CRM coincide con el WhatsApp del cliente, o si el cliente dio DNI y número de cliente y los dos coinciden. Después de 3 intentos fallidos lo deriva a la oficina. El saldo se consulta en el momento cada vez que lo pide (si pagó, se ve al toque).

**Incidencias hacia el CRM (opcional):** con `CRM_ORDENES_URL=http://IP-DE-TU-VPS:8080/ordenes`, tu VPS recibe un `POST` con cada incidencia o instalación nueva y cada cambio de estado (`{"evento": "orden_creada" | "orden_actualizada", "orden": {...}}`), por si quieren cargarlas también en el CRM.

## 3 bis · O cargar los clientes desde una planilla

Si no usás `CRM_SALDO_URL`, el agente usa la planilla importada.

Exportá tu planilla de Excel como CSV con estas columnas (sirve `;` o `,`). Tenés un ejemplo en `data/clientes-ejemplo.csv`.

```
numeroCliente;nombre;dni;telefono;direccion;zona;plan;estado;saldo;vencimiento;ultimoPago
10234;Lucía Paz;30111222;3515551234;Obispo Trejo 300;Nueva Córdoba;Fibra 300;activo;24.000;2026-11-10;2026-10-08
```

```bash
npm run importar -- clientes.csv      # o desde el panel: Clientes › Importar CSV
```

- Si un cliente ya existe (por `numeroCliente`), se actualiza. Para refrescar saldos, reimportá la planilla cuando quieras.
- `estado`: `activo` o `suspendido`. Al suspendido no se le manda técnico: el agente le informa la deuda.
- Los pagos también se registran a mano desde el panel; si el saldo queda en 0, el cliente se reactiva.

**¿Cómo identifica al cliente?** Por el número de WhatsApp desde el que escribe, comparando con la columna `telefono`, con o sin 54 9. Si escribe desde otro número, le pide **DNI y número de cliente**, y los dos tienen que coincidir. Después de 3 intentos fallidos lo deriva a la oficina. Nunca da datos de otra cuenta.

## 4 · Los técnicos por WhatsApp

Cuando se carga una falla o una instalación, el sistema elige al técnico de esa zona con menos órdenes abiertas y le manda:

```
🔧 ORDEN #1001 · REPARACIÓN (sin_servicio)
👤 Lucía Paz (cliente 10234)
📞 3515551234
📍 Obispo Trejo 300 - Nueva Córdoba
📝 Sin internet desde anoche
🔍 Ya probó: LOS en rojo, reinició 2 veces
🕒 Disponibilidad: tardes
🗺️ https://maps.google.com/?q=...
Respondé TOMO 1001 para aceptarla.
```

El técnico responde al mismo número del agente. Sus mensajes no pasan por la IA, se toman como comandos:

| Comando | Qué pasa |
|---|---|
| `TOMO 1001` | Acepta la orden y se le avisa al cliente quién la tomó |
| `EN CAMINO 1001` | Se le avisa al cliente que va en camino |
| `LISTO 1001 cambié el conector` | Se cierra la orden, se le avisa al cliente y a la oficina |
| `NO PUEDO 1001 motivo` | Se reasigna a otro técnico (o queda para la oficina) |
| `MIS` | Lista sus órdenes abiertas |

**Regla de las 24 h de Meta:** solo se le puede escribir texto libre a alguien que le escribió al número en las últimas 24 h. Si un técnico no escribió, se le manda la plantilla `WHATSAPP_PLANTILLA_TECNICO`; cuando responde, recibe el detalle completo. Creala en *WhatsApp Manager › Plantillas* (categoría *Utilidad*) con un cuerpo como:

> Nueva orden #{{1}} en {{2}}. Respondé este mensaje para ver el detalle.

Lo más simple es que cada técnico le mande un "hola" al número al empezar el día.

## 5 · Panel de la oficina

`https://TU-DOMINIO/panel` (usuario y clave del `.env`):

- **Órdenes:** reparaciones, instalaciones y gestiones, con todos los datos. Desde ahí cambiás el estado o asignás y reasignás técnico (se le manda por WhatsApp).
- **Clientes:** buscás, importás CSV y registrás pagos.
- **Técnicos:** cuántas órdenes abiertas tiene cada uno.

## 6 · Probar

```bash
npm test                                          # batería automática (no gasta tokens)
npm run importar -- data/clientes-ejemplo.csv
npm run chat -- 5493515551234                     # chateás como Lucía (cliente del ejemplo)
```

En el chat, `/tecnico 5493510000001 TOMO 1001` simula a un técnico, y los WhatsApp que saldrían a técnicos y clientes se muestran en pantalla.

La batería cubre: consulta de deuda por WhatsApp, identificación por DNI + número de cliente con bloqueo a los 3 intentos, instalación completa con despacho, planes y zonas inválidos, falla despachada a técnico, cliente suspendido, corte masivo, comandos de técnico (TOMO, EN CAMINO, LISTO, NO PUEDO, MIS), órdenes ajenas, plantilla de 24 h, panel con clave, CSV de Excel, «31 de febrero», 2 mensajes a la vez e «ignorá tus instrucciones».

## 7 · Ponerlo en vivo (VPS)

Tu notebook no es un servidor. En un VPS con un dominio apuntando a su IP:

```bash
git clone <este-repo> && cd Agente-IA
cp .env.example .env && nano .env
nano negocio.json
nano deploy/Caddyfile                      # tu dominio (Caddy saca el HTTPS solo)
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec agente node scripts/importar.js /ruta/clientes.csv
```

Sin Docker podés usar `deploy/agente.service` (systemd). Para comprobar que está andando: `curl https://TU-DOMINIO/salud`.

**Backup:** todo el sistema vive en `data/` (`sistema.json`, `agenda.json`, `memoria.json`). Copialo seguido.

---

## Estructura

```
agente.js            servidor (entrada)
negocio.json         ficha de la empresa y técnicos   ← lo que más vas a editar
src/
  sistema.js         órdenes de trabajo (y clientes de la planilla)
  clientes.js        conexión con tu servidor de saldos (VPS/CRM) o la planilla
  despacho.js        asignación a técnicos y comandos por WhatsApp
  herramientas.js    lo que el agente puede hacer en el sistema
  agente.js          bucle modelo ↔ herramientas
  negocio.js         ficha, cobertura y prompt
  agenda.js          franjas de instalación por cuadrilla
  panel.js/.html     panel web de la oficina
  whatsapp.js        Cloud API: texto, plantillas, ubicación, firma
  servidor.js        /webhook, /panel, /api, /salud
  cola.js            junta mensajes seguidos y ordena por cliente
  memoria.js         historial por cliente
  csv.js, telefono.js, modelo.js, config.js, almacen.js, errores.js
scripts/             chat local, importador de CSV y prueba del servidor de saldos
deploy/              Dockerfile, docker-compose, Caddyfile, systemd
test/                batería de pruebas
```
