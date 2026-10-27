import { ErrorAgenda } from './agenda.js';

/** Paso 6: herramientas que el modelo puede usar para actuar de verdad. */
export const definiciones = [
  {
    type: 'function',
    function: {
      name: 'ver_agenda',
      description: 'Devuelve los horarios libres y ocupados de un día. Usala antes de ofrecer turnos.',
      parameters: {
        type: 'object',
        properties: { fecha: { type: 'string', description: 'Fecha AAAA-MM-DD' } },
        required: ['fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'datos_del_cliente',
      description: 'Lee los datos guardados del cliente actual. Si pasás "nombre", lo guarda.',
      parameters: {
        type: 'object',
        properties: { nombre: { type: 'string', description: 'Nombre y apellido a guardar (opcional)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_cita',
      description: 'Reserva un turno para el cliente actual. Solo cuando eligió horario y dio su nombre.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha AAAA-MM-DD' },
          hora: { type: 'string', description: 'Hora HH:MM, debe ser un horario libre de ver_agenda' },
          servicio: { type: 'string', description: 'Servicio de la ficha del negocio' },
          nombre: { type: 'string', description: 'Nombre del cliente' },
        },
        required: ['fecha', 'hora', 'nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_mis_citas',
      description: 'Lista los turnos próximos del cliente actual (con su id).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_cita',
      description: 'Cancela un turno del cliente actual por su id (obtenido con ver_mis_citas).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
];

/**
 * Ejecuta una herramienta. El teléfono sale del contexto del webhook, nunca del
 * modelo: así nadie puede leer ni cancelar turnos ajenos con un mensaje raro.
 */
export function ejecutar(nombre, args, { agenda, memoria, telefono }) {
  try {
    switch (nombre) {
      case 'ver_agenda':
        return agenda.verAgenda(args.fecha);
      case 'datos_del_cliente':
        if (args.nombre?.trim()) memoria.guardarNombre(telefono, args.nombre.trim());
        return memoria.datos(telefono);
      case 'crear_cita': {
        const cita = agenda.crearCita({ ...args, telefono });
        memoria.guardarNombre(telefono, cita.nombre);
        return { ok: true, cita };
      }
      case 'ver_mis_citas':
        return { citas: agenda.citasDe(telefono) };
      case 'cancelar_cita':
        return { ok: true, cita: agenda.cancelarCita(args.id, telefono) };
      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (e) {
    if (e instanceof ErrorAgenda) return { error: e.message };
    throw e;
  }
}
