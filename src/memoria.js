import path from 'node:path';
import { Almacen } from './almacen.js';

/** Paso 4: historial por cliente; se manda al modelo en cada mensaje nuevo. */
export class Memoria {
  constructor(dataDir, maxHistorial = 20) {
    this.almacen = new Almacen(path.join(dataDir, 'memoria.json'), { clientes: {} });
    this.maxHistorial = maxHistorial;
  }

  #cliente(telefono) {
    return (this.almacen.datos.clientes[telefono] ??= { nombre: null, direccion: null, numeroCliente: null, historial: [] });
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
    const { nombre = null, direccion = null, numeroCliente = null } = this.#cliente(telefono);
    return { telefono, nombre, direccion, numeroCliente };
  }

  actualizarDatos(telefono, cambios) {
    const c = this.#cliente(telefono);
    for (const campo of ['nombre', 'direccion', 'numeroCliente']) {
      if (cambios[campo]?.trim()) c[campo] = cambios[campo].trim();
    }
    this.almacen.guardar();
  }

  /** Ficha del cliente identificado (viene del CRM o de la planilla). */
  clienteIdentificado(telefono) {
    return this.#cliente(telefono).ficha ?? null;
  }

  guardarFicha(telefono, ficha) {
    this.#cliente(telefono).ficha = ficha;
    this.almacen.guardar();
  }

  /** Intentos fallidos de identificación (anti adivinanza de DNI). */
  intentos(telefono) {
    return this.#cliente(telefono).intentos ?? 0;
  }

  sumarIntento(telefono) {
    const c = this.#cliente(telefono);
    c.intentos = (c.intentos ?? 0) + 1;
    this.almacen.guardar();
  }

  borrar(telefono) {
    delete this.almacen.datos.clientes[telefono];
    this.almacen.guardar();
  }
}
