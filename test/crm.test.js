import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { crearAgente } from '../src/agente.js';
import { crearAvisoCrm, fuenteCrm, normalizarCliente } from '../src/clientes.js';
import { CARLOS, entorno, llamada, modeloGuionado, negocio, silencio } from './ayuda.js';

/** VPS falso que imita un servidor de saldos. */
async function vpsFalso(responder) {
  const pedidos = [];
  const srv = http.createServer(async (req, res) => {
    let body = '';
    for await (const p of req) body += p;
    const url = new URL(req.url, 'http://x');
    pedidos.push({ metodo: req.method, ruta: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: req.headers.authorization });
    const [status, contenido, tipo = 'application/json'] = responder(url, body);
    res.writeHead(status, { 'Content-Type': tipo }).end(typeof contenido === 'string' ? contenido : JSON.stringify(contenido));
  }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, pedidos, cerrar: () => srv.close() };
}

const REGISTRO = { data: { ID_Cliente: 5501, Razon_Social: 'Lucía Paz', Documento: '30.111.222', Celular: '351-555-1234', Domicilio: 'Obispo Trejo 300', Barrio: 'Nueva Córdoba', Plan: 'Fibra 300', Estado: 'ACTIVO', Deuda: '24.000,00', Vencimiento: '2027-03-10' } };

test('normaliza respuestas con nombres de campo distintos', () => {
  const c = normalizarCliente(REGISTRO);
  assert.deepEqual(
    { n: c.numeroCliente, nombre: c.nombre, dni: c.dni, tel: c.telefono, saldo: c.saldo, zona: c.zona, estado: c.estado },
    { n: '5501', nombre: 'Lucía Paz', dni: '30111222', tel: '3515551234', saldo: 24000, zona: 'Nueva Córdoba', estado: 'activo' },
  );
  assert.equal(normalizarCliente([{ dni: 1, saldo: 10, estado: 'Suspendido por mora' }]).estado, 'suspendido');
  assert.equal(normalizarCliente({ encontrado: false }), null);
  assert.equal(normalizarCliente({ x: { y: 1 }, deuda_total: 5 }, { saldo: 'x.y' }).saldo, 1);
});

test('consulta por DNI y verifica con el teléfono que devuelve el CRM', async () => {
  const vps = await vpsFalso((url) => (url.searchParams.get('dni') === '30111222' ? [200, REGISTRO] : [404, 'no']));
  try {
    const crm = fuenteCrm({ url: `${vps.base}/saldo?dni={dni}`, token: 'abc' });
    assert.equal(crm.porTelefono, false);
    const ok = await crm.buscar({ telefono: '5493515551234', dni: '30111222' });
    assert.equal(ok.verificado, true);
    assert.equal(ok.cliente.saldo, 24000);
    assert.equal(vps.pedidos[0].auth, 'Bearer abc');

    // Desde otro WhatsApp, con solo el DNI, no alcanza: pide también número de cliente.
    assert.equal((await crm.buscar({ telefono: '5491100000000', dni: '30111222' })).pedirAmbos, true);
    assert.equal((await crm.buscar({ telefono: '5491100000000', dni: '30111222', numeroCliente: '5501' })).verificado, true);
    assert.equal((await crm.buscar({ telefono: '5491100000000', dni: '99999999', numeroCliente: '5501' })).cliente, null);
  } finally { vps.cerrar(); }
});

test('consulta directa por el número de WhatsApp (sin 54 9)', async () => {
  const vps = await vpsFalso((url) => (url.searchParams.get('tel') === '3515551234' ? [200, REGISTRO] : [404, '']));
  try {
    const r = await fuenteCrm({ url: `${vps.base}/saldo?tel={telefono}` }).buscar({ telefono: '5493515551234' });
    assert.equal(r.cliente.nombre, 'Lucía Paz');
  } finally { vps.cerrar(); }
});

