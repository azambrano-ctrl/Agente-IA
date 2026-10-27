import path from 'node:path';
import { Almacen } from './almacen.js';

/** Paso 4: historial por cliente; se manda al modelo en cada mensaje nuevo. */
export class Memoria {
  constructor(dataDir, maxHistorial = 20) {
    this.almacen = new Almacen(path.join(dataDir, 'memoria.json'), { clientes: {} });
    this.maxHistorial = maxHistorial;
  }

  #cliente(telefono) {
    return (this.almacen.datos.clientes[telefono] ??= { nombre: null, historial: [] });
  }

  historial(telefono) {
    return this.#cliente(telefono).historial.slice(-this.maxHistorial);
  }

  agregar(telefono, ...mensajes) {
    const c = this.#cliente(telefono);
    c.historial.push(...mensajes.map(({ role, content }) => ({ role, content, ts: Date.now() })));
    c.historial = c.historial.slice(-this.maxHistorial * 5);
    this.almacen.guardar();
  }

  datos(telefono) {
    const { nombre } = this.#cliente(telefono);
    return { telefono, nombre };
  }

  guardarNombre(telefono, nombre) {
    this.#cliente(telefono).nombre = nombre;
    this.almacen.guardar();
  }

  borrar(telefono) {
    delete this.almacen.datos.clientes[telefono];
    this.almacen.guardar();
  }
}
