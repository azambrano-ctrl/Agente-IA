import { createHmac, timingSafeEqual } from 'node:crypto';

/** Paso 2: WhatsApp Cloud API (Meta). */
export function crearWhatsApp({ token, phoneNumberId, apiVersion }, fetchFn = fetch) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const llamar = async (body) => {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
    return res.json();
  };
  return {
    enviarTexto: (to, texto) => llamar({ to, type: 'text', text: { body: texto, preview_url: false } }),
    marcarLeido: (messageId) => llamar({ status: 'read', message_id: messageId }),
  };
}

/** Verificación del webhook (GET): devuelve el challenge si el token coincide. */
export function verificarWebhook(query, verifyToken) {
  if (query.get('hub.mode') === 'subscribe' && verifyToken && query.get('hub.verify_token') === verifyToken) {
    return query.get('hub.challenge');
  }
  return null;
}

/** Valida X-Hub-Signature-256 con el App Secret. Si no hay secret configurado, no valida. */
export function firmaValida(cuerpoCrudo, firma, appSecret) {
  if (!appSecret) return true;
  if (!firma?.startsWith('sha256=')) return false;
  const esperada = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(cuerpoCrudo).digest('hex')}`);
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Extrae los mensajes entrantes de un payload de webhook. */
export function extraerMensajes(payload) {
  const salida = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const nombres = Object.fromEntries((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages ?? []) {
        let texto = null;
        if (m.type === 'text') texto = m.text?.body;
        else if (m.type === 'button') texto = m.button?.text;
        else if (m.type === 'interactive') {
          texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
        }
        salida.push({ id: m.id, de: m.from, nombre: nombres[m.from] ?? null, tipo: m.type, texto });
      }
    }
  }
  return salida;
}
