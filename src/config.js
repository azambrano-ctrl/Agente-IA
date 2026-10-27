import { existsSync } from 'node:fs';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  dataDir: path.resolve(env.DATA_DIR ?? './data'),
  negocioFile: path.resolve(env.NEGOCIO_FILE ?? './negocio.json'),
  maxHistorial: Number(env.MAX_HISTORIAL ?? 20),
  debounceMs: Number(env.DEBOUNCE_MS ?? 2500),
  adminWhatsapp: (env.ADMIN_WHATSAPP ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  whatsapp: {
    token: env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
    appSecret: env.WHATSAPP_APP_SECRET ?? '',
    apiVersion: env.WHATSAPP_API_VERSION ?? 'v21.0',
    plantillaTecnico: {
      nombre: env.WHATSAPP_PLANTILLA_TECNICO ?? '',
      idioma: env.WHATSAPP_PLANTILLA_IDIOMA ?? 'es_AR',
    },
  },
  panel: {
    usuario: env.PANEL_USUARIO ?? 'admin',
    clave: env.PANEL_CLAVE ?? '',
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY ?? '',
    modelo: env.MODELO ?? 'openai/gpt-4o-mini',
    url: env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1/chat/completions',
  },
};

export function faltantes(claves) {
  const valores = {
    WHATSAPP_TOKEN: config.whatsapp.token,
    WHATSAPP_PHONE_NUMBER_ID: config.whatsapp.phoneNumberId,
    WHATSAPP_VERIFY_TOKEN: config.whatsapp.verifyToken,
    OPENROUTER_API_KEY: config.openrouter.apiKey,
  };
  return claves.filter((c) => !valores[c]);
}
