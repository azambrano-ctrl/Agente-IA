import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Almacen } from './almacen.js';
import { ahora, DIAS, diaSemana } from './negocio.js';

const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export class ErrorAgenda extends Error {}

/** Agenda local de turnos (reemplazable por Cal.com / Google Calendar). */
export class Agenda {
  constructor(dataDir, negocio, reloj = () => ahora(negocio.zonaHoraria)) {
    this.almacen = new Almacen(path.join(dataDir, 'agenda.json'), { citas: [] });
    this.negocio = negocio;
    this.reloj = reloj;
  }

  /** Valida que la fecha exista, no haya pasado y el negocio abra ese día. */
  validarFecha(fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
    if (!m) throw new ErrorAgenda(`Formato de fecha inválido: "${fecha}". Usá AAAA-MM-DD.`);
    const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(a, mes - 1, dia));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
      throw new ErrorAgenda(`La fecha ${fecha} no existe en el calendario.`);
    }
    if (fecha < this.reloj().fecha) throw new ErrorAgenda(`La fecha ${fecha} ya pasó.`);
    const horario = this.negocio.horarios[DIAS[diaSemana(fecha)]];
    if (!horario) throw new ErrorAgenda(`El negocio está cerrado ese día (${fecha}).`);
    return horario;
  }

  turnosDelDia(fecha) {
    const [desde, hasta] = this.validarFecha(fecha);
    const paso = this.negocio.duracionTurnoMin;
    const turnos = [];
    for (let t = aMin(desde); t + paso <= aMin(hasta); t += paso) turnos.push(aHora(t));
    return turnos;
  }

  #activas(fecha) {
    return this.almacen.datos.citas.filter((c) => c.estado === 'confirmada' && (!fecha || c.fecha === fecha));
  }

  verAgenda(fecha) {
    const turnos = this.turnosDelDia(fecha);
    const ocupados = new Set(this.#activas(fecha).map((c) => c.hora));
    const momento = this.reloj();
    const pasado = (h) => fecha === momento.fecha && h <= momento.hora;
    const libres = turnos.filter((h) => !ocupados.has(h) && !pasado(h));
    return { fecha, libres, ocupados: turnos.filter((h) => ocupados.has(h)) };
  }

  crearCita({ fecha, hora, servicio, nombre, telefono }) {
    if (!nombre?.trim()) throw new ErrorAgenda('Falta el nombre del cliente.');
    const servicios = this.negocio.servicios.map((s) => s.nombre.toLowerCase());
    if (servicio && !servicios.includes(servicio.toLowerCase())) {
      throw new ErrorAgenda(`Servicio desconocido: "${servicio}". Disponibles: ${servicios.join(', ')}.`);
    }
    const { libres } = this.verAgenda(fecha);
    if (!this.turnosDelDia(fecha).includes(hora)) throw new ErrorAgenda(`${hora} no es un horario de turno válido.`);
    if (!libres.includes(hora)) throw new ErrorAgenda(`El turno de las ${hora} del ${fecha} no está disponible.`);

    const cita = {
      id: randomUUID().slice(0, 8), fecha, hora,
      servicio: servicio ?? null, nombre: nombre.trim(), telefono,
      estado: 'confirmada', creada: new Date().toISOString(),
    };
    this.almacen.datos.citas.push(cita);
    this.almacen.guardar();
    return cita;
  }

  citasDe(telefono) {
    const hoy = this.reloj().fecha;
    return this.#activas().filter((c) => c.telefono === telefono && c.fecha >= hoy)
      .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  }

  cancelarCita(id, telefono) {
    const cita = this.#activas().find((c) => c.id === id && c.telefono === telefono);
    if (!cita) throw new ErrorAgenda(`No encontré una cita activa con id ${id} para este cliente.`);
    cita.estado = 'cancelada';
    cita.cancelada = new Date().toISOString();
    this.almacen.guardar();
    return cita;
  }
}
