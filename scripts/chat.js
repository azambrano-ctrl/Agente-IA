// Paso 7: probá el agente en la terminal, sin WhatsApp.  npm run chat
import readline from 'node:readline/promises';
import { crearAgente } from '../src/agente.js';
import { Agenda } from '../src/agenda.js';
import { config, faltantes } from '../src/config.js';
import { Memoria } from '../src/memoria.js';
import { crearModelo } from '../src/modelo.js';
import { cargarNegocio } from '../src/negocio.js';
import { Tickets } from '../src/tickets.js';

if (faltantes(['OPENROUTER_API_KEY']).length) {
  console.error('Falta OPENROUTER_API_KEY en .env');
  process.exit(1);
}

const telefono = process.argv[2] ?? 'chat-local';
const negocio = cargarNegocio(config.negocioFile);
const memoria = new Memoria(config.dataDir, config.maxHistorial);
const agenda = new Agenda(config.dataDir, negocio);
const responder = crearAgente({
  negocio, memoria, agenda, tickets: new Tickets(config.dataDir),
  notificar: async (t) => console.log(`\x1b[33m[aviso al equipo] ${t}\x1b[0m`),
  completar: crearModelo(config.openrouter),
  log: { info: (...a) => console.log('\x1b[2m', ...a, '\x1b[0m'), error: console.error },
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Chateando con el agente de ${negocio.nombre} como "${telefono}". /borrar limpia la memoria, /salir termina.\n`);
while (true) {
  const texto = (await rl.question('vos › ')).trim();
  if (!texto) continue;
  if (texto === '/salir') break;
  if (texto === '/borrar') { memoria.borrar(telefono); console.log('(memoria borrada)\n'); continue; }
  console.log(`agente › ${await responder(telefono, texto)}\n`);
}
rl.close();
