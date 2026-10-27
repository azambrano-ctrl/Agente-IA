import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { parsearCsv } from './csv.js';
import { ErrorHerramienta } from './errores.js';
import { mismoTelefono } from './telefono.js';

const HTML = readFileSync(new URL('./panel.html', import.meta.url), 'utf8');

const igual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Panel de la oficina: órdenes, técnicos, clientes y pagos. Protegido con usuario y clave. */
export function crearPanel({ usuario, clave, sistema, despacho, agenda }) {
  const autorizado = (req) => {
    const [tipo, valor] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Basic' || !valor) return false;
    const [u, ...resto] = Buffer.from(valor, 'base64').toString('utf8').split(':');
    return igual(u, usuario) && igual(resto.join(':'), clave);
  };

  const leer = async (req) => {
    const partes = [];
    for await (const p of req) partes.push(p);
    return Buffer.concat(partes).toString('utf8');
  };

  /** Devuelve true si atendió la petición. */
  return async function panel(req, res, url) {
    if (!url.pathname.startsWith('/panel') && !url.pathname.startsWith('/api/')) return false;
    const json = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));

    if (!clave) { res.writeHead(404).end('Panel deshabilitado: configurá PANEL_CLAVE'); return true; }
    if (!autorizado(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Panel", charset="UTF-8"' }).end('Acceso restringido');
      return true;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/panel') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(HTML);
      } else if (req.method === 'GET' && url.pathname === '/api/resumen') {
        json(200, {
          ordenes: sistema.ordenes({ limite: 300 }),
          tecnicos: despacho.tecnicos().map((t) => ({ ...t, abiertas: sistema.ordenesDeTecnico(t.telefono).length })),
          clientes: sistema.buscarClientes().length,
        });
      } else if (req.method === 'GET' && url.pathname === '/api/clientes') {
        json(200, sistema.buscarClientes(url.searchParams.get('q') ?? '').slice(0, 100));
      } else if (req.method === 'POST' && url.pathname === '/api/clientes/importar') {
        json(200, sistema.importarClientes(parsearCsv(await leer(req))));
      } else if (req.method === 'POST' && /^\/api\/clientes\/[^/]+\/pago$/.test(url.pathname)) {
        const { importe } = JSON.parse(await leer(req));
        json(200, sistema.registrarPago(decodeURIComponent(url.pathname.split('/')[3]), importe));
      } else if (req.method === 'POST' && /^\/api\/ordenes\/\d+$/.test(url.pathname)) {
        const num = Number(url.pathname.split('/')[3]);
        const orden = sistema.orden(num);
        if (!orden) return json(404, { error: 'No existe la orden' }), true;
        const { accion, tecnico, estado, nota } = JSON.parse(await leer(req));
        if (accion === 'asignar') {
          const t = despacho.tecnicos().find((x) => mismoTelefono(x.telefono, tecnico));
          if (!t) return json(400, { error: 'Técnico desconocido' }), true;
          await despacho.despachar(orden, { tecnico: t });
        } else if (estado === 'cancelada') {
          agenda.liberarOrden(num);
          await despacho.cancelar(orden, nota || 'Cancelada desde la oficina');
        } else {
          sistema.actualizarOrden(num, { estado }, nota || 'Cambio desde el panel');
        }
        json(200, sistema.orden(num));
      } else {
        json(404, { error: 'no encontrado' });
      }
    } catch (e) {
      json(e instanceof ErrorHerramienta || e instanceof SyntaxError ? 400 : 500, { error: e.message });
    }
    return true;
  };
}
