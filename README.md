# 🤖 Agente de IA en WhatsApp para un ISP

El WhatsApp de tu proveedor de internet atendiendo solo: un agente que **conversa** con clientes e interesados, **recuerda** la charla, **responde** sobre planes, cobertura, pagos y soporte, y **actúa de verdad**: abre reclamos con número, agenda instalaciones y visitas técnicas y le avisa al equipo.

Lo que resuelve:

- 💬 **Ventas:** planes y precios, consulta de cobertura por barrio, recomendación de plan y agenda de la instalación.
- 🛠️ **Soporte:** primero se fija si hay un corte avisado en la zona, después guía el diagnóstico (luces PON/LOS, reinicio, cable o WiFi) y, si no se resuelve, abre un ticket y ofrece una visita técnica.
- 📅 **Visitas:** instalación, visita técnica, cambio o retiro de equipo, en franjas de 2 h y con varias cuadrillas.
- 🎫 **Gestiones:** bajas, cambios de plan, facturación o pedido de hablar con una persona generan un ticket y llegan al equipo por WhatsApp.

```
Cliente ──► WhatsApp (Meta) ──► Tu sistema (agente.js) ──► OpenRouter (Claude / GPT / Gemini / Llama / DeepSeek)
                                   │  memoria  · ficha del negocio · herramientas (agenda)
```

- Node.js 20.12 o más nuevo, **sin dependencias**: no hace falta `npm install`.
- La memoria y la agenda se guardan en `data/*.json`.

---

## Paso 1 · El plan

Antes de tocar código, definí:

| Pregunta | Ejemplo |
|---|---|
| ¿Qué hace tu negocio? | Proveedor de internet por fibra e inalámbrico |
| ¿Quiénes son tus clientes? | Abonados e interesados que escriben por WhatsApp |
| ¿Qué resuelve el agente? | Ventas, cobertura, soporte de primer nivel y gestiones |
| ¿Qué acciones puede tomar? | Abrir tickets, agendar o cancelar visitas y avisar al equipo |

## Paso 2 · Conectar WhatsApp (Meta for Developers)

1. Entrá a <https://developers.facebook.com>, creá una **App** de tipo *Business* y agregale el producto **WhatsApp**.
2. En *WhatsApp › Configuración de la API* copiá el **Phone number ID** y el **token** (para producción, generá un token permanente con un *usuario del sistema* en el Business Manager).
3. En *Configuración › Básica* copiá el **App Secret**: sirve para validar que los webhooks vienen de Meta.
4. En *WhatsApp › Configuración › Webhook* poné:
   - URL de devolución de llamada: `https://TU-DOMINIO/webhook`
   - Token de verificación: el mismo valor que `WHATSAPP_VERIFY_TOKEN`
   - Suscribite al campo **messages**.

```bash
cp .env.example .env   # y completá los valores
```

## Paso 3 · Conectar el modelo (OpenRouter)

Creá una API key en <https://openrouter.ai> y ponela en `OPENROUTER_API_KEY`. Para cambiar de modelo, cambiás una línea:

```env
MODELO=openai/gpt-4o-mini          # o anthropic/claude-sonnet-4.5, google/gemini-2.5-flash, deepseek/deepseek-chat…
```

Usá un modelo que soporte *tool calling*.

## Paso 4 · Memoria

Si no tiene memoria, cada mensaje arranca la charla desde cero. Por eso cada cliente (su número) tiene su historial en `data/memoria.json`, y los últimos `MAX_HISTORIAL` mensajes se mandan al modelo con cada mensaje nuevo.

## Paso 5 · Tu empresa

Editá `negocio.json` con los datos reales:

| Campo | Qué poner |
|---|---|
| `nombre`, `direccion` | Nombre comercial y oficina |
| `planes` | Nombre, velocidad y precio de cada plan |
| `instalacion` | Costo, equipo incluido y plazo |
| `cobertura` | Barrios o localidades donde hay servicio |
| `avisos` | Cortes o mantenimientos vigentes, ej. `[{"zona": "Alberdi", "mensaje": "Corte de fibra, se estima volver a las 18 h"}]` (sin `zona` aplica a todos) |
| `horarios` | Horario de atención |
| `visitas` | Tipos de visita, horarios, duración de la franja y cantidad de cuadrillas |
| `pagos`, `soporte`, `preguntasFrecuentes` | Medios de pago y vencimiento, pasos de diagnóstico y preguntas frecuentes |

