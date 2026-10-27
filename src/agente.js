import { definiciones, ejecutar } from './herramientas.js';
import { promptSistema } from './negocio.js';

const MAX_PASOS = 6;
const MAX_LARGO = 2000;
export const RESPUESTA_ERROR = 'Perdón, tuve un problema técnico. ¿Me lo repetís en un ratito? 🙏';

/** El cerebro: conversa, recuerda, responde sobre el negocio y actúa con herramientas. */
export function crearAgente({ negocio, memoria, agenda, completar, log = console }) {
  return async function responder(telefono, texto) {
    const entrada = texto.slice(0, MAX_LARGO);
    const mensajes = [
      { role: 'system', content: promptSistema(negocio) },
      ...memoria.historial(telefono).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: entrada },
    ];

    try {
      for (let paso = 0; paso < MAX_PASOS; paso++) {
        const msg = await completar(mensajes, definiciones);
        const llamadas = msg.tool_calls ?? [];
        if (!llamadas.length) {
          const respuesta = msg.content?.trim() || RESPUESTA_ERROR;
          memoria.agregar(telefono, { role: 'user', content: entrada }, { role: 'assistant', content: respuesta });
          return respuesta;
        }
        mensajes.push({ role: 'assistant', content: msg.content ?? '', tool_calls: llamadas });
        for (const ll of llamadas) {
          let args = {};
          try { args = JSON.parse(ll.function.arguments || '{}'); } catch { /* args inválidos: se reporta abajo */ }
          const resultado = ejecutar(ll.function.name, args, { agenda, memoria, telefono });
          log.info?.(`[herramienta] ${telefono} ${ll.function.name}(${JSON.stringify(args)}) →`, JSON.stringify(resultado));
          mensajes.push({ role: 'tool', tool_call_id: ll.id, content: JSON.stringify(resultado) });
        }
      }
      throw new Error('Se alcanzó el máximo de pasos con herramientas');
    } catch (e) {
      log.error?.(`[agente] ${telefono}:`, e.message);
      return RESPUESTA_ERROR;
    }
  };
}
