/**
 * Junta los mensajes que un cliente manda seguidos ("2 mensajes a la vez") en un solo
 * turno y procesa a cada cliente en orden, sin respuestas cruzadas.
 */
export function crearCola(procesar, { esperaMs = 2500, log = console } = {}) {
  const pendientes = new Map(); // telefono -> { textos, timer }
  const cadenas = new Map(); // telefono -> Promise del turno en curso

  const despachar = (telefono) => {
    const { textos } = pendientes.get(telefono);
    pendientes.delete(telefono);
    const previa = cadenas.get(telefono) ?? Promise.resolve();
    const actual = previa
      .then(() => procesar(telefono, textos.join('\n')))
      .catch((e) => log.error?.(`[cola] ${telefono}:`, e.message))
      .finally(() => { if (cadenas.get(telefono) === actual) cadenas.delete(telefono); });
    cadenas.set(telefono, actual);
  };

  return {
    agregar(telefono, texto) {
      const p = pendientes.get(telefono) ?? { textos: [], timer: null };
      p.textos.push(texto);
      clearTimeout(p.timer);
      p.timer = setTimeout(() => despachar(telefono), esperaMs);
      pendientes.set(telefono, p);
    },
    /** Espera a que se vacíe todo (útil en tests y al apagar). */
    async drenar() {
      for (const tel of [...pendientes.keys()]) { clearTimeout(pendientes.get(tel).timer); despachar(tel); }
      await Promise.all([...cadenas.values()]);
    },
  };
}
