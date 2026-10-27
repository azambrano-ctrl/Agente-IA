import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorHerramienta } from '../src/errores.js';
import { consultarCobertura, proximosDias } from '../src/negocio.js';
import { entorno, negocio } from './ayuda.js';

const visita = (extra) => ({ fecha: '2027-03-04', franja: '14:00-16:00', tipo: 'visita técnica', nombre: 'Lucía Paz', direccion: 'Obispo Trejo 300', telefono: '549111', ...extra });

test('franjas de 2 h dentro del horario de visitas', () => {
  const { agenda } = entorno();
  assert.deepEqual(agenda.franjasDelDia('2027-03-02'), ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00']);
  assert.deepEqual(agenda.franjasDelDia('2027-03-06'), ['09:00-11:00', '11:00-13:00']);
});

test('visita el 31 de febrero: la fecha no existe', () => {
  const { agenda } = entorno();
  assert.throws(() => agenda.verAgenda('2027-02-31'), (e) => e instanceof ErrorHerramienta && /no existe/.test(e.message));
});

test('rechaza fechas pasadas, domingos y formatos inválidos', () => {
  const { agenda } = entorno();
  assert.throws(() => agenda.verAgenda('2027-02-26'), /ya pasó/);
  assert.throws(() => agenda.verAgenda('2027-03-07'), /No hay visitas/);
  assert.throws(() => agenda.verAgenda('jueves'), /Formato/);
});

test('hoy no ofrece franjas que ya empezaron', () => {
  const { agenda } = entorno();
  assert.equal(agenda.verAgenda('2027-03-01').libres[0], '12:00-14:00');
});

test('cada franja admite tantas visitas como cuadrillas', () => {
  const { agenda } = entorno();
  agenda.crearVisita(visita());
  agenda.crearVisita(visita({ telefono: '549222' }));
  assert.ok(agenda.verAgenda('2027-03-04').completas.includes('14:00-16:00'));
  assert.throws(() => agenda.crearVisita(visita({ telefono: '549333' })), /no está disponible/);
});

test('agendar y cancelar una visita', () => {
  const { agenda } = entorno();
  const v = agenda.crearVisita(visita({ tipo: 'instalación' }));
  assert.deepEqual(agenda.visitasDe('549111').map((x) => x.id), [v.id]);
  assert.throws(() => agenda.cancelarVisita(v.id, '549999'), /No encontré/); // otro cliente
  agenda.cancelarVisita(v.id, '549111');
  assert.equal(agenda.visitasDe('549111').length, 0);
});

test('pide dirección, tipo válido y franja de la grilla', () => {
  const { agenda } = entorno();
  assert.throws(() => agenda.crearVisita(visita({ direccion: '' })), /dirección/);
  assert.throws(() => agenda.crearVisita(visita({ tipo: 'pintura' })), /Tipo de visita/);
  assert.throws(() => agenda.crearVisita(visita({ franja: '14:30-16:30' })), /no es una franja/);
});

test('cobertura: reconoce barrios sin importar tildes y avisa cortes de la zona', () => {
  const n = { ...negocio, avisos: [{ zona: 'Alberdi', mensaje: 'Corte de fibra, se estima volver a las 18 h' }] };
  assert.deepEqual(consultarCobertura(n, 'vivo en nueva cordoba'), { cubierto: true, zona: 'Nueva Córdoba', avisos: [] });
  assert.equal(consultarCobertura(n, 'Barrio Alberdi').avisos[0].mensaje, 'Corte de fibra, se estima volver a las 18 h');
  assert.equal(consultarCobertura(n, 'Villa Allende').cubierto, 'no_confirmado');
});

test('tickets numerados y solo visibles para su dueño', () => {
  const { tickets } = entorno();
  const t1 = tickets.crear({ tipo: 'soporte', descripcion: 'sin internet, LOS rojo', telefono: '549111', cliente: {} });
  const t2 = tickets.crear({ tipo: 'baja', descripcion: 'se muda', telefono: '549222', cliente: {} });
  assert.equal(t2.numero, t1.numero + 1);
  assert.deepEqual(tickets.de('549111').map((t) => t.numero), [t1.numero]);
  assert.throws(() => tickets.crear({ tipo: 'cualquiera', descripcion: 'x', telefono: '1' }), ErrorHerramienta);
});

test('próximos días para traducir fechas relativas', () => {
  assert.equal(proximosDias('2027-02-26', 4), 'viernes 2027-02-26, sábado 2027-02-27, domingo 2027-02-28, lunes 2027-03-01');
});
