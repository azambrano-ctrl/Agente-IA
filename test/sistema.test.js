import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsearCsv } from '../src/csv.js';
import { mismoTelefono } from '../src/telefono.js';
import { CARLOS, entorno, LUCIA, MARTIN } from './ayuda.js';

test('CSV de Excel con ";" , comillas y montos con punto de miles', () => {
  const filas = parsearCsv('﻿numeroCliente;nombre;saldo\r\n1;"Paz; Lucía";24.000\r\n2;Ana;"1.234,50"\r\n');
  assert.deepEqual(filas, [{ numeroCliente: '1', nombre: 'Paz; Lucía', saldo: '24.000' }, { numeroCliente: '2', nombre: 'Ana', saldo: '1.234,50' }]);
  const { sistema } = entorno();
  sistema.importarClientes(filas);
  assert.equal(sistema.cliente('1').saldo, 24000);
  assert.equal(sistema.cliente('2').saldo, 1234.5);
});

test('el número de WhatsApp coincide con el teléfono cargado sin 54 9', () => {
  assert.ok(mismoTelefono('5493515551234', '351 555-1234'));
  assert.ok(!mismoTelefono('5493515551234', '3515551235'));
  const { sistema } = entorno();
  assert.equal(sistema.clientePorTelefono(LUCIA).numeroCliente, '10234');
});

test('identificación fuerte: DNI y número de cliente deben coincidir', () => {
  const { sistema } = entorno();
  assert.equal(sistema.clientePorDatos('30.111.222', '10234').nombre, 'Lucía Paz');
  assert.equal(sistema.clientePorDatos('30111222', '10235'), null);
});

test('registrar pago baja el saldo y reactiva al suspendido', () => {
  const { sistema } = entorno();
  const c = sistema.registrarPago('10235', '36.000');
  assert.equal(c.saldo, 0);
  assert.equal(c.estado, 'activo');
});

const reparacion = (sistema, zona = 'Nueva Córdoba') => sistema.crearOrden({
  clase: 'reparacion', tipo: 'sin_servicio', telefono: LUCIA, numeroCliente: '10234',
  nombre: 'Lucía Paz', direccion: 'Obispo Trejo 300', zona, descripcion: 'sin internet desde ayer',
  datos: { diagnostico: 'LOS rojo, reinició' },
});

test('despacho: elige al técnico de la zona y le manda la orden por WhatsApp', async () => {
  const { sistema, despacho, whatsapp } = entorno();
  const o = reparacion(sistema);
  assert.deepEqual(await despacho.despachar(o), { asignada: true, tecnico: 'Carlos (técnico)' });
  assert.equal(sistema.orden(o.numero).estado, 'asignada');
  const [msg] = whatsapp.a(CARLOS);
  assert.match(msg, new RegExp(`ORDEN #${o.numero}`));
  assert.match(msg, /Obispo Trejo 300/);
  assert.match(msg, /LOS rojo/);
  assert.match(msg, /maps\.google\.com/);
});

test('técnico: TOMO → EN CAMINO → LISTO, avisando al cliente en cada paso', async () => {
  const { sistema, despacho, whatsapp, memoria, avisosOficina } = entorno();
  const o = reparacion(sistema);
  await despacho.despachar(o);

  assert.match(await despacho.comandoTecnico(CARLOS, `tomo ${o.numero}`), /Tomaste/);
  assert.match(await despacho.comandoTecnico(CARLOS, `EN CAMINO ${o.numero}`), /le avisé/);
  assert.match(await despacho.comandoTecnico(CARLOS, `listo ${o.numero} se cambió el conector`), /Cerraste/);

  const orden = sistema.orden(o.numero);
  assert.equal(orden.estado, 'resuelta');
  assert.match(orden.historial.at(-1).nota, /conector/);
  const alCliente = whatsapp.a(LUCIA);
  assert.equal(alCliente.length, 3);
  assert.match(alCliente[1], /va en camino/);
  // El agente se entera de lo que se le dijo al cliente.
  assert.match(memoria.historial(LUCIA).at(-1).content, /cerró tu orden/);
  assert.ok(avisosOficina.some((a) => /resuelta por Carlos/.test(a)));
});

test('técnico: no puede tocar órdenes ajenas y NO PUEDO la reasigna', async () => {
  const { sistema, despacho, whatsapp } = entorno();
  const o = reparacion(sistema);
  await despacho.despachar(o);
  assert.match(await despacho.comandoTecnico(MARTIN, `tomo ${o.numero}`), /no está asignada a vos/);
  assert.match(await despacho.comandoTecnico(CARLOS, `no puedo ${o.numero} estoy en otra zona`), /pasó a Martín/);
  assert.equal(sistema.orden(o.numero).tecnico.nombre, 'Martín (técnico)');
  assert.equal(whatsapp.a(MARTIN).length, 1);
  assert.match(await despacho.comandoTecnico(MARTIN, 'mis'), new RegExp(`#${o.numero}`));
});

test('técnico sin ventana de 24 h: se avisa por plantilla y el detalle sale cuando responde', async () => {
  const { sistema, despacho, whatsapp } = entorno({ ventanaCerrada: [CARLOS] });
  const o = reparacion(sistema);
  await despacho.despachar(o);
  assert.deepEqual(whatsapp.enviados[0], { to: CARLOS, plantilla: 'nueva_orden', params: [String(o.numero), 'Nueva Córdoba'] });
  const r = await despacho.comandoTecnico(CARLOS, 'hola');
  assert.match(r, new RegExp(`ORDEN #${o.numero}`));
  assert.equal(sistema.orden(o.numero).detallePendiente, false);
});
