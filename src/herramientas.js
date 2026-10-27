import { ErrorHerramienta } from './errores.js';
import { consultarCobertura } from './negocio.js';
import { estaCerrada } from './sistema.js';

const texto = (description) => ({ type: 'string', description });
const funcion = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const TIPOS_FALLA = ['sin_servicio', 'lento', 'intermitente', 'wifi', 'equipo_danado', 'otro'];
export const TIPOS_GESTION = ['baja', 'cambio_plan', 'cambio_titular', 'cambio_domicilio', 'facturacion', 'humano'];

/** Paso 6: herramientas que el modelo usa para actuar sobre el sistema. */
export const definiciones = [
  funcion('identificar_cliente',
    'Identifica al cliente en el sistema. Primero probá sin argumentos (busca por su número de WhatsApp). Si no aparece, pedile DNI y número de cliente y llamala con ambos.', {
      dni: texto('DNI del titular'),
      numeroCliente: texto('Número de cliente / abonado (figura en la factura)'),
    }),
  funcion('consultar_deuda', 'Saldo, vencimiento, último pago y estado del servicio del cliente identificado.'),
  funcion('reportar_falla',
    'Carga una incidencia técnica en el sistema y la despacha a un técnico por WhatsApp. Usala solo después de los pasos de soporte.', {
      tipo: { type: 'string', enum: TIPOS_FALLA },
      descripcion: texto('Qué le pasa, desde cuándo'),
      diagnostico: texto('Qué ya probó: luces del módem (PON/LOS), reinicio, cable/WiFi'),
      disponibilidad: texto('Cuándo puede recibir al técnico'),
    }, ['tipo', 'descripcion', 'diagnostico']),
  funcion('consultar_cobertura', 'Verifica si hay servicio en un barrio o dirección y si hay cortes avisados.', {
    ubicacion: texto('Dirección, barrio o localidad'),
  }, ['ubicacion']),
  funcion('ver_agenda', 'Franjas libres para instalaciones de un día.', { fecha: texto('AAAA-MM-DD') }, ['fecha']),
  funcion('registrar_instalacion',
    'Registra la solicitud de instalación con TODOS los datos, reserva la franja y la despacha a un técnico. Usala solo después de confirmar el resumen con el cliente.', {
      nombre: texto('Nombre y apellido del titular'),
      dni: texto('DNI del titular'),
      email: texto('Email para la factura'),
      telefonoContacto: texto('Teléfono de contacto (si es distinto a este WhatsApp, si no repetilo)'),
      direccion: texto('Calle y número'),
      pisoDepto: texto('Piso y departamento, o "casa"'),
      barrio: texto('Barrio o localidad'),
      entreCalles: texto('Entre qué calles'),
      referencias: texto('Referencias de la casa: color, rejas, portón…'),
      tipoVivienda: { type: 'string', enum: ['casa', 'departamento', 'local_comercial', 'otro'] },
      titularidad: { type: 'string', enum: ['propietario', 'inquilino'] },
      plan: texto('Nombre exacto del plan elegido'),
      fecha: texto('AAAA-MM-DD'),
      franja: texto('Franja exacta de ver_agenda, ej. "08:00-10:00"'),
      ubicacion: {
        type: 'object', description: 'Si el cliente compartió la ubicación por WhatsApp',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      },
      observaciones: texto('Cualquier otro dato útil'),
    }, ['nombre', 'dni', 'email', 'telefonoContacto', 'direccion', 'pisoDepto', 'barrio', 'entreCalles', 'tipoVivienda', 'titularidad', 'plan', 'fecha', 'franja']),
  funcion('cancelar_instalacion', 'Cancela una instalación del cliente y libera la franja.', {
    numero: { type: 'number', description: 'Número de orden' }, motivo: texto('Motivo'),
  }, ['numero']),
  funcion('ver_mis_ordenes', 'Estado de las órdenes del cliente (reparaciones, instalaciones, gestiones) y técnico asignado.'),
  funcion('crear_gestion', 'Deriva a la oficina un trámite que el agente no resuelve.', {
    tipo: { type: 'string', enum: TIPOS_GESTION }, descripcion: texto('Qué pide el cliente'),
  }, ['tipo', 'descripcion']),
];

