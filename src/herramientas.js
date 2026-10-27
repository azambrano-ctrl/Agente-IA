import { ErrorHerramienta } from './errores.js';
import { consultarCobertura } from './negocio.js';
import { TIPOS_TICKET } from './tickets.js';

const fecha = { type: 'string', description: 'Fecha AAAA-MM-DD' };
const funcion = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

/** Paso 6: herramientas que el modelo puede usar para actuar de verdad. */
export const definiciones = [
  funcion('consultar_cobertura', 'Verifica si hay servicio en una dirección o barrio y si hay cortes avisados en esa zona.', {
    ubicacion: { type: 'string', description: 'Dirección, barrio o localidad' },
  }, ['ubicacion']),
  funcion('datos_del_cliente', 'Lee los datos guardados del cliente actual. Si pasás algún campo, lo guarda.', {
    nombre: { type: 'string', description: 'Nombre y apellido del titular' },
    direccion: { type: 'string', description: 'Dirección del servicio' },
    numeroCliente: { type: 'string', description: 'Número de cliente o abonado' },
  }),
  funcion('crear_ticket', 'Abre un reclamo o solicitud y devuelve su número de seguimiento.', {
    tipo: { type: 'string', enum: TIPOS_TICKET },
    descripcion: { type: 'string', description: 'Qué pasa o qué pide el cliente, y qué ya probó' },
  }, ['tipo', 'descripcion']),
  funcion('ver_mis_tickets', 'Lista los reclamos y solicitudes abiertos del cliente actual.'),
  funcion('ver_agenda', 'Devuelve las franjas libres para visitas técnicas o instalaciones de un día.', { fecha }, ['fecha']),
  funcion('agendar_visita', 'Agenda una visita para el cliente actual. Solo cuando eligió franja y tenés nombre y dirección.', {
    fecha,
    franja: { type: 'string', description: 'Franja exacta devuelta por ver_agenda, ej. "08:00-10:00"' },
    tipo: { type: 'string', description: 'Tipo de visita de la ficha (instalación, visita técnica, …)' },
    nombre: { type: 'string' },
    direccion: { type: 'string' },
  }, ['fecha', 'franja', 'tipo', 'nombre', 'direccion']),
  funcion('ver_mis_visitas', 'Lista las visitas próximas del cliente actual (con su id).'),
  funcion('cancelar_visita', 'Cancela una visita del cliente actual por su id (de ver_mis_visitas).', {
    id: { type: 'string' },
  }, ['id']),
];

/**
 * Ejecuta una herramienta. El teléfono sale del contexto del webhook, nunca del
 * modelo: así nadie puede ver ni cancelar gestiones ajenas con un mensaje raro.
 */
export async function ejecutar(nombre, args, { negocio, agenda, memoria, tickets, telefono, notificar }) {
  try {
    switch (nombre) {
      case 'consultar_cobertura':
        return consultarCobertura(negocio, args.ubicacion);
      case 'datos_del_cliente':
        memoria.actualizarDatos(telefono, args);
        return memoria.datos(telefono);
      case 'crear_ticket': {
        const ticket = tickets.crear({ ...args, telefono, cliente: memoria.datos(telefono) });
        await notificar?.(`🎫 Ticket #${ticket.numero} (${ticket.tipo}) de ${telefono}${ticket.cliente.nombre ? ` - ${ticket.cliente.nombre}` : ''}\n${ticket.descripcion}`);
        return { ok: true, numero: ticket.numero, tipo: ticket.tipo };
      }
      case 'ver_mis_tickets':
        return { tickets: tickets.de(telefono) };
      case 'ver_agenda':
        return agenda.verAgenda(args.fecha);
      case 'agendar_visita': {
        const visita = agenda.crearVisita({ ...args, telefono });
        memoria.actualizarDatos(telefono, { nombre: visita.nombre, direccion: visita.direccion });
        await notificar?.(`📅 ${visita.tipo} ${visita.fecha} ${visita.franja} - ${visita.nombre}, ${visita.direccion} (${telefono})`);
        return { ok: true, visita };
      }
      case 'ver_mis_visitas':
        return { visitas: agenda.visitasDe(telefono) };
      case 'cancelar_visita':
        return { ok: true, visita: agenda.cancelarVisita(args.id, telefono) };
      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (e) {
    if (e instanceof ErrorHerramienta) return { error: e.message };
    throw e;
  }
}
