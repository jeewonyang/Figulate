/*
 * Figulate — AI provider layer. window.FG.ai
 *
 * Talks directly from the browser to Claude (Anthropic), OpenAI (ChatGPT) or
 * Google Gemini using an API key the user supplies. The key is stored only in
 * this browser's localStorage and sent only to the chosen provider.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const LS_KEY = "op_ai_settings_v1";

  async function parseOrThrow(res) {
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON error body */ }
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.error?.type || data.message)) || res.statusText || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return data;
  }

  const PROVIDERS = {
    anthropic: {
      name: "Claude (Anthropic)",
      keyHint: "sk-ant-…  — create one at console.anthropic.com",
      models: [
        ["claude-opus-4-8", "Claude Opus 4.8 — most capable"],
        ["claude-sonnet-5", "Claude Sonnet 5 — fast + smart"],
        ["claude-haiku-4-5", "Claude Haiku 4.5 — fastest"],
      ],
      async complete(key, model, system, user, maxTokens) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            // Opt-in header required for direct browser (CORS) calls.
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          }),
        });
        const data = await parseOrThrow(res);
        if (data.stop_reason === "refusal") throw new Error("The model declined this request.");
        return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      },
    },
    openai: {
      name: "ChatGPT (OpenAI)",
      keyHint: "sk-…  — create one at platform.openai.com",
      models: [
        ["gpt-5.1", "GPT-5.1"],
        ["gpt-5", "GPT-5"],
        ["gpt-5-mini", "GPT-5 mini — faster"],
        ["gpt-4o", "GPT-4o"],
      ],
      async complete(key, model, system, user, maxTokens) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + key },
          body: JSON.stringify({
            model,
            max_completion_tokens: maxTokens,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        const data = await parseOrThrow(res);
        return data.choices?.[0]?.message?.content || "";
      },
    },
    gemini: {
      name: "Gemini (Google)",
      keyHint: "AIza…  — create one at aistudio.google.com",
      models: [
        ["gemini-flash-latest", "Gemini Flash (latest)"],
        ["gemini-pro-latest", "Gemini Pro (latest) — most capable"],
        ["gemini-flash-lite-latest", "Gemini Flash-Lite (latest) — fastest"],
        ["gemini-2.5-pro", "Gemini 2.5 Pro"],
        ["gemini-2.5-flash", "Gemini 2.5 Flash"],
      ],
      async complete(key, model, system, user, maxTokens) {
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens },
          }),
        });
        const data = await parseOrThrow(res);
        const parts = data.candidates?.[0]?.content?.parts || [];
        return parts.map((p) => p.text || "").join("");
      },
    },
  };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY)) || {};
      s.provider = PROVIDERS[s.provider] ? s.provider : "anthropic";
      s.keys = s.keys || {};
      s.models = s.models || {};
      if (s.autoAnalyze === undefined) s.autoAnalyze = true;
      return s;
    } catch (e) {
      return { provider: "anthropic", keys: {}, models: {}, autoAnalyze: true };
    }
  }
  function save(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  }

  FG.ai = {
    PROVIDERS,
    settings: load,
    saveSettings: save,

    // True when the active provider has an API key.
    configured() {
      const s = load();
      return !!(s.keys[s.provider] || "").trim();
    },

    activeModel(s) {
      s = s || load();
      return s.models[s.provider] || PROVIDERS[s.provider].models[0][0];
    },

    describeActive() {
      const s = load();
      return PROVIDERS[s.provider].name.split(" ")[0] + " · " + this.activeModel(s);
    },

    // One-shot completion with the active provider. Returns the reply text.
    async complete({ system, user, maxTokens = 4000 }) {
      const s = load();
      const p = PROVIDERS[s.provider];
      const key = (s.keys[s.provider] || "").trim();
      if (!key) throw new Error("No API key configured — open AI Settings first.");
      return p.complete(key, this.activeModel(s), system, user, maxTokens);
    },

    // Pull the first JSON object out of a model reply (tolerates ``` fences
    // and surrounding prose).
    extractJSON(text) {
      if (!text) return null;
      let t = String(text).trim();
      const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) t = fence[1].trim();
      const start = t.indexOf("{");
      if (start < 0) return null;
      // Walk to the matching closing brace (strings-aware).
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < t.length; i++) {
        const ch = t[i];
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') inStr = !inStr;
        else if (!inStr && ch === "{") depth++;
        else if (!inStr && ch === "}") {
          depth--;
          if (depth === 0) {
            try { return JSON.parse(t.slice(start, i + 1)); } catch (e) { return null; }
          }
        }
      }
      return null;
    },

    // ---- Settings dialog --------------------------------------------------
    showSettings(onSaved) {
      const s = load();
      const body = document.createElement("div");

      const row = (label, ctrl) => {
        const r = document.createElement("div");
        r.className = "opt-row";
        const l = document.createElement("label");
        l.textContent = label;
        r.append(l, ctrl);
        return r;
      };

      const provSel = document.createElement("select");
      Object.entries(PROVIDERS).forEach(([k, p]) => {
        const o = document.createElement("option");
        o.value = k; o.textContent = p.name;
        provSel.appendChild(o);
      });
      provSel.value = s.provider;

      const modelSel = document.createElement("select");
      const modelCustom = document.createElement("input");
      modelCustom.type = "text";
      modelCustom.placeholder = "custom model id";
      modelCustom.style.cssText = "display:none;width:220px;";

      const keyInp = document.createElement("input");
      keyInp.type = "password";
      keyInp.style.width = "260px";
      keyInp.autocomplete = "off";

      const keyHint = document.createElement("div");
      keyHint.style.cssText = "color:var(--muted);font-size:11px;margin:-2px 0 8px;";

      const fillForProvider = () => {
        const prov = provSel.value;
        const p = PROVIDERS[prov];
        modelSel.innerHTML = "";
        p.models.forEach(([v, t]) => {
          const o = document.createElement("option");
          o.value = v; o.textContent = t;
          modelSel.appendChild(o);
        });
        const custom = document.createElement("option");
        custom.value = "__custom__"; custom.textContent = "Custom model id…";
        modelSel.appendChild(custom);
        const cur = s.models[prov];
        if (cur && p.models.some(([v]) => v === cur)) { modelSel.value = cur; modelCustom.style.display = "none"; }
        else if (cur) { modelSel.value = "__custom__"; modelCustom.value = cur; modelCustom.style.display = ""; }
        else { modelSel.value = p.models[0][0]; modelCustom.style.display = "none"; }
        keyInp.value = s.keys[prov] || "";
        keyInp.placeholder = "API key";
        keyHint.textContent = p.keyHint;
      };
      const rememberCurrent = () => {
        // Keep edits when switching providers within the dialog.
        s.keys[provSel.dataset.prev || s.provider] = keyInp.value;
        s.models[provSel.dataset.prev || s.provider] = modelSel.value === "__custom__" ? modelCustom.value.trim() : modelSel.value;
      };
      provSel.onchange = () => { rememberCurrent(); provSel.dataset.prev = provSel.value; fillForProvider(); };
      provSel.dataset.prev = s.provider;
      modelSel.onchange = () => { modelCustom.style.display = modelSel.value === "__custom__" ? "" : "none"; };

      const autoChk = document.createElement("input");
      autoChk.type = "checkbox";
      autoChk.checked = s.autoAnalyze !== false;

      const status = document.createElement("div");
      status.style.cssText = "font-size:12px;margin-top:8px;min-height:16px;";

      const testBtn = document.createElement("button");
      testBtn.textContent = "Test connection";
      testBtn.onclick = async () => {
        rememberCurrent();
        const prov = provSel.value;
        const key = keyInp.value.trim();
        const model = modelSel.value === "__custom__" ? modelCustom.value.trim() : modelSel.value;
        if (!key) { status.textContent = "Enter an API key first."; status.style.color = "#c0392b"; return; }
        status.textContent = "Testing…"; status.style.color = "var(--muted)";
        try {
          await PROVIDERS[prov].complete(key, model, "Reply with the single word: ok", "ping", 20);
          status.textContent = "✓ Connected — " + model;
          status.style.color = "#1a7a3c";
        } catch (e) {
          status.textContent = "✗ " + e.message;
          status.style.color = "#c0392b";
        }
      };

      body.appendChild(row("Provider", provSel));
      body.appendChild(row("Model", modelSel));
      body.appendChild(row("", modelCustom));
      body.appendChild(row("API key", keyInp));
      body.appendChild(keyHint);
      const autoRow = document.createElement("div");
      autoRow.className = "opt-row";
      autoRow.append(autoChk, Object.assign(document.createElement("label"), { textContent: "Offer AI auto-analysis after importing a file" }));
      body.appendChild(autoRow);
      body.appendChild(testBtn);
      body.appendChild(status);
      const note = document.createElement("div");
      note.style.cssText = "color:var(--muted);font-size:11px;margin-top:10px;";
      note.textContent = "Your key is stored only in this browser (localStorage) and sent only to the provider you chose. Column names and a sample of your data are sent to the provider when you run AI Analyze.";
      body.appendChild(note);

      fillForProvider();

      FG.modal.show({
        title: "AI settings",
        sub: "Choose which AI analyzes your data. You need your own API key for the selected provider.",
        body,
        okLabel: "Save",
        onOk: () => {
          rememberCurrent();
          const out = load();
          out.provider = provSel.value;
          out.keys = { ...out.keys, ...s.keys, [provSel.value]: keyInp.value.trim() };
          out.models = { ...out.models, ...s.models, [provSel.value]: modelSel.value === "__custom__" ? modelCustom.value.trim() : modelSel.value };
          out.autoAnalyze = autoChk.checked;
          save(out);
          FG.setStatus("AI settings saved (" + FG.ai.describeActive() + ").");
          if (onSaved) onSaved(out);
        },
      });
    },
  };
})();
