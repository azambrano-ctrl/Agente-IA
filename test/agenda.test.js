import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErrorAgenda } from '../src/agenda.js';
import { entorno } from './ayuda.js';

test('genera turnos cada 45 min dentro del horario (8 a 18 h)', () => {
  const { agenda } = entorno();
  const turnos = agenda.turnosDelDia('2027-03-02');
  assert.equal(turnos[0], '08:00');
  assert.equal(turnos[1], '08:45');
  assert.equal(turnos.at(-1), '17:00');
});

test('turno el 31 de febrero: la fecha no existe', () => {
  const { agenda } = entorno();
  assert.throws(() => agenda.verAgenda('2027-02-31'), (e) => e instanceof ErrorAgenda && /no existe/.test(e.message));
});

test('rechaza fechas pasadas, domingos y formatos inválidos', () => {
  const { agenda } = entorno();
  assert.throws(() => agenda.verAgenda('2027-02-26'), /ya pasó/);
  assert.throws(() => agenda.verAgenda('2027-03-07'), /cerrado/);
  assert.throws(() => agenda.verAgenda('jueves'), /Formato/);
});

test('hoy no ofrece horarios que ya pasaron', () => {
  const { agenda } = entorno();
  const { libres } = agenda.verAgenda('2027-03-01');
  assert.ok(!libres.includes('09:30'));
  assert.ok(!libres.includes('10:00') || libres[0] > '10:00');
  assert.equal(libres[0], '10:15');
});

test('agendar y cancelar', () => {
  const { agenda } = entorno();
  const cita = agenda.crearCita({ fecha: '2027-03-04', hora: '16:15', servicio: 'limpieza', nombre: 'Lucía Paz', telefono: '549111' });
  assert.equal(cita.estado, 'confirmada');
  assert.ok(agenda.verAgenda('2027-03-04').ocupados.includes('16:15'));
  assert.throws(() => agenda.crearCita({ fecha: '2027-03-04', hora: '16:15', nombre: 'Otro', telefono: '549222' }), /no está disponible/);

  assert.deepEqual(agenda.citasDe('549111').map((c) => c.id), [cita.id]);
  agenda.cancelarCita(cita.id, '549111');
  assert.ok(agenda.verAgenda('2027-03-04').libres.includes('16:15'));
  assert.equal(agenda.citasDe('549111').length, 0);
});

test('un cliente no puede cancelar el turno de otro', () => {
  const { agenda } = entorno();
  const cita = agenda.crearCita({ fecha: '2027-03-04', hora: '09:30', nombre: 'Lucía', telefono: '549111' });
  assert.throws(() => agenda.cancelarCita(cita.id, '549999'), /No encontré/);
});

test('rechaza horarios fuera de grilla y servicios inexistentes', () => {
  const { agenda } = entorno();
  assert.throws(() => agenda.crearCita({ fecha: '2027-03-04', hora: '09:10', nombre: 'A', telefono: '1' }), /no es un horario/);
  assert.throws(() => agenda.crearCita({ fecha: '2027-03-04', hora: '09:30', servicio: 'cirugía', nombre: 'A', telefono: '1' }), /Servicio desconocido/);
});

test('próximos días para traducir fechas relativas', async () => {
  const { proximosDias } = await import('../src/negocio.js');
  assert.match(proximosDias('2027-02-26', 4), /^viernes 2027-02-26, sábado 2027-02-27, domingo 2027-02-28, lunes 2027-03-01$/);
});
