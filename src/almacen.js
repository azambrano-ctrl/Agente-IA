import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Persistencia mínima en un archivo JSON, con escritura atómica. */
export class Almacen {
  constructor(archivo, inicial = {}) {
    this.archivo = archivo;
    mkdirSync(path.dirname(archivo), { recursive: true });
    this.datos = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : structuredClone(inicial);
  }

  guardar() {
    const tmp = `${this.archivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.datos, null, 2));
    renameSync(tmp, this.archivo);
  }
}
