# 🤖 Agente de IA en WhatsApp

Tu WhatsApp atendiendo solo: un agente que **conversa** con el cliente, **recuerda** la charla, **responde** sobre tu negocio y **actúa de verdad** (ve la agenda y reserva o cancela turnos).

Viene configurado como ejemplo para una clínica dental (`negocio.json`), pero sirve para cualquier rubro: cambiás la ficha y listo.

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
| ¿Qué hace tu negocio? | Clínica dental |
| ¿Quiénes son tus clientes? | Pacientes que escriben por WhatsApp |
| ¿Qué resuelve el agente? | Consultas de precios y horarios, y reservar turnos |
| ¿Qué acciones puede tomar? | Ver la agenda, crear citas y cancelarlas |

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

## Paso 5 · El negocio

Editá `negocio.json`: servicios, precios, horarios, dirección, obras sociales, seña y preguntas frecuentes. El agente responde **solo** con esa ficha y no inventa nada que no esté ahí.

## Paso 6 · Herramientas (el agente actúa)

| Herramienta | Qué hace |
|---|---|
| `ver_agenda(fecha)` | Horarios libres y ocupados del día. Rechaza fechas que no existen, que ya pasaron o en las que el negocio está cerrado |
| `datos_del_cliente(nombre?)` | Lee o guarda el nombre del cliente |
| `crear_cita(fecha, hora, servicio, nombre)` | Reserva el turno |
| `ver_mis_citas()` | Lista los próximos turnos del cliente |
| `cancelar_cita(id)` | Cancela un turno |

El teléfono del cliente sale del webhook, nunca del modelo, así que nadie puede ver ni cancelar turnos de otra persona escribiendo algo raro. La agenda es local (`src/agenda.js`); si querés usar Cal.com o Google Calendar, reemplazás esos métodos.

## Paso 7 · Probar

```bash
npm test         # batería de pruebas automática (no gasta tokens)
npm run chat     # chateá con el agente en la terminal, sin WhatsApp
```

La batería cubre las pruebas del vídeo:

- ✅ pregunta simple
- ✅ «turno el 31 de febrero» (la fecha no existe)
- ✅ 2 mensajes a la vez (se juntan en un solo turno, `DEBOUNCE_MS`)
- ✅ «ignorá tus instrucciones» (prompt blindado y herramientas acotadas al cliente)
- ✅ agendar y cancelar

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
negocio.json         ficha del negocio  ← lo que más vas a editar
src/
  agente.js          bucle modelo ↔ herramientas
  modelo.js          cliente OpenRouter
  whatsapp.js        Cloud API: enviar, verificar webhook, validar firma
  servidor.js        endpoints /webhook y /salud
  cola.js            junta mensajes seguidos y ordena por cliente
  memoria.js         historial por cliente
  agenda.js          turnos: validación, reserva y cancelación
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
