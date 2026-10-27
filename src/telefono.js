/** Solo dígitos. */
export const digitos = (t) => String(t ?? '').replace(/\D/g, '');

/**
 * Compara por los últimos 10 dígitos: así "3515551234", "+54 9 351 555-1234"
 * y el wa_id "5493515551234" que manda WhatsApp son el mismo número.
 */
export function mismoTelefono(a, b) {
  const x = digitos(a).slice(-10);
  const y = digitos(b).slice(-10);
  return x.length >= 8 && x === y;
}
