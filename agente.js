import { crearAgente } from './src/agente.js';
import { Agenda } from './src/agenda.js';
import { crearCola } from './src/cola.js';
import { config, faltantes } from './src/config.js';
import { Memoria } from './src/memoria.js';
import { crearModelo } from './src/modelo.js';
import { cargarNegocio } from './src/negocio.js';
import { crearServidor } from './src/servidor.js';
import { crearWhatsApp } from './src/whatsapp.js';

const sinConfigurar = faltantes(['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'OPENROUTER_API_KEY']);
if (sinConfigurar.length) {
  console.error(`Faltan variables en .env: ${sinConfigurar.join(', ')} (mirá .env.example)`);
  process.exit(1);
}

const negocio = cargarNegocio(config.negocioFile);
const memoria = new Memoria(config.dataDir, config.maxHistorial);
const agenda = new Agenda(config.dataDir, negocio);
const whatsapp = crearWhatsApp(config.whatsapp);
const responder = crearAgente({ negocio, memoria, agenda, completar: crearModelo(config.openrouter) });

const cola = crearCola(async (telefono, texto) => {
  const respuesta = await responder(telefono, texto);
  console.info(`[saliente] ${telefono}: ${respuesta}`);
  await whatsapp.enviarTexto(telefono, respuesta);
}, { esperaMs: config.debounceMs });

const servidor = crearServidor({ config, cola, whatsapp });
servidor.listen(config.port, () => {
  console.info(`🤖 Agente de ${negocio.nombre} escuchando en :${config.port} (modelo ${config.openrouter.modelo})`);
  console.info(`   Webhook: https://TU-DOMINIO/webhook`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, async () => {
    console.info('Apagando: terminando respuestas pendientes…');
    servidor.close();
    await cola.drenar();
    process.exit(0);
  });
}
