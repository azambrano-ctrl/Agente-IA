// Prueba la conexión con tu servidor de saldos y muestra cómo lo entiende el agente.
//   npm run probar-saldo -- dni=30111222
//   npm run probar-saldo -- dni=30111222 numeroCliente=5501
//   npm run probar-saldo -- telefono=5493515551234
import { fuenteCrm } from '../src/clientes.js';
import { config } from '../src/config.js';

if (!config.crm.saldoUrl) {
  console.error('Configurá CRM_SALDO_URL en .env (ej. http://IP-DE-TU-VPS:8080/saldo?dni={dni})');
  process.exit(1);
}
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const destino = config.crm.saldoUrl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(args[k] ?? ''));
console.log(`→ ${config.crm.metodo} ${destino}\n`);

const crudo = await fetch(destino, {
  method: config.crm.metodo,
  headers: config.crm.token ? { Authorization: `Bearer ${config.crm.token}` } : {},
  body: config.crm.metodo !== 'GET' ? JSON.stringify(args) : undefined,
}).then(async (r) => `HTTP ${r.status}\n${await r.text()}`).catch((e) => `ERROR: ${e.message}`);
console.log('Respuesta de tu VPS:\n', crudo.slice(0, 2000), '\n');

const r = await fuenteCrm({ url: config.crm.saldoUrl, ...config.crm }).buscar(args);
console.log('Lo que entiende el agente:\n', JSON.stringify(r, null, 2));
if (r.cliente && r.cliente.saldo === undefined && !r.cliente.texto) {
  console.log('\n⚠️  No encontré el saldo. Indicá dónde está con CRM_CAMPOS, ej. CRM_CAMPOS={"saldo":"datos.deuda"}');
}
