import { watchFile } from 'node:fs';
import { crearAgente } from './src/agente.js';
import { Agenda } from './src/agenda.js';
import { crearCola } from './src/cola.js';
import { config, faltantes } from './src/config.js';
import { Memoria } from './src/memoria.js';
import { crearModelo } from './src/modelo.js';
import { cargarNegocio } from './src/negocio.js';
import { crearDespacho } from './src/despacho.js';
import { crearPanel } from './src/panel.js';
import { crearServidor } from './src/servidor.js';
import { Sistema } from './src/sistema.js';
import { crearWhatsApp } from './src/whatsapp.js';

const sinConfigurar = faltantes(['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'OPENROUTER_API_KEY']);
if (sinConfigurar.length) {
  console.error(`Faltan variables en .env: ${sinConfigurar.join(', ')} (mirá .env.example)`);
  process.exit(1);
}

const negocio = cargarNegocio(config.negocioFile);
// Editás negocio.json (ej. un aviso de corte) y se aplica sin reiniciar.
watchFile(config.negocioFile, { interval: 2000 }, () => {
  try {
    Object.assign(negocio, cargarNegocio(config.negocioFile));
    console.info('[negocio] negocio.json recargado');
  } catch (e) {
    console.error('[negocio] negocio.json inválido, sigo con la versión anterior:', e.message);
  }
});

const memoria = new Memoria(config.dataDir, config.maxHistorial);
const agenda = new Agenda(config.dataDir, negocio);
const sistema = new Sistema(config.dataDir);
const whatsapp = crearWhatsApp(config.whatsapp);

// Avisa a la oficina de órdenes y gestiones (requiere que hayan escrito al número en las últimas 24 h).
const notificar = async (texto) => {
  for (const admin of config.adminWhatsapp) {
    await whatsapp.enviarTexto(admin, texto).catch((e) => console.error('[notificar]', e.message));
  }
};

const despacho = crearDespacho({ negocio, sistema, memoria, whatsapp, plantilla: config.whatsapp.plantillaTecnico, notificarAdmin: notificar });
const panel = crearPanel({ ...config.panel, sistema, despacho, agenda });
const responder = crearAgente({ negocio, memoria, agenda, sistema, despacho, notificar, completar: crearModelo(config.openrouter) });

const cola = crearCola(async (telefono, texto) => {
  const respuesta = await responder(telefono, texto);
  console.info(`[saliente] ${telefono}: ${respuesta}`);
  await whatsapp.enviarTexto(telefono, respuesta);
}, { esperaMs: config.debounceMs });

const servidor = crearServidor({ config, cola, whatsapp, despacho, panel });
servidor.listen(config.port, () => {
  console.info(`🤖 Agente de ${negocio.nombre} escuchando en :${config.port} (modelo ${config.openrouter.modelo})`);
  console.info(`   Webhook: https://TU-DOMINIO/webhook · Panel: https://TU-DOMINIO/panel${config.panel.clave ? '' : ' (deshabilitado: falta PANEL_CLAVE)'}`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, async () => {
    console.info('Apagando: terminando respuestas pendientes…');
    servidor.close();
    await cola.drenar();
    process.exit(0);
  });
}
