// Carga o actualiza clientes desde un CSV exportado de Excel.  npm run importar -- clientes.csv
import { readFileSync } from 'node:fs';
import { config } from '../src/config.js';
import { parsearCsv } from '../src/csv.js';
import { Sistema } from '../src/sistema.js';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: npm run importar -- clientes.csv   (ejemplo en data/clientes-ejemplo.csv)');
  process.exit(1);
}
const r = new Sistema(config.dataDir).importarClientes(parsearCsv(readFileSync(archivo, 'utf8')));
console.log(`✅ ${r.nuevos} nuevos, ${r.actualizados} actualizados. Total en el sistema: ${r.total}.`);
