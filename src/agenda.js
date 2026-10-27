import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Almacen } from './almacen.js';
import { ErrorHerramienta } from './errores.js';
import { ahora, DIAS, diaSemana } from './negocio.js';

const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Agenda de visitas técnicas e instalaciones por franjas horarias.
 * Cada franja admite tantas visitas como cuadrillas haya.
 */
export class Agenda {
  constructor(dataDir, negocio, reloj = () => ahora(negocio.zonaHoraria)) {
    this.almacen = new Almacen(path.join(dataDir, 'agenda.json'), { visitas: [] });
    this.negocio = negocio;
    this.reloj = reloj;
  }

  get #conf() {
    return this.negocio.visitas;
  }

  /** Valida que la fecha exista, no haya pasado y haya visitas ese día. */
  validarFecha(fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
    if (!m) throw new ErrorHerramienta(`Formato de fecha inválido: "${fecha}". Usá AAAA-MM-DD.`);
    const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(a, mes - 1, dia));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
      throw new ErrorHerramienta(`La fecha ${fecha} no existe en el calendario.`);
    }
    if (fecha < this.reloj().fecha) throw new ErrorHerramienta(`La fecha ${fecha} ya pasó.`);
    const horario = this.#conf.horarios[DIAS[diaSemana(fecha)]];
    if (!horario) throw new ErrorHerramienta(`No hay visitas técnicas ese día (${fecha}).`);
    return horario;
  }

  /** Franjas del día, ej. "08:00-10:00". */
  franjasDelDia(fecha) {
    const [desde, hasta] = this.validarFecha(fecha);
    const paso = this.#conf.franjaMin;
    const franjas = [];
    for (let t = aMin(desde); t + paso <= aMin(hasta); t += paso) franjas.push(`${aHora(t)}-${aHora(t + paso)}`);
    return franjas;
  }

  #activas(fecha) {
    return this.almacen.datos.visitas.filter((v) => v.estado === 'confirmada' && (!fecha || v.fecha === fecha));
  }

  verAgenda(fecha) {
    const franjas = this.franjasDelDia(fecha);
    const uso = new Map();
    for (const v of this.#activas(fecha)) uso.set(v.franja, (uso.get(v.franja) ?? 0) + 1);
    const momento = this.reloj();
    const empezo = (f) => fecha === momento.fecha && f.slice(0, 5) <= momento.hora;
    const llena = (f) => (uso.get(f) ?? 0) >= this.#conf.cuadrillas;
    return {
      fecha,
      libres: franjas.filter((f) => !llena(f) && !empezo(f)),
      completas: franjas.filter(llena),
    };
  }

  crearVisita({ fecha, franja, tipo, nombre, direccion, telefono, orden = null }) {
    if (!nombre?.trim()) throw new ErrorHerramienta('Falta el nombre del titular.');
    if (!direccion?.trim()) throw new ErrorHerramienta('Falta la dirección de la visita.');
    if (!this.#conf.tipos.includes(tipo)) {
      throw new ErrorHerramienta(`Tipo de visita desconocido: "${tipo}". Disponibles: ${this.#conf.tipos.join(', ')}.`);
    }
    const { libres } = this.verAgenda(fecha);
    if (!this.franjasDelDia(fecha).includes(franja)) throw new ErrorHerramienta(`"${franja}" no es una franja válida.`);
    if (!libres.includes(franja)) throw new ErrorHerramienta(`La franja ${franja} del ${fecha} no está disponible.`);

    const visita = {
      id: randomUUID().slice(0, 8), fecha, franja, tipo,
      nombre: nombre.trim(), direccion: direccion.trim(), telefono, orden,
      estado: 'confirmada', creada: new Date().toISOString(),
    };
    this.almacen.datos.visitas.push(visita);
    this.almacen.guardar();
    return visita;
  }

  visitasDe(telefono) {
    const hoy = this.reloj().fecha;
    return this.#activas().filter((v) => v.telefono === telefono && v.fecha >= hoy)
      .sort((a, b) => `${a.fecha}${a.franja}`.localeCompare(`${b.fecha}${b.franja}`));
  }

  /** Libera la franja reservada para una orden (ej. instalación cancelada). */
  liberarOrden(numeroOrden) {
    for (const v of this.#activas().filter((x) => x.orden === numeroOrden)) {
      v.estado = 'cancelada';
      v.cancelada = new Date().toISOString();
    }
    this.almacen.guardar();
  }

  cancelarVisita(id, telefono) {
    const visita = this.#activas().find((v) => v.id === id && v.telefono === telefono);
    if (!visita) throw new ErrorHerramienta(`No encontré una visita activa con id ${id} para este cliente.`);
    visita.estado = 'cancelada';
    visita.cancelada = new Date().toISOString();
    this.almacen.guardar();
    return visita;
  }
}
