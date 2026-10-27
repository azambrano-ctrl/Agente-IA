/** Paso 3: cliente de OpenRouter (API compatible con OpenAI). Cambiás de modelo con una línea. */
export function crearModelo({ apiKey, modelo, url }, fetchFn = fetch) {
  return async function completar(mensajes, herramientas) {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Agente IA WhatsApp',
      },
      body: JSON.stringify({ model: modelo, messages: mensajes, tools: herramientas, temperature: 0.3 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const mensaje = data.choices?.[0]?.message;
    if (!mensaje) throw new Error(`Respuesta inesperada de OpenRouter: ${JSON.stringify(data)}`);
    return mensaje;
  };
}
