import { digitos, mismoTelefono } from './telefono.js';

/**
 * Fuente de datos de clientes y saldos. Dos opciones:
 *  - local: la planilla CSV importada al sistema del agente.
 *  - crm:   el servidor (VPS) que ya consulta saldos en el CRM, por HTTP.
 * Las dos devuelven { cliente, verificado } o { error }.
 */

export function fuenteLocal(sistema) {
  return {
    tipo: 'local',
    porTelefono: true,
    async buscar({ telefono, dni, numeroCliente }) {
      if (telefono) {
        const c = sistema.clientePorTelefono(telefono);
        if (c) return { cliente: c, verificado: true };
      }
      if (dni && numeroCliente) {
        const c = sistema.clientePorDatos(dni, numeroCliente);
        return c ? { cliente: c, verificado: true } : { cliente: null };
      }
      return { cliente: null };
    },
  };
}

// Nombres de campo habituales (sin importar mayúsculas, guiones ni anidamiento en data/cliente/result).
const ALIAS = {
  numeroCliente: ['numerocliente', 'nrocliente', 'numero_cliente', 'nro_cliente', 'codigo', 'codigocliente', 'idcliente', 'id_cliente', 'abonado', 'cliente_id', 'id'],
  nombre: ['nombre', 'nombrecompleto', 'razonsocial', 'cliente', 'name', 'titular', 'apellidoynombre'],
  dni: ['dni', 'documento', 'nrodocumento', 'cuit', 'cuil', 'doc'],
  telefono: ['telefono', 'celular', 'movil', 'whatsapp', 'tel', 'phone'],
  direccion: ['direccion', 'domicilio', 'calle', 'address'],
  zona: ['zona', 'barrio', 'localidad', 'sector', 'nodo'],
  plan: ['plan', 'servicio', 'producto', 'velocidad'],
  estado: ['estado', 'status', 'situacion', 'estadoservicio'],
  saldo: ['saldo', 'deuda', 'saldoactual', 'total', 'totaladeudado', 'importe', 'monto', 'balance', 'debe'],
  vencimiento: ['vencimiento', 'fechavencimiento', 'vence', 'proximovencimiento', 'duedate'],
  ultimoPago: ['ultimopago', 'fechaultimopago', 'ultimo_pago', 'lastpayment'],
};
const clave = (k) => k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const leerRuta = (obj, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function aplanar(obj, salida = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) aplanar(v, salida);
    else if (!(clave(k) in salida)) salida[clave(k)] = v;
  }
  return salida;
}

const montoNumero = (v) => {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!t) return null;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t);
};

/** Convierte la respuesta del VPS al formato del agente. `campos` permite fijar rutas, ej. {"saldo": "data.deuda"}. */
export function normalizarCliente(json, campos = {}) {
  let base = Array.isArray(json) ? json[0] : json;
  if (base && typeof base === 'object') {
    for (const k of ['cliente', 'data', 'result', 'resultado', 'datos']) {
      const v = base[k];
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') base = { ...base, ...v[0] };
    }
  }
  if (!base || typeof base !== 'object') return null;
  const plano = aplanar(base);
  if (plano.encontrado === false || plano.found === false || plano.existe === false) return null;

  const c = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const v = campos[campo] ? leerRuta(base, campos[campo]) : alias.map((a) => plano[a]).find((x) => x !== undefined && x !== null && x !== '');
    if (v !== undefined) c[campo] = v;
  }
  if (!Object.keys(c).length) return null;
  if (c.saldo !== undefined) c.saldo = montoNumero(c.saldo);
  if (c.dni) c.dni = digitos(c.dni);
  if (c.telefono) c.telefono = digitos(c.telefono);
  if (c.numeroCliente !== undefined) c.numeroCliente = String(c.numeroCliente);
  if (c.estado) {
    const e = String(c.estado).toLowerCase();
    c.estado = /susp|cort|bloq|inactiv|moros/.test(e) ? 'suspendido' : /baja/.test(e) ? 'baja' : 'activo';
  }
  return c;
}

/**
 * Servidor de saldos (VPS) por HTTP.
 * url: plantilla con {dni}, {numeroCliente} y/o {telefono}, ej. http://10.0.0.5:8080/saldo?dni={dni}
 */
export function fuenteCrm({ url, metodo = 'GET', token = '', headers = {}, campos = {}, timeoutMs = 10000 }, fetchFn = fetch) {
  const usa = (p) => url.includes(`{${p}}`);
  const porTelefono = usa('telefono');

  async function consultar(valores) {
    const destino = url.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(valores[k] ?? ''));
    const res = await fetchFn(destino, {
      method: metodo,
      headers: {
        Accept: 'application/json, text/plain',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(metodo !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: metodo !== 'GET' ? JSON.stringify(valores) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return null;
    const texto = await res.text();
    if (!res.ok) throw new Error(`servidor de saldos ${res.status}: ${texto.slice(0, 200)}`);
    let json;
    try { json = JSON.parse(texto); } catch {
      // Respuesta en texto: se la pasamos tal cual al agente para que la lea.
      return texto.trim() ? { texto: texto.trim().slice(0, 1500) } : null;
    }
    const c = normalizarCliente(json, campos);
    if (c && c.saldo === undefined) c.respuestaCompleta = JSON.stringify(json).slice(0, 1500);
    return c;
  }

  return {
    tipo: 'crm',
    porTelefono,
    async buscar({ telefono, dni, numeroCliente }) {
      try {
        // 1) Por el número de WhatsApp, si el VPS lo permite.
        if (porTelefono && telefono) {
          const local = digitos(telefono).slice(-10);
          const c = await consultar({ telefono: local, telefonoCompleto: digitos(telefono), dni: '', numeroCliente: '' });
          if (c) return { cliente: c, verificado: true };
        }
        // 2) Por DNI y/o número de cliente.
        const faltan = ['dni', 'numeroCliente'].filter((p) => usa(p) && !(p === 'dni' ? dni : numeroCliente));
        if (!dni && !numeroCliente) return { cliente: null };
        if (faltan.length) return { cliente: null, faltan };
        const c = await consultar({ dni: digitos(dni), numeroCliente: String(numeroCliente ?? '').trim(), telefono: '' });
        if (!c) return { cliente: null };
        // Verificación: el teléfono del CRM coincide, o el cliente dio DNI y número de cliente y coinciden.
        const okTelefono = c.telefono && mismoTelefono(c.telefono, telefono);
        const okDatos = dni && numeroCliente && (!c.dni || c.dni === digitos(dni)) && (!c.numeroCliente || c.numeroCliente === String(numeroCliente).trim());
        if (okTelefono || okDatos) return { cliente: c, verificado: true };
        if (c.dni && dni && c.dni !== digitos(dni)) return { cliente: null };
        return { cliente: null, pedirAmbos: true };
      } catch (e) {
        return { error: `El sistema de saldos no responde (${e.message}).` };
      }
    },
  };
}

/** Avisa al VPS de cada orden nueva o cambio de estado (para cargarla en el CRM si quieren). */
export function crearAvisoCrm({ url, token = '' }, fetchFn = fetch, log = console) {
  if (!url) return () => {};
  return (evento, orden) => {
    fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ evento, orden }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => { if (!r.ok) log.error?.(`[crm] aviso ${evento} #${orden.numero}: HTTP ${r.status}`); })
      .catch((e) => log.error?.(`[crm] aviso ${evento} #${orden.numero}:`, e.message));
  };
}
