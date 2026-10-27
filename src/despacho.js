import { estaCerrada } from './sistema.js';
import { mismoTelefono } from './telefono.js';

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Meta no deja mandar texto libre si el destinatario no escribió en las últimas 24 h.
const ventanaCerrada = (e) => /131047|re-engagement|24 ?h/i.test(e.message);

const AYUDA = `Comandos:
• TOMO 1023 → aceptás la orden
• EN CAMINO 1023 → le avisamos al cliente
• LISTO 1023 nota → la cerrás como resuelta
• NO PUEDO 1023 motivo → se reasigna
• MIS → tus órdenes abiertas`;

/** Despacha órdenes a los técnicos por WhatsApp y procesa sus respuestas. */
export function crearDespacho({ negocio, sistema, memoria, whatsapp, plantilla, notificarAdmin = async () => {}, log = console }) {
  const tecnicos = () => (negocio.tecnicos ?? []).filter((t) => t.activo !== false);
  const tecnicoPorTelefono = (tel) => tecnicos().find((t) => mismoTelefono(t.telefono, tel)) ?? null;

  /** El técnico de la zona con menos órdenes abiertas (o cualquiera si nadie cubre la zona). */
  const elegir = (zona, excluir = []) => {
    const libres = tecnicos().filter((t) => !excluir.some((x) => mismoTelefono(x, t.telefono)));
    const deZona = libres.filter((t) => (t.zonas ?? []).some((z) => norm(z) === norm(zona)));
    const pool = deZona.length ? deZona : libres;
    return pool.map((t) => ({ t, carga: sistema.ordenesDeTecnico(t.telefono).length }))
      .sort((a, b) => a.carga - b.carga)[0]?.t ?? null;
  };

  const detalle = (o) => {
    const d = o.datos ?? {};
    const mapa = d.ubicacion?.lat
      ? `https://maps.google.com/?q=${d.ubicacion.lat},${d.ubicacion.lng}`
      : `https://maps.google.com/?q=${encodeURIComponent(`${o.direccion}, ${o.zona}`)}`;
    return [
      `🔧 ORDEN #${o.numero} · ${o.clase === 'instalacion' ? 'INSTALACIÓN' : `REPARACIÓN (${o.tipo})`}`,
      d.fecha && `📅 ${d.fecha} ${d.franja}`,
      `👤 ${o.nombre}${o.numeroCliente ? ` (cliente ${o.numeroCliente})` : ''}`,
      `📞 ${d.telefonoContacto ?? o.telefono}`,
      `📍 ${o.direccion}${d.pisoDepto ? `, ${d.pisoDepto}` : ''}${o.zona ? ` - ${o.zona}` : ''}`,
      d.entreCalles && `↔️ Entre ${d.entreCalles}`,
      d.referencias && `🏠 ${d.referencias}`,
      d.plan && `📶 Plan: ${d.plan}`,
      o.descripcion && `📝 ${o.descripcion}`,
      d.diagnostico && `🔍 Ya probó: ${d.diagnostico}`,
      d.disponibilidad && `🕒 Disponibilidad: ${d.disponibilidad}`,
      `🗺️ ${mapa}`,
      '',
      `Respondé TOMO ${o.numero} para aceptarla.`,
    ].filter((l) => l !== undefined && l !== null && l !== false).join('\n');
  };

  async function enviarATecnico(tecnico, orden) {
    try {
      await whatsapp.enviarTexto(tecnico.telefono, detalle(orden));
    } catch (e) {
      if (!ventanaCerrada(e) || !plantilla?.nombre) throw e;
      // Plantilla aprobada por Meta; cuando el técnico responde le mandamos el detalle.
      await whatsapp.enviarPlantilla(tecnico.telefono, plantilla.nombre, plantilla.idioma, [String(orden.numero), orden.zona || orden.direccion]);
      sistema.actualizarOrden(orden.numero, { detallePendiente: true }, 'Aviso por plantilla: detalle pendiente');
    }
  }

  async function avisarCliente(orden, texto) {
    try {
      await whatsapp.enviarTexto(orden.telefono, texto);
      memoria?.agregar(orden.telefono, { role: 'assistant', content: texto });
    } catch (e) {
      log.error?.(`[despacho] no pude avisar al cliente de #${orden.numero}:`, e.message);
    }
  }

  /** Asigna la orden a un técnico y se la manda por WhatsApp. */
  async function despachar(orden, { excluir = [], tecnico } = {}) {
    const t = tecnico ?? elegir(orden.zona, excluir);
    if (!t) {
      await notificarAdmin(`⚠️ Orden #${orden.numero} sin técnico disponible (${orden.zona || orden.direccion}). Asignala desde el panel.`);
      return { asignada: false };
    }
    sistema.actualizarOrden(orden.numero, { estado: 'asignada', tecnico: { nombre: t.nombre, telefono: t.telefono } }, `Asignada a ${t.nombre}`);
    try {
      await enviarATecnico(t, sistema.orden(orden.numero));
    } catch (e) {
      log.error?.(`[despacho] no pude enviar #${orden.numero} a ${t.nombre}:`, e.message);
      await notificarAdmin(`⚠️ No pude mandarle la orden #${orden.numero} a ${t.nombre} por WhatsApp: ${e.message}`);
    }
    await notificarAdmin(`📋 Orden #${orden.numero} (${orden.clase}) asignada a ${t.nombre}.`);
    return { asignada: true, tecnico: t.nombre };
  }

  /** Mensaje entrante de un técnico: TOMO / EN CAMINO / LISTO / NO PUEDO / MIS. */
  async function comandoTecnico(telefono, texto) {
    const tecnico = tecnicoPorTelefono(telefono);
    const respuestas = [];

    // Si se le avisó por plantilla, ahora que escribió ya podemos mandarle el detalle.
    for (const o of sistema.ordenesDeTecnico(telefono).filter((x) => x.detallePendiente)) {
      sistema.actualizarOrden(o.numero, { detallePendiente: false }, 'Detalle enviado');
      respuestas.push(detalle(o));
    }
    const r = await ejecutarComando(tecnico, telefono, texto);
    if (r) respuestas.push(r);
    return respuestas.length ? respuestas.join('\n\n') : AYUDA;
  }

  async function ejecutarComando(tecnico, telefono, texto) {
    const m = /^\s*(tomo|acepto|en camino|voy|llegu[eé]|listo|resuelto|terminado|no puedo|rechazo|mis|ordenes|órdenes|ayuda)\b\s*#?(\d+)?\s*(.*)$/is.exec(texto);
    if (!m) return null;

    const comando = norm(m[1]);
    if (['mis', 'ordenes', 'ayuda'].includes(comando)) {
      const abiertas = sistema.ordenesDeTecnico(telefono);
      if (comando === 'ayuda') return AYUDA;
      return abiertas.length
        ? abiertas.map((o) => `#${o.numero} · ${o.clase} · ${o.estado} · ${o.direccion}${o.datos?.fecha ? ` · ${o.datos.fecha} ${o.datos.franja}` : ''}`).join('\n')
        : 'No tenés órdenes abiertas 👌';
    }

    const orden = m[2] && sistema.orden(m[2]);
    if (!orden) return `No encontré la orden${m[2] ? ` #${m[2]}` : ''}. ${AYUDA}`;
    if (!orden.tecnico || !mismoTelefono(orden.tecnico.telefono, telefono)) return `La orden #${orden.numero} no está asignada a vos.`;
    if (estaCerrada(orden)) return `La orden #${orden.numero} ya está ${orden.estado}.`;
    const nota = m[3]?.trim() ?? '';

    if (['tomo', 'acepto'].includes(comando)) {
      sistema.actualizarOrden(orden.numero, { estado: 'aceptada' }, `Aceptada por ${tecnico.nombre}`);
      await avisarCliente(orden, `👷 ${tecnico.nombre} tomó tu orden #${orden.numero}. Te avisamos cuando esté en camino.`);
      return `✅ Tomaste la #${orden.numero}. Cuando salgas mandá EN CAMINO ${orden.numero}.`;
    }
    if (['en camino', 'voy'].includes(comando)) {
      sistema.actualizarOrden(orden.numero, { estado: 'en_camino' }, nota);
      await avisarCliente(orden, `🚐 ${tecnico.nombre} va en camino por tu orden #${orden.numero}.`);
      return `Listo, le avisé al cliente. Al terminar mandá LISTO ${orden.numero}.`;
    }
    if (['llegue', 'llegué'].includes(comando)) {
      sistema.actualizarOrden(orden.numero, {}, `Llegó al domicilio. ${nota}`.trim());
      return 'Anotado 👍';
    }
    if (['listo', 'resuelto', 'terminado'].includes(comando)) {
      sistema.actualizarOrden(orden.numero, { estado: 'resuelta', cerrada: new Date().toISOString() }, nota || 'Resuelta');
      await avisarCliente(orden, orden.clase === 'instalacion'
        ? `🎉 ¡Tu instalación quedó lista! Orden #${orden.numero}. Cualquier cosa escribinos por acá.`
        : `✅ El técnico cerró tu orden #${orden.numero}. ¿Ya tenés servicio? Si algo sigue fallando, respondé este mensaje.`);
      await notificarAdmin(`✅ Orden #${orden.numero} resuelta por ${tecnico.nombre}. ${nota}`.trim());
      return `👏 Cerraste la #${orden.numero}.`;
    }
    // no puedo / rechazo
    sistema.actualizarOrden(orden.numero, { estado: 'abierta', tecnico: null }, `${tecnico.nombre} no puede: ${nota || 'sin motivo'}`);
    const r = await despachar(orden, { excluir: [telefono] });
    return r.asignada ? `Ok, la #${orden.numero} pasó a ${r.tecnico}.` : `Ok, la #${orden.numero} queda para asignar desde la oficina.`;
  }

  /** Cancela una orden (ej. el cliente cancela la instalación) y le avisa al técnico. */
  async function cancelar(orden, motivo) {
    sistema.actualizarOrden(orden.numero, { estado: 'cancelada' }, motivo);
    if (orden.tecnico) {
      await whatsapp.enviarTexto(orden.tecnico.telefono, `❌ Se canceló la orden #${orden.numero} (${orden.direccion}). ${motivo}`)
        .catch((e) => log.error?.('[despacho]', e.message));
    }
  }

  return { despachar, comandoTecnico, cancelar, esTecnico: (tel) => Boolean(tecnicoPorTelefono(tel)), tecnicos, detalle };
}
