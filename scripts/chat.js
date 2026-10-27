// Paso 7: probá el agente en la terminal, sin WhatsApp.  npm run chat
import readline from 'node:readline/promises';
import { crearAgente } from '../src/agente.js';
import { Agenda } from '../src/agenda.js';
import { config, faltantes } from '../src/config.js';
import { Memoria } from '../src/memoria.js';
import { crearModelo } from '../src/modelo.js';
import { cargarNegocio } from '../src/negocio.js';
import { crearDespacho } from '../src/despacho.js';
import { fuenteCrm, fuenteLocal } from '../src/clientes.js';
import { Sistema } from '../src/sistema.js';

if (faltantes(['OPENROUTER_API_KEY']).length) {
  console.error('Falta OPENROUTER_API_KEY en .env');
  process.exit(1);
}

const telefono = process.argv[2] ?? 'chat-local';
const negocio = cargarNegocio(config.negocioFile);
const memoria = new Memoria(config.dataDir, config.maxHistorial);
const agenda = new Agenda(config.dataDir, negocio);
const sistema = new Sistema(config.dataDir);
const amarillo = (t) => console.log(`\x1b[33m${t}\x1b[0m`);
const notificar = async (t) => amarillo(`[aviso a la oficina] ${t}`);
// En el chat local los WhatsApp a técnicos y clientes se muestran en pantalla.
const whatsapp = { enviarTexto: async (to, t) => amarillo(`[WhatsApp a ${to}]\n${t}`), enviarPlantilla: async () => {} };
const despacho = crearDespacho({ negocio, sistema, memoria, whatsapp, notificarAdmin: notificar });
const clientes = config.crm.saldoUrl ? fuenteCrm({ url: config.crm.saldoUrl, ...config.crm }) : fuenteLocal(sistema);
const responder = crearAgente({
  negocio, memoria, agenda, sistema, despacho, clientes, notificar,
  completar: crearModelo(config.openrouter),
  log: { info: (...a) => console.log('\x1b[2m', ...a, '\x1b[0m'), error: console.error },
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Chateando con el agente de ${negocio.nombre} como "${telefono}".`);
console.log('Probá como cliente del ejemplo: npm run importar -- data/clientes-ejemplo.csv  y  npm run chat -- 5493515551234');
console.log('/tecnico <tel> <comando> simula a un técnico (ej. /tecnico 5493510000001 TOMO 1001). /borrar limpia la memoria, /salir termina.\n');
while (true) {
  const texto = (await rl.question('vos › ')).trim();
  if (!texto) continue;
  if (texto === '/salir') break;
  if (texto === '/borrar') { memoria.borrar(telefono); console.log('(memoria borrada)\n'); continue; }
  if (texto.startsWith('/tecnico ')) {
    const [, tel, ...cmd] = texto.split(' ');
    console.log(`técnico › ${await despacho.comandoTecnico(tel, cmd.join(' '))}\n`);
    continue;
  }
  console.log(`agente › ${await responder(telefono, texto)}\n`);
}
rl.close();