test('si el VPS responde texto, se le pasa tal cual al agente; si se cae, avisa', async () => {
  const vps = await vpsFalso(() => [200, 'Cliente: Lucía Paz\nSaldo: $24.000\nVence: 10/03', 'text/plain']);
  try {
    const r = await fuenteCrm({ url: `${vps.base}/s?dni={dni}&c={numeroCliente}` }).buscar({ dni: '1', numeroCliente: '2' });
    assert.match(r.cliente.texto, /Saldo: \$24\.000/);
    assert.deepEqual((await fuenteCrm({ url: `${vps.base}/s?dni={dni}&c={numeroCliente}` }).buscar({ dni: '1' })).faltan, ['numeroCliente']);
  } finally { vps.cerrar(); }
  const caido = await fuenteCrm({ url: 'http://127.0.0.1:1/saldo?dni={dni}', timeoutMs: 500 }).buscar({ dni: '1', numeroCliente: '2' });
  assert.match(caido.error, /no responde/);
});

test('POST con JSON si el VPS lo pide así', async () => {
  const vps = await vpsFalso(() => [200, REGISTRO]);
  try {
    await fuenteCrm({ url: `${vps.base}/consulta`, metodo: 'POST' }).buscar({ telefono: '549351', dni: '30111222', numeroCliente: '5501' });
    assert.deepEqual(JSON.parse(vps.pedidos[0].body), { dni: '30111222', numeroCliente: '5501', telefono: '' });
  } finally { vps.cerrar(); }
});

test('flujo completo con el CRM: saldo actualizado y falla despachada con los datos del CRM', async () => {
  let deuda = '24.000';
  const vps = await vpsFalso((url) => {
    if (url.pathname === '/ordenes') return [200, { ok: true }];
    return url.searchParams.get('dni') === '30111222' ? [200, { data: { ...REGISTRO.data, Deuda: deuda } }] : [404, ''];
  });
  const env = entorno();
  env.sistema.alCambiar = crearAvisoCrm({ url: `${vps.base}/ordenes` }, fetch, silencio);
  const clientes = fuenteCrm({ url: `${vps.base}/saldo?dni={dni}` });
  const modelo = modeloGuionado([
    llamada('t1', 'identificar_cliente'),
    (m) => { assert.match(JSON.parse(m.at(-1).content).nota, /DNI/); return { role: 'assistant', content: '¿Tu DNI?' }; },
    llamada('t2', 'identificar_cliente', { dni: '30111222' }),
    llamada('t3', 'consultar_deuda'),
    (m) => { assert.equal(JSON.parse(m.at(-1).content).saldo, 24000); return { role: 'assistant', content: 'Debés $24.000.' }; },
    llamada('t4', 'consultar_deuda'),
    (m) => { assert.equal(JSON.parse(m.at(-1).content).saldo, 0); return { role: 'assistant', content: 'Estás al día.' }; },
    llamada('t5', 'reportar_falla', { tipo: 'sin_servicio', descripcion: 'no anda', diagnostico: 'LOS rojo' }),
    (m) => { assert.equal(JSON.parse(m.at(-1).content).tecnicoAsignado, 'Carlos (técnico)'); return { role: 'assistant', content: 'Orden #1001.' }; },
  ]);
  const responder = crearAgente({ ...env, negocio, clientes, completar: modelo.completar, log: silencio });
  const lucia = '5493515551234';
  try {
    await responder(lucia, 'cuánto debo');
    await responder(lucia, '30111222');
    deuda = '0'; // pagó: el próximo pedido trae el saldo nuevo del CRM
    await responder(lucia, 'ya pagué, fijate');
    await responder(lucia, 'igual no tengo internet');

    const orden = env.sistema.orden(1001);
    assert.equal(orden.numeroCliente, '5501');
    assert.equal(orden.direccion, 'Obispo Trejo 300');
    assert.match(env.whatsapp.a(CARLOS)[0], /Lucía Paz \(cliente 5501\)/);
    await new Promise((r) => setTimeout(r, 100));
    const avisos = vps.pedidos.filter((p) => p.ruta === '/ordenes').map((p) => JSON.parse(p.body));
    assert.equal(avisos[0].evento, 'orden_creada');
    assert.equal(avisos[0].orden.numero, 1001);
    assert.equal(avisos.at(-1).orden.estado, 'asignada');
  } finally { vps.cerrar(); }
});