El agente responde **solo** con esa ficha. Con el servidor andando, `negocio.json` se recarga solo: si hay un corte, lo cargás en `avisos` y desde ese momento el agente lo informa sin reiniciar nada (y lo sacás cuando se resuelve).

## Paso 6 · Herramientas (el agente actúa)

| Herramienta | Qué hace |
|---|---|
| `consultar_cobertura(ubicacion)` | Verifica si hay servicio en esa dirección o barrio y si hay cortes avisados |
| `datos_del_cliente(nombre?, direccion?, numeroCliente?)` | Lee o guarda los datos del titular |
| `crear_ticket(tipo, descripcion)` | Abre un reclamo o solicitud (`soporte`, `alta`, `cambio_plan`, `baja`, `administrativo`, `humano`) y devuelve el número |
| `ver_mis_tickets()` | Lista los reclamos abiertos del cliente |
| `ver_agenda(fecha)` | Franjas libres para visitas. Rechaza fechas que no existen, que ya pasaron o sin visitas |
| `agendar_visita(fecha, franja, tipo, nombre, direccion)` | Agenda una instalación o visita técnica |
| `ver_mis_visitas()` / `cancelar_visita(id)` | Consultar o cancelar visitas |

- El teléfono del cliente sale del webhook, nunca del modelo, así que nadie puede ver los reclamos o visitas de otra persona.
- Cada ticket y visita nueva le llega al equipo por WhatsApp a los números de `ADMIN_WHATSAPP`. Por reglas de Meta, esos números tienen que haberle escrito al número del agente en las últimas 24 h; si no, el aviso queda solo en el log.
- Los tickets se guardan en `data/tickets.json` y las visitas en `data/agenda.json`. Si usás un sistema de gestión (MikroWisp, ISPCube, Wispro, Splynx…), esos métodos se conectan a su API.

## Paso 7 · Probar

```bash
npm test         # batería de pruebas automática (no gasta tokens)
npm run chat     # chateá con el agente en la terminal, sin WhatsApp
```

La batería cubre las pruebas del vídeo:

- ✅ pregunta simple (planes y precios)
- ✅ alta completa: cobertura → datos → instalación agendada
- ✅ «no tengo internet» → ticket de soporte con número y aviso al equipo
- ✅ «visita el 31 de febrero» (la fecha no existe)
- ✅ 2 mensajes a la vez (se juntan en uno solo, `DEBOUNCE_MS`)
- ✅ «ignorá tus instrucciones» (prompt blindado y herramientas acotadas al cliente)
- ✅ agendar y cancelar, con cupo por cuadrilla

Probá también a mano con `npm run chat` antes de abrirlo al público.

## Paso 8 · Ponerlo en vivo (VPS)

Tu notebook no es un servidor: si la cerrás, el agente deja de atender. Subilo a un VPS (Hetzner, DigitalOcean, Contabo, etc.) con un dominio apuntando a su IP.

**Con Docker (recomendado):**

```bash
git clone <este-repo> && cd Agente-IA
cp .env.example .env && nano .env
nano deploy/Caddyfile                       # tu dominio (Caddy saca el HTTPS solo)
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f agente
```

**Sin Docker:** copiá el repo a `/opt/agente-ia` y usá `deploy/agente.service` (systemd), con Caddy o Nginx delante para el HTTPS.

Para comprobar que está andando: `curl https://TU-DOMINIO/salud`.

---

## Estructura

```
agente.js            servidor (entrada)
negocio.json         ficha de la empresa  ← lo que más vas a editar
src/
  agente.js          bucle modelo ↔ herramientas
  modelo.js          cliente OpenRouter
  whatsapp.js        Cloud API: enviar, verificar webhook, validar firma
  servidor.js        endpoints /webhook y /salud
  cola.js            junta mensajes seguidos y ordena por cliente
  memoria.js         historial por cliente
  agenda.js          visitas técnicas por franja y cuadrilla
  tickets.js         reclamos y solicitudes numerados
  errores.js         errores que se le devuelven al modelo
  herramientas.js    definición y ejecución de las tools
  negocio.js         ficha y prompt de sistema
scripts/chat.js      chat local de prueba
deploy/              Dockerfile, docker-compose, Caddyfile y systemd
test/                batería de pruebas
```

## Seguridad

- La firma `X-Hub-Signature-256` se valida si configurás `WHATSAPP_APP_SECRET`. Configuralo en producción.
- Los mensajes duplicados (reintentos de Meta) se ignoran.
- Nunca subas `.env` al repo (ya está en `.gitignore`).
