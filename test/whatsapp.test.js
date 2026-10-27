import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { crearCola } from '../src/cola.js';
import { crearServidor } from '../src/servidor.js';
import { extraerMensajes, firmaValida, verificarWebhook } from '../src/whatsapp.js';
import { silencio } from './ayuda.js';

const payload = (...msgs) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '549111', profile: { name: 'Lucía' } }],
    messages: msgs.map(([id, body]) => ({ id, from: '549111', type: 'text', text: { body } })),
  } }] }],
});

test('verificación del webhook', () => {
  const q = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secreto', 'hub.challenge': '42' });
  assert.equal(verificarWebhook(q, 'secreto'), '42');
  assert.equal(verificarWebhook(q, 'otro'), null);
});

test('firma X-Hub-Signature-256', () => {
  const cuerpo = Buffer.from('{"a":1}');
  const firma = `sha256=${createHmac('sha256', 's3cr3t').update(cuerpo).digest('hex')}`;
  assert.ok(firmaValida(cuerpo, firma, 's3cr3t'));
  assert.ok(!firmaValida(cuerpo, firma, 'otro'));
  assert.ok(!firmaValida(cuerpo, undefined, 's3cr3t'));
});

test('extrae mensajes de texto y marca los no soportados', () => {
  const p = payload(['m1', 'hola']);
  p.entry[0].changes[0].value.messages.push({ id: 'm2', from: '549111', type: 'audio', audio: {} });
  assert.deepEqual(extraerMensajes(p), [
    { id: 'm1', de: '549111', nombre: 'Lucía', tipo: 'text', texto: 'hola' },
    { id: 'm2', de: '549111', nombre: 'Lucía', tipo: 'audio', texto: null },
  ]);
});

test('2 mensajes a la vez: la cola los junta en un solo turno', async () => {
  const turnos = [];
  const cola = crearCola(async (tel, texto) => { turnos.push([tel, texto]); }, { esperaMs: 20, log: silencio });
  cola.agregar('549111', 'hola');
  cola.agregar('549111', '¿tienen turno el jueves?');
  cola.agregar('549222', 'buenas');
  await new Promise((r) => setTimeout(r, 60));
  await cola.drenar();
  assert.deepEqual(turnos.sort(), [['549111', 'hola\n¿tienen turno el jueves?'], ['549222', 'buenas']]);
});

test('servidor: valida firma, ignora duplicados y encola el texto', async () => {
  const encolados = [];
  const config = { openrouter: { modelo: 'x' }, whatsapp: { verifyToken: 'vt', appSecret: 'sec' } };
  const whatsapp = { marcarLeido: async () => {}, enviarTexto: async () => {} };
  const cola = { agregar: (tel, t) => encolados.push([tel, t]) };
  const srv = crearServidor({ config, cola, whatsapp, log: silencio }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const enviar = (obj, secreto = 'sec') => {
    const body = JSON.stringify(obj);
    const firma = `sha256=${createHmac('sha256', secreto).update(body).digest('hex')}`;
    return fetch(`${base}/webhook`, { method: 'POST', body, headers: { 'x-hub-signature-256': firma } });
  };

  try {
    assert.equal((await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=ok`)).status, 200);
    assert.equal((await enviar(payload(['m1', 'hola']), 'mal')).status, 401);
    assert.equal((await enviar(payload(['m1', 'hola']))).status, 200);
    assert.equal((await enviar(payload(['m1', 'hola']))).status, 200); // reintento de Meta
    assert.deepEqual(encolados, [['549111', 'hola']]);
  } finally {
    srv.close();
  }
});
