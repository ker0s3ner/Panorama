// POST /api/intel/ai — forwards one analyst prompt to the model provider the
// user chose in Settings. The key arrives per request from the browser's local
// storage, is used once, and is never logged or stored here.
const MAX_BODY = 64 * 1024;
const TIMEOUT_MS = 45_000;
const MAX_OUT = 700;

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { code: 'BIG' }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const send = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
};

async function callAnthropic({ model, key, system, prompt }, signal) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: MAX_OUT, system, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Anthropic ${r.status}`);
  return (j.content || []).map((p) => p.text || '').join('').trim();
}

async function callOpenAiCompatible({ model, key, baseUrl, system, prompt }, signal) {
  const base = String(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${key || 'none'}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: MAX_OUT,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Provider ${r.status}`);
  return String(j.choices?.[0]?.message?.content || '').trim();
}

export function intelAiProxy() {
  return {
    name: 'gev-intel-ai',
    configureServer(server) {
      server.middlewares.use('/api/intel/ai', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const p = JSON.parse(await readBody(req));
          const provider = String(p.provider || '');
          const model = String(p.model || '').slice(0, 120);
          const key = String(p.key || '').slice(0, 400);
          const prompt = String(p.prompt || '').slice(0, 12000);
          const system = String(p.system || '').slice(0, 4000);
          if (!model || !prompt) return send(res, 400, { error: 'model and prompt are required' });
          const local = provider === 'local';
          if (!key && !local) return send(res, 400, { error: 'Add an API key in Settings → AI.' });
          const signal = AbortSignal.timeout(TIMEOUT_MS);
          let text;
          if (provider === 'anthropic') text = await callAnthropic({ model, key, system, prompt }, signal);
          else if (provider === 'openai') text = await callOpenAiCompatible({ model, key, system, prompt }, signal);
          else if (provider === 'openrouter')
            text = await callOpenAiCompatible({ model, key, baseUrl: 'https://openrouter.ai/api/v1', system, prompt }, signal);
          else if (local)
            text = await callOpenAiCompatible({ model, key, baseUrl: p.baseUrl || 'http://127.0.0.1:11434/v1', system, prompt }, signal);
          else return send(res, 400, { error: 'unknown provider' });
          send(res, 200, { text });
        } catch (e) {
          send(res, e?.code === 'BIG' ? 413 : 502, { error: String(e?.message || 'AI request failed').slice(0, 300) });
        }
      });
    },
  };
}
