/** CSV simple (separador "," o ";", comillas dobles), tal como lo exporta Excel. */
export function parsearCsv(texto) {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';

  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }

  const [encabezado, ...resto] = filas.filter((f) => f.some((v) => v.trim()));
  if (!encabezado) return [];
  const claves = encabezado.map((h) => h.trim());
  return resto.map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])));
}
