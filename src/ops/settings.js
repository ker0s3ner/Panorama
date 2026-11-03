// Settings: preferences, AI analyst model and keys, feed toggles.
// Everything is stored in this browser only. Data-provider keys (flights,
// maps, cameras…) stay in the app's existing Provider Settings; a button here
// opens it.
const KEY = 'gev.ops.settings.v1';

export const MODELS = {
  anthropic: { label: 'Anthropic', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'] },
  openai: { label: 'OpenAI', models: ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini'] },
  openrouter: { label: 'OpenRouter', models: ['anthropic/claude-sonnet-5-5', 'openai/gpt-4.1', 'google/gemini-2.5-pro'] },
  local: { label: 'Local (Ollama / LM Studio)', models: ['llama3.1', 'qwen2.5', 'mistral'] },
};

export const DEFAULTS = {
  units: 'km',
  refreshMin: 5,
  borders: true,
  nearbyTraffic: true,
  disabledFeeds: [],
  ai: { provider: 'anthropic', model: 'claude-sonnet-5-5', key: '', baseUrl: 'http://127.0.0.1:11434/v1' },
};

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return { ...DEFAULTS, ...raw, ai: { ...DEFAULTS.ai, ...(raw?.ai || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* best effort */
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Run one prompt through the configured model. */
export async function askAi(settings, { system, prompt }) {
  const { provider, model, key, baseUrl } = settings.ai;
  const res = await fetch('/api/intel/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, model, key, baseUrl, system, prompt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `AI request failed (${res.status})`);
  return body.text;
}

/**
 * Open the settings dialog.
 * @param {{settings: object, sources: Array, onChange: (s: object) => void}} ctx
 */
export function openSettings({ settings, sources, onChange }) {
  const s = structuredClone(settings);
  const host = document.createElement('div');
  host.id = 'ops-settings';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', 'Settings');
  const commit = () => {
    saveSettings(s);
    onChange(structuredClone(s));
  };

  const render = () => {
    const prov = MODELS[s.ai.provider];
    host.innerHTML = `
      <div class="st-box">
        <header><h2>Settings</h2><button type="button" class="ops-x" data-st-close aria-label="Close">×</button></header>
        <div class="st-body">
          <section>
            <h3>AI analyst</h3>
            <p class="ops-note">Writes plain-language briefs from the incident, live context and options. Keys stay in this browser and are sent only to the provider you pick.</p>
            <label>Provider<select data-k="provider">${Object.entries(MODELS).map(([k, v]) => `<option value="${k}"${k === s.ai.provider ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
            <label>Model<input list="st-models" data-k="model" value="${esc(s.ai.model)}" spellcheck="false" /><datalist id="st-models">${prov.models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></label>
            ${s.ai.provider === 'local' ? `<label>Base URL<input data-k="baseUrl" value="${esc(s.ai.baseUrl)}" spellcheck="false" /></label>` : `<label>API key<input type="password" data-k="key" value="${esc(s.ai.key)}" placeholder="paste key" autocomplete="off" spellcheck="false" /></label>`}
            <button type="button" class="ops-cta" data-test>Test connection</button><span class="st-out" data-out></span>
          </section>
          <section>
            <h3>Data provider keys</h3>
            <p class="ops-note">Flights, maps, cameras, weather and ships use the app’s own key manager (written to this checkout’s .env).</p>
            <button type="button" class="ops-wide" data-keys style="margin:0;width:auto">Open provider keys</button>
          </section>
          <section>
            <h3>Display</h3>
            <label>Distance units<select data-k="units"><option value="km"${s.units === 'km' ? ' selected' : ''}>Kilometres</option><option value="mi"${s.units === 'mi' ? ' selected' : ''}>Miles</option></select></label>
            <label>Refresh feeds every<select data-k="refreshMin">${[1, 5, 15, 30].map((m) => `<option value="${m}"${m === s.refreshMin ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
            <label class="chk"><input type="checkbox" data-k="borders"${s.borders ? ' checked' : ''}/> Country borders on the map</label>
            <label class="chk"><input type="checkbox" data-k="nearbyTraffic"${s.nearbyTraffic ? ' checked' : ''}/> Show nearby aircraft and ships for the open incident</label>
          </section>
          <section>
            <h3>News &amp; video sources</h3>
            <div class="st-feeds">${sources.map((f) => `<label class="chk"><input type="checkbox" data-feed="${esc(f.id)}"${s.disabledFeeds.includes(f.id) ? '' : ' checked'}/> ${esc(f.name)}<em>${f.error ? esc(f.error) : f.count}</em></label>`).join('') || '<span class="ops-note">Loading…</span>'}</div>
          </section>
        </div>
      </div>`;
  };
  render();
  document.body.append(host);

  host.addEventListener('click', async (e) => {
    if (e.target === host || e.target.closest('[data-st-close]')) return host.remove();
    if (e.target.closest('[data-keys]')) {
      host.remove();
      document.getElementById('key-setup-chip')?.click();
    }
    if (e.target.closest('[data-test]')) {
      const out = host.querySelector('[data-out]');
      out.textContent = 'Testing…';
      try {
        const text = await askAi(s, { system: 'Reply with one short word.', prompt: 'Say ready.' });
        out.textContent = `OK: ${text.slice(0, 40)}`;
      } catch (err) {
        out.textContent = err.message;
      }
    }
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    const k = t.dataset.k;
    if (t.dataset.feed) {
      const id = t.dataset.feed;
      s.disabledFeeds = t.checked ? s.disabledFeeds.filter((x) => x !== id) : [...new Set([...s.disabledFeeds, id])];
    } else if (k === 'provider') {
      s.ai.provider = t.value;
      s.ai.model = MODELS[t.value].models[0];
      commit();
      return render();
    } else if (['model', 'key', 'baseUrl'].includes(k)) s.ai[k] = t.value.trim();
    else if (k === 'refreshMin') s.refreshMin = Number(t.value);
    else if (t.type === 'checkbox') s[k] = t.checked;
    else if (k) s[k] = t.value;
    commit();
  });
  return host;
}