const resumenCliente = (c) => ({ numeroCliente: c.numeroCliente, nombre: c.nombre, direccion: c.direccion, zona: c.zona, plan: c.plan, estado: c.estado });
const resumenOrden = (o) => ({
  numero: o.numero, clase: o.clase, tipo: o.tipo, estado: o.estado, creada: o.creada.slice(0, 10),
  tecnico: o.tecnico?.nombre ?? null, fecha: o.datos?.fecha, franja: o.datos?.franja,
});

/**
 * Ejecuta una herramienta. El teléfono sale del webhook, nunca del modelo, y el cliente
 * queda vinculado solo si coincide su WhatsApp o DNI + número de cliente.
 */
export async function ejecutar(nombre, args, ctx) {
  const { negocio, agenda, memoria, sistema, despacho, telefono, notificar } = ctx;
  const vinculado = () => {
    const num = memoria.datos(telefono).numeroCliente;
    const c = num && sistema.cliente(num);
    if (!c) throw new ErrorHerramienta('Primero identificá al cliente con identificar_cliente.');
    return c;
  };

  try {
    switch (nombre) {
      case 'identificar_cliente': {
        let c = sistema.clientePorTelefono(telefono);
        if (!c && (args.dni || args.numeroCliente)) {
          if (memoria.intentos(telefono) >= 3) {
            return { encontrado: false, error: 'Demasiados intentos. Derivá a la oficina con crear_gestion tipo "humano".' };
          }
          c = sistema.clientePorDatos(args.dni, args.numeroCliente);
          if (!c) memoria.sumarIntento(telefono);
        }
        if (!c) {
          return { encontrado: false, nota: args.dni ? 'DNI y número de cliente no coinciden.' : 'Este WhatsApp no está registrado: pedí DNI y número de cliente.' };
        }
        memoria.actualizarDatos(telefono, { numeroCliente: c.numeroCliente, nombre: c.nombre, direccion: c.direccion });
        return { encontrado: true, cliente: resumenCliente(c) };
      }

      case 'consultar_deuda': {
        const c = vinculado();
        const hoy = new Date().toISOString().slice(0, 10);
        return {
          ...resumenCliente(c),
          saldo: c.saldo, moneda: negocio.moneda ?? '$',
          vencimiento: c.vencimiento, vencida: Boolean(c.saldo > 0 && c.vencimiento && c.vencimiento < hoy),
          ultimoPago: c.ultimoPago, mediosDePago: negocio.pagos,
        };
      }

      case 'reportar_falla': {
        const c = vinculado();
        if (c.estado === 'suspendido') {
          return { ok: false, motivo: 'servicio_suspendido_por_deuda', saldo: c.saldo, nota: 'No se despacha técnico: el servicio está suspendido por falta de pago. Informá la deuda y los medios de pago.' };
        }
        const cobertura = consultarCobertura(negocio, c.zona || c.direccion);
        if (cobertura.avisos?.length) {
          return { ok: false, motivo: 'corte_masivo', avisos: cobertura.avisos, nota: 'Hay un corte general en su zona: no se despacha técnico.' };
        }
        const existente = sistema.reparacionAbierta(c.numeroCliente);
        if (existente) return { ok: true, yaExistia: true, orden: resumenOrden(existente) };

        const orden = sistema.crearOrden({
          clase: 'reparacion', tipo: args.tipo, telefono, numeroCliente: c.numeroCliente,
          nombre: c.nombre, direccion: c.direccion, zona: c.zona, descripcion: args.descripcion,
          datos: { diagnostico: args.diagnostico, disponibilidad: args.disponibilidad, plan: c.plan, telefonoContacto: c.telefono || telefono },
        });
        const d = await despacho.despachar(orden);
        return { ok: true, orden: resumenOrden(sistema.orden(orden.numero)), tecnicoAsignado: d.asignada ? d.tecnico : null };
      }

      case 'consultar_cobertura':
        return consultarCobertura(negocio, args.ubicacion);

      case 'ver_agenda':
        return agenda.verAgenda(args.fecha);

      case 'registrar_instalacion': {
        const plan = negocio.planes.find((p) => p.nombre.toLowerCase() === String(args.plan).toLowerCase());
        if (!plan) throw new ErrorHerramienta(`Plan desconocido: "${args.plan}". Planes: ${negocio.planes.map((p) => p.nombre).join(', ')}.`);
        const cobertura = consultarCobertura(negocio, args.barrio);
        if (cobertura.cubierto !== true) {
          return { ok: false, motivo: 'sin_cobertura_confirmada', nota: 'Creá una gestión para que la oficina verifique la factibilidad.' };
        }
        const faltan = ['nombre', 'dni', 'email', 'direccion', 'entreCalles'].filter((k) => !String(args[k] ?? '').trim());
        if (faltan.length) throw new ErrorHerramienta(`Faltan datos: ${faltan.join(', ')}.`);

        agenda.verAgenda(args.fecha); // valida fecha antes de crear la orden
        if (!agenda.verAgenda(args.fecha).libres.includes(args.franja)) {
          throw new ErrorHerramienta(`La franja ${args.franja} del ${args.fecha} no está disponible.`);
        }
        const { nombre: titular, direccion, barrio, ...resto } = args;
        const orden = sistema.crearOrden({
          clase: 'instalacion', tipo: 'instalación', telefono, nombre: titular, direccion, zona: cobertura.zona,
          descripcion: `Alta ${plan.nombre}`, datos: { ...resto, plan: plan.nombre, barrio },
        });
        agenda.crearVisita({ fecha: args.fecha, franja: args.franja, tipo: 'instalación', nombre: titular, direccion, telefono, orden: orden.numero });
        memoria.actualizarDatos(telefono, { nombre: titular, direccion });
        const d = await despacho.despachar(orden);
        return { ok: true, orden: resumenOrden(sistema.orden(orden.numero)), tecnicoAsignado: d.asignada ? d.tecnico : null, instalacion: negocio.instalacion };
      }

      case 'cancelar_instalacion': {
        const o = sistema.orden(args.numero);
        if (!o || o.clase !== 'instalacion' || o.telefono !== telefono) throw new ErrorHerramienta(`No encontré la instalación #${args.numero} de este cliente.`);
        if (estaCerrada(o)) throw new ErrorHerramienta(`La orden #${o.numero} ya está ${o.estado}.`);
        agenda.liberarOrden(o.numero);
        await despacho.cancelar(o, `Cancelada por el cliente. ${args.motivo ?? ''}`.trim());
        return { ok: true, orden: resumenOrden(sistema.orden(o.numero)) };
      }

      case 'ver_mis_ordenes':
        return { ordenes: sistema.ordenesDe(telefono).map(resumenOrden) };

      case 'crear_gestion': {
        const c = memoria.datos(telefono);
        const orden = sistema.crearOrden({
          clase: 'gestion', tipo: args.tipo, telefono, numeroCliente: c.numeroCliente,
          nombre: c.nombre ?? '', descripcion: args.descripcion,
        });
        await notificar?.(`🗂️ Gestión #${orden.numero} (${args.tipo}) de ${c.nombre ?? telefono} (${telefono}):\n${args.descripcion}`);
        return { ok: true, orden: resumenOrden(orden) };
      }

      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (e) {
    if (e instanceof ErrorHerramienta) return { error: e.message };
    throw e;
  }
}
