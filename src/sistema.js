import path from 'node:path';
import { Almacen } from './almacen.js';
import { ErrorHerramienta } from './errores.js';
import { digitos, mismoTelefono } from './telefono.js';

export const ESTADOS_ORDEN = ['abierta', 'asignada', 'aceptada', 'en_camino', 'resuelta', 'cancelada'];
const CERRADAS = new Set(['resuelta', 'cancelada']);

const numero = (v) => {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').replace(/[^\d,.-]/g, '');
  // "38.000,50" y "24.000" (es-AR) o "38000.50"
  let n;
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''));
  else n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

/**
 * El sistema del ISP: clientes con su deuda y órdenes de trabajo
 * (reparaciones, instalaciones y gestiones administrativas).
 */
export class Sistema {
  constructor(dataDir, reloj = () => new Date()) {
    this.almacen = new Almacen(path.join(dataDir, 'sistema.json'), { ultimaOrden: 1000, clientes: [], ordenes: [] });
    this.reloj = reloj;
  }

  get #d() {
    return this.almacen.datos;
  }

  // ── Clientes ─────────────────────────────────────────────────────

  /** Alta o actualización por número de cliente (ej. desde un CSV). */
  importarClientes(filas) {
    let nuevos = 0;
    let actualizados = 0;
    for (const f of filas) {
      const numeroCliente = String(f.numeroCliente ?? f.numero_cliente ?? f.cliente ?? '').trim();
      if (!numeroCliente) continue;
      const datos = {
        numeroCliente,
        nombre: f.nombre?.trim() ?? '',
        dni: digitos(f.dni),
        telefono: digitos(f.telefono),
        direccion: f.direccion?.trim() ?? '',
        zona: f.zona?.trim() ?? f.barrio?.trim() ?? '',
        plan: f.plan?.trim() ?? '',
        estado: (f.estado?.trim() || 'activo').toLowerCase(),
        saldo: numero(f.saldo ?? f.deuda),
        vencimiento: f.vencimiento?.trim() || null,
        ultimoPago: f.ultimoPago?.trim() || f.ultimo_pago?.trim() || null,
      };
      const existente = this.#d.clientes.find((c) => c.numeroCliente === numeroCliente);
      if (existente) { Object.assign(existente, datos); actualizados++; } else { this.#d.clientes.push(datos); nuevos++; }
    }
    this.almacen.guardar();
    return { nuevos, actualizados, total: this.#d.clientes.length };
  }

  cliente(numeroCliente) {
    return this.#d.clientes.find((c) => c.numeroCliente === String(numeroCliente)) ?? null;
  }

  clientePorTelefono(telefono) {
    return this.#d.clientes.find((c) => c.telefono && mismoTelefono(c.telefono, telefono)) ?? null;
  }

  /** Identificación fuerte: DNI y número de cliente tienen que coincidir. */
  clientePorDatos(dni, numeroCliente) {
    const c = this.cliente(String(numeroCliente ?? '').trim());
    return c && c.dni && c.dni === digitos(dni) ? c : null;
  }

  buscarClientes(q = '') {
    const t = q.toLowerCase();
    return this.#d.clientes.filter((c) => !t || [c.numeroCliente, c.nombre, c.dni, c.telefono, c.direccion]
      .some((v) => String(v).toLowerCase().includes(t)));
  }

  registrarPago(numeroCliente, importe) {
    const c = this.cliente(numeroCliente);
    if (!c) throw new ErrorHerramienta(`No existe el cliente ${numeroCliente}.`);
    c.saldo = Math.max(0, c.saldo - numero(importe));
    c.ultimoPago = this.reloj().toISOString().slice(0, 10);
    if (c.saldo === 0 && c.estado === 'suspendido') c.estado = 'activo';
    this.almacen.guardar();
    return c;
  }

  // ── Órdenes ──────────────────────────────────────────────────────

  crearOrden({ clase, tipo, telefono, numeroCliente = null, nombre, direccion = '', zona = '', descripcion = '', datos = {} }) {
    const orden = {
      numero: ++this.#d.ultimaOrden, clase, tipo, estado: 'abierta',
      telefono, numeroCliente, nombre, direccion, zona, descripcion, datos,
      tecnico: null, creada: this.reloj().toISOString(),
      historial: [{ ts: this.reloj().toISOString(), estado: 'abierta', nota: 'Creada por el agente de WhatsApp' }],
    };
    this.#d.ordenes.push(orden);
    this.almacen.guardar();
    return orden;
  }

  orden(num) {
    return this.#d.ordenes.find((o) => o.numero === Number(num)) ?? null;
  }

  actualizarOrden(num, cambios, nota = '') {
    const o = this.orden(num);
    if (!o) throw new ErrorHerramienta(`No existe la orden #${num}.`);
    if (cambios.estado && !ESTADOS_ORDEN.includes(cambios.estado)) throw new ErrorHerramienta(`Estado inválido: ${cambios.estado}`);
    Object.assign(o, cambios);
    o.historial.push({ ts: this.reloj().toISOString(), estado: o.estado, nota });
    this.almacen.guardar();
    return o;
  }

  ordenes({ abiertas = false, limite = 500 } = {}) {
    return this.#d.ordenes.filter((o) => !abiertas || !CERRADAS.has(o.estado)).slice(-limite).reverse();
  }

  ordenesDe(telefono) {
    return this.#d.ordenes.filter((o) => mismoTelefono(o.telefono, telefono)).slice(-10).reverse();
  }

  reparacionAbierta(numeroCliente) {
    return this.#d.ordenes.find((o) => o.clase === 'reparacion' && o.numeroCliente === numeroCliente && !CERRADAS.has(o.estado)) ?? null;
  }

  ordenesDeTecnico(telefono) {
    return this.#d.ordenes.filter((o) => o.tecnico && mismoTelefono(o.tecnico.telefono, telefono) && !CERRADAS.has(o.estado));
  }
}

export const estaCerrada = (orden) => CERRADAS.has(orden.estado);
