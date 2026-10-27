import http from 'node:http';
import { extraerMensajes, firmaValida, verificarWebhook } from './whatsapp.js';

const SOLO_TEXTO = 'Por ahora solo puedo leer mensajes de texto 🙂 ¿Me lo escribís?';

export function crearServidor({ config, cola, whatsapp, log = console }) {
  const vistos = new Set();
  const yaVisto = (id) => {
    if (vistos.has(id)) return true;
    vistos.add(id);
    if (vistos.size > 5000) vistos.delete(vistos.values().next().value);
    return false;
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const responder = (status, body = '', tipo = 'text/plain') => {
      res.writeHead(status, { 'Content-Type': tipo }).end(body);
    };

    if (req.method === 'GET' && url.pathname === '/salud') {
      return responder(200, JSON.stringify({ ok: true, modelo: config.openrouter.modelo }), 'application/json');
    }

    if (url.pathname !== '/webhook') return responder(404, 'no encontrado');

    if (req.method === 'GET') {
      const challenge = verificarWebhook(url.searchParams, config.whatsapp.verifyToken);
      return challenge ? responder(200, challenge) : responder(403, 'token inválido');
    }

    if (req.method !== 'POST') return responder(405, 'método no permitido');

    const partes = [];
    for await (const parte of req) partes.push(parte);
    const crudo = Buffer.concat(partes);
    if (!firmaValida(crudo, req.headers['x-hub-signature-256'], config.whatsapp.appSecret)) {
      log.warn?.('[webhook] firma inválida');
      return responder(401, 'firma inválida');
    }

    let payload;
    try { payload = JSON.parse(crudo.toString('utf8')); } catch { return responder(400, 'json inválido'); }

    // Meta reintenta si no contestamos rápido: respondemos 200 ya y procesamos después.
    responder(200, 'ok');

    for (const m of extraerMensajes(payload)) {
      if (yaVisto(m.id)) continue;
      log.info?.(`[entrante] ${m.de} (${m.tipo}): ${m.texto ?? '-'}`);
      whatsapp.marcarLeido(m.id).catch(() => {});
      if (m.texto) cola.agregar(m.de, m.texto);
      else whatsapp.enviarTexto(m.de, SOLO_TEXTO).catch((e) => log.error?.('[whatsapp]', e.message));
    }
  });
}
