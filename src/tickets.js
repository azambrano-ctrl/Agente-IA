import path from 'node:path';
import { Almacen } from './almacen.js';
import { ErrorHerramienta } from './errores.js';

export const TIPOS_TICKET = ['soporte', 'alta', 'cambio_plan', 'baja', 'administrativo', 'humano'];

/** Reclamos y solicitudes con número de seguimiento. */
export class Tickets {
  constructor(dataDir) {
    this.almacen = new Almacen(path.join(dataDir, 'tickets.json'), { ultimo: 1000, tickets: [] });
  }

  crear({ tipo, descripcion, telefono, cliente }) {
    if (!TIPOS_TICKET.includes(tipo)) throw new ErrorHerramienta(`Tipo de ticket inválido: "${tipo}". Usá: ${TIPOS_TICKET.join(', ')}.`);
    if (!descripcion?.trim()) throw new ErrorHerramienta('Falta la descripción del ticket.');
    const d = this.almacen.datos;
    const ticket = {
      numero: ++d.ultimo, tipo, descripcion: descripcion.trim(), telefono,
      cliente, estado: 'abierto', creado: new Date().toISOString(),
    };
    d.tickets.push(ticket);
    this.almacen.guardar();
    return ticket;
  }

  de(telefono) {
    return this.almacen.datos.tickets.filter((t) => t.telefono === telefono && t.estado !== 'cerrado')
      .map(({ numero, tipo, descripcion, estado, creado }) => ({ numero, tipo, descripcion, estado, creado }));
  }
}
