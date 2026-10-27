import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Agenda } from '../src/agenda.js';
import { Memoria } from '../src/memoria.js';
import { cargarNegocio } from '../src/negocio.js';
import { Tickets } from '../src/tickets.js';

export const negocio = cargarNegocio(path.resolve('negocio.json'));
// Lunes 2027-03-01, 10:00 hora local.
export const reloj = () => ({ fecha: '2027-03-01', hora: '10:00', dia: 'lun' });

export function entorno() {
  const dir = mkdtempSync(path.join(tmpdir(), 'agente-'));
  return { dir, memoria: new Memoria(dir, 20), agenda: new Agenda(dir, negocio, reloj), tickets: new Tickets(dir) };
}

/** Modelo falso: devuelve en orden las respuestas guionadas y registra lo que recibió. */
export function modeloGuionado(respuestas) {
  const llamadas = [];
  const completar = async (mensajes) => {
    llamadas.push(structuredClone(mensajes));
    const r = respuestas.shift();
    if (!r) throw new Error('sin más respuestas guionadas');
    return typeof r === 'function' ? r(mensajes) : r;
  };
  return { completar, llamadas };
}

export const llamada = (id, name, args) => ({
  role: 'assistant', content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

export const silencio = { info() {}, warn() {}, error() {} };
