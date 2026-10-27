import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearPanel } from '../src/panel.js';
import { crearServidor } from '../src/servidor.js';
import { CARLOS, entorno, LUCIA, MARTIN, silencio } from './ayuda.js';

async function levantar() {
  const env = entorno();
  const encolados = [];
  const panel = crearPanel({ usuario: 'admin', clave: 'secreta', ...env });
  const config = { openrouter: { modelo: 'x' }, whatsapp: { verifyToken: 'vt', appSecret: '' } };
  const cola = { agregar: (tel, t) => encolados.push([tel, t]) };
  const whatsapp = { ...env.whatsapp, marcarLeido: async () => {} };
  const srv = crearServidor({ config, cola, whatsapp, despacho: env.despacho, panel, log: silencio }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const auth = { Authorization: `Basic ${Buffer.from('admin:secreta').toString('base64')}` };
  return { ...env, srv, base, auth, encolados };
}

test('panel: pide clave, importa CSV, registra pagos y asigna órdenes', async () => {
  const p = await levantar();
  try {
    assert.equal((await fetch(`${p.base}/panel`)).status, 401);
    const html = await fetch(`${p.base}/panel`, { headers: p.auth });
    assert.match(await html.text(), /Panel del agente/);

    const csv = 'numeroCliente;nombre;dni;telefono;zona;saldo\n20001;Nuevo Cliente;123;3510001111;Centro;5.000\n';
    const imp = await (await fetch(`${p.base}/api/clientes/importar`, { method: 'POST', body: csv, headers: p.auth })).json();
    assert.deepEqual(imp, { nuevos: 1, actualizados: 0, total: 3 });

    const pago = await fetch(`${p.base}/api/clientes/20001/pago`, { method: 'POST', body: JSON.stringify({ importe: '5.000' }), headers: p.auth });
    assert.equal((await pago.json()).saldo, 0);

    const o = p.sistema.crearOrden({ clase: 'reparacion', tipo: 'lento', telefono: LUCIA, nombre: 'Lucía', direccion: 'X 1', zona: 'Centro' });
    const asignar = await fetch(`${p.base}/api/ordenes/${o.numero}`, { method: 'POST', body: JSON.stringify({ accion: 'asignar', tecnico: MARTIN }), headers: p.auth });
    assert.equal((await asignar.json()).tecnico.nombre, 'Martín (técnico)');
    assert.equal(p.whatsapp.a(MARTIN).length, 1);

    const resumen = await (await fetch(`${p.base}/api/resumen`, { headers: p.auth })).json();
    assert.equal(resumen.ordenes[0].numero, o.numero);
    assert.equal(resumen.tecnicos.find((t) => t.telefono === MARTIN).abiertas, 1);
  } finally {
    p.srv.close();
  }
});

test('webhook: los mensajes de técnicos van al despacho, no a la IA', async () => {
  const p = await levantar();
  const mensaje = (from, body) => ({ entry: [{ changes: [{ value: { messages: [{ id: `${from}-${body}`, from, type: 'text', text: { body } }] } }] }] });
  try {
    await fetch(`${p.base}/webhook`, { method: 'POST', body: JSON.stringify(mensaje(CARLOS, 'mis')) });
    await fetch(`${p.base}/webhook`, { method: 'POST', body: JSON.stringify(mensaje(LUCIA, 'hola')) });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(p.encolados, [[LUCIA, 'hola']]);
    assert.match(p.whatsapp.a(CARLOS)[0], /No tenés órdenes abiertas/);
  } finally {
    p.srv.close();
  }
});
