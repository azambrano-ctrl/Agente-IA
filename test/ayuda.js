import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Agenda } from '../src/agenda.js';
import { crearDespacho } from '../src/despacho.js';
import { Memoria } from '../src/memoria.js';
import { cargarNegocio } from '../src/negocio.js';
import { Sistema } from '../src/sistema.js';

export const negocio = cargarNegocio(path.resolve('negocio.json'));
// Lunes 2027-03-01, 10:00 hora local.
export const reloj = () => ({ fecha: '2027-03-01', hora: '10:00', dia: 'lun' });

export const CLIENTES = [
  { numeroCliente: '10234', nombre: 'Lucía Paz', dni: '30111222', telefono: '3515551234', direccion: 'Obispo Trejo 300', zona: 'Nueva Córdoba', plan: 'Fibra 300', estado: 'activo', saldo: '24.000', vencimiento: '2027-03-10' },
  { numeroCliente: '10235', nombre: 'Jorge Ríos', dni: '28999888', telefono: '3515559876', direccion: 'Rosario de Santa Fe 1200', zona: 'General Paz', plan: 'Fibra 100', estado: 'suspendido', saldo: '36000', vencimiento: '2027-01-10' },
];
export const LUCIA = '5493515551234'; // wa_id de WhatsApp para 3515551234
export const CARLOS = '5493510000001'; // técnico de Nueva Córdoba
export const MARTIN = '5493510000002'; // técnico de General Paz

/** WhatsApp falso que registra lo enviado. */
export function whatsappFalso({ ventanaCerrada = [] } = {}) {
  const enviados = [];
  return {
    enviados,
    a: (tel) => enviados.filter((e) => e.to === tel).map((e) => e.texto ?? `[plantilla ${e.plantilla}]`),
    enviarTexto: async (to, texto) => {
      if (ventanaCerrada.includes(to)) throw new Error('WhatsApp 400: {"error":{"code":131047,"message":"Re-engagement message"}}');
      enviados.push({ to, texto });
    },
    enviarPlantilla: async (to, plantilla, idioma, params) => { enviados.push({ to, plantilla, params }); },
  };
}

export function entorno(opciones = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'agente-'));
  const memoria = new Memoria(dir, 20);
  const agenda = new Agenda(dir, negocio, reloj);
  const sistema = new Sistema(dir);
  sistema.importarClientes(CLIENTES);
  const whatsapp = whatsappFalso(opciones);
  const avisosOficina = [];
  const notificar = async (t) => { avisosOficina.push(t); };
  const despacho = crearDespacho({
    negocio, sistema, memoria, whatsapp, notificarAdmin: notificar, log: silencio,
    plantilla: { nombre: 'nueva_orden', idioma: 'es_AR' },
  });
  return { dir, memoria, agenda, sistema, whatsapp, despacho, notificar, avisosOficina };
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

export const llamada = (id, name, args = {}) => ({
  role: 'assistant', content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

export const silencio = { info() {}, warn() {}, error() {} };
