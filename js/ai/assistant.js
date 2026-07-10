/*
 * Figulate — AI auto-analysis. window.FG.aiAssist
 *
 * "AI Analyze" takes the current data table, detects what each column is,
 * picks the right table type, runs the appropriate statistics and
 * builds a graph — either by asking the configured AI provider (FG.ai) for a
 * plan, or with the built-in offline heuristics (FG.detect) when no API key
 * is set. The AI's plan is validated against the analysis catalog before
 * anything runs.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;

  const GRAPH_KINDS = ["column", "bar", "box", "violin", "xy", "grouped", "survival", "pie"];
  const TABLE_TYPES = ["column", "grouped", "xy", "contingency", "survival", "parts", "multiple"];
  const GRAPH_OPT_KEYS = ["title", "xTitle", "yTitle", "plotStyle", "errorBar", "showPoints", "showRegression", "nonlinearModel", "groupedStyle", "yLog", "xLog", "connectLine"];

  // Analysis kinds the app can actually run for a given table type.
  function allowedKinds(tableType) {
    const cats = FG.analyze.CATALOG[tableType] || [];
    const kinds = [];
    cats.forEach((c) => c.items.forEach((it) => kinds.push(it.kind)));
    return kinds;
  }

  // ---- Table sampling for the prompt --------------------------------------
  function sampleTable(table, maxVals) {
    maxVals = maxVals || 12;
    const layout = M.columnLayout(table);
    const cols = [];
    layout.slice(0, 30).forEach((col, flatIdx) => {
      const label = col.dataset.title + (col.dataset.sub > 1 ? "·" + (col.subIndex + 1) : "");
      const vals = [];
      for (let r = 0; r < table.grid.length && vals.length < maxVals; r++) {
        const v = table.grid[r] && table.grid[r][flatIdx];
        if (v !== undefined && v !== "") vals.push(String(v));
      }
      cols.push({ label, datasetIndex: col.datasetIndex, values: vals });
    });
    return cols;
  }

  // Per-dataset value arrays for the offline detector.
  function datasetColumns(table) {
    const layout = M.columnLayout(table);
    return table.datasets.map((ds, di) => {
      const vals = [];
      layout.forEach((c, flatIdx) => {
        if (c.datasetIndex !== di) return;
        table.grid.forEach((r) => {
          if (r && r[flatIdx] !== undefined && r[flatIdx] !== "") vals.push(r[flatIdx]);
        });
      });
      return { title: ds.title, values: vals };
    });
  }

  // ---- Prompt --------------------------------------------------------------
  function buildPrompt(table, localGuess, context) {
    const sample = sampleTable(table);
    const lines = sample.map((c) => `  [${c.datasetIndex}] "${c.label}": ${c.values.join(", ") || "(empty)"}`);
    const rowLabels = (table.rowLabels || []).filter((l) => l).slice(0, 12);

    const system = [
      "You are the analysis assistant inside Figulate, a scientific graphing and statistics app.",
      "Given a data table, decide the column types, the best table type, which statistical analyses to run, and what graph to draw.",
      "Reply with ONLY a JSON object, no prose, matching this schema:",
      '{"tableType": "column|grouped|xy|contingency|survival|parts|multiple",',
      ' "columns": [{"index": 0, "name": "...", "dtype": "numeric|integer|binary|categorical|empty", "role": "X|Y|time|event"}],',
      ' "analyses": [{"kind": "...", "options": {...}}],',
      ' "graph": {"kind": "column|bar|box|violin|xy|grouped|survival|pie", "title": "...", "xTitle": "...", "yTitle": "...", "plotStyle": "bar|meanSD|meanSEM|scatter|box|violin", "errorBar": "sd|sem|ci|none", "showPoints": true, "showRegression": false},',
      ' "summary": "2-3 plain-language sentences for the scientist about what the data looks like and why you chose these analyses"}',
      "",
      "Analysis kinds by table type (only these are runnable):",
      "- column: describe, normality, ttest{colA,colB,welch}, pairedt{colA,colB}, onesample{colA,mu0}, mannwhitney{colA,colB}, wilcoxon{colA,colB}, anova{posthoc: tukey|holm-sidak|sidak|bonferroni|none}, welchanova, kruskal",
      "- grouped: multiplet{colA,colB,paired,welch,correction: holm-sidak|bonferroni|fdr-bh|fdr-bky|none}, twoway",
      "- xy: pearson{colY}, spearman{colY}, linreg{colY}, nonlinreg{colY,nlmodel}",
      "- contingency: chisquare",
      "- survival: km",
      "- parts: describe",
      "- multiple: describe, pearson{colA,colB}",
      "colA/colB/colY are 0-based dataset indices (for xy, dataset 0 is X and colY must be >= 1).",
      "Nonlinear regression models (nlmodel for nonlinreg): " + Object.entries(FG.stats.NLMODELS).map(([k, m]) => `${k} (${m.name})`).join(", ") + ".",
      "Prefer 1-2 analyses that a scientist would actually run first. Suggest short, publication-style axis titles (with units if guessable from the column names).",
      "If the user provides guidance about the data or the analysis they want, it takes priority over your own inference — follow it.",
    ].join("\n");

    const user = [
      `Table name: "${table.name}"  (currently a ${table.type} table)`,
      `Columns (index = dataset index, values are a sample of the first rows):`,
      ...lines,
      rowLabels.length ? `Row labels: ${rowLabels.join(", ")}` : "",
      localGuess ? `A local heuristic guessed tableType="${localGuess.tableType}" (${localGuess.reason}) — override it if the data says otherwise.` : "",
      context ? `USER GUIDANCE (follow this over auto-detection): ${context}` : "",
      "Return the JSON plan now.",
    ].filter(Boolean).join("\n");

    return { system, user };
  }

  // ---- Plan validation ------------------------------------------------------
  function sanitizePlan(plan, table) {
    if (!plan || typeof plan !== "object") return null;
    const out = {};
    out.tableType = TABLE_TYPES.includes(plan.tableType) ? plan.tableType : table.type;
    out.columns = Array.isArray(plan.columns) ? plan.columns.filter((c) => c && typeof c.index === "number") : [];
    const kinds = allowedKinds(out.tableType);
    out.analyses = (Array.isArray(plan.analyses) ? plan.analyses : [])
      .filter((a) => a && kinds.includes(a.kind))
      .slice(0, 3)
      .map((a) => ({ kind: a.kind, options: (a.options && typeof a.options === "object") ? a.options : {} }));
    const g = plan.graph && typeof plan.graph === "object" ? plan.graph : {};
    out.graph = { kind: GRAPH_KINDS.includes(g.kind) ? g.kind : null };
    GRAPH_OPT_KEYS.forEach((k) => { if (g[k] !== undefined) out.graph[k] = g[k]; });
    out.summary = typeof plan.summary === "string" ? plan.summary : "";
    return out;
  }

  // Offline plan from FG.detect, shaped like an AI plan.
  function localPlan(table) {
    const cols = datasetColumns(table);
    const guess = FG.detect.suggestTableType(cols, { rowLabels: table.rowLabels });
    const nGroups = guess.columns.filter((c) => c.dtype !== "empty" && c.role === "Y").length || cols.length;
    const p = FG.detect.suggestPlan(guess.tableType, nGroups);
    return sanitizePlan({
      tableType: guess.tableType,
      columns: guess.columns.map((c) => ({ index: c.index, name: c.title, dtype: c.dtype, role: c.role })),
      analyses: p.analyses,
      graph: { ...p.graph, title: table.name },
      summary: guess.reason,
    }, table);
  }

  // ---- Apply the plan -------------------------------------------------------
  function defaultGraphKind(tableType) {
    return { column: "column", grouped: "grouped", xy: "xy", survival: "survival", parts: "pie", contingency: "bar", multiple: "column" }[tableType] || "column";
  }

  function applyPlan(app, table, plan, sourceLabel) {
    app.snapshot();

    if (plan.tableType !== table.type) M.convertTable(table, plan.tableType);

    // Run the suggested analyses (skip any that fail on this data).
    const ran = [];
    plan.analyses.forEach((a) => {
      const result = FG.analyze.run(a.kind, table, a.options);
      if (!result) return;
      const item = FG.analyze.itemFor(table, a.kind);
      const an = {
        id: M.uid("an"), tableId: table.id, kind: a.kind,
        name: (item ? item.name : a.kind) + " (AI)", options: a.options, result,
      };
      app.project.analyses.push(an);
      ran.push(an);
    });

    // Build the graph.
    const kind = plan.graph.kind || defaultGraphKind(plan.tableType);
    const g = {
      id: M.uid("gr"), tableId: table.id, name: (plan.graph.title || table.name) + " — graph",
      kind, options: FG.plot.defaultOptions(kind), annotations: [], stars: [],
    };
    GRAPH_OPT_KEYS.forEach((k) => { if (plan.graph[k] !== undefined && k !== "kind") g.options[k] = plan.graph[k]; });
    if (!g.options.title) g.options.title = table.name;
    if (table.type === "xy" && !g.options.xTitle) g.options.xTitle = table.xTitle || "X";

    // Bridge the analyses onto the graph so fitted lines/curves actually
    // overlay: a nonlinreg analysis carries the model in its own options
    // (nlmodel), and linreg/pearson imply the regression line — the graph
    // only draws these when g.options.nonlinearModel / showRegression are set.
    if (kind === "xy") {
      const nl = ran.find((a) => a.kind === "nonlinreg");
      const lin = ran.find((a) => a.kind === "linreg" || a.kind === "pearson");
      if (nl) {
        g.options.nonlinearModel = nl.options.nlmodel || "logistic4";
        g.options.showRegression = false; // the nonlinear curve wins — no straight line on top
        if (plan.graph.connectLine === undefined) g.options.connectLine = false; // let the smooth fit show
      } else if (lin && plan.graph.showRegression === undefined) {
        g.options.showRegression = true;
        if (plan.graph.connectLine === undefined) g.options.connectLine = false;
      }
    }
    app.project.graphs.push(g);

    // Significance stars from a fresh ANOVA/t-test result, when applicable.
    if (["column", "bar", "box", "violin"].includes(kind) && ran.some((a) => a.result && a.result.comparisons)) {
      try { FG.editor.autoStars(g, table); } catch (e) { /* not enough data */ }
    }

    app.openGraph(g.id);
    FG.setStatus(`Auto-analysis (${sourceLabel}): ${ran.length} analysis(es) + 1 graph created. Ctrl+Z undoes everything.`);
    showReport(plan, ran, sourceLabel);
    return { analyses: ran, graph: g };
  }

  function showReport(plan, ran, sourceLabel) {
    const body = document.createElement("div");
    if (plan.summary) {
      const p = document.createElement("div");
      p.className = "callout";
      p.textContent = plan.summary;
      body.appendChild(p);
    }
    if (plan.columns.length) {
      const h = document.createElement("div");
      h.className = "analyze-cat";
      h.textContent = "Detected columns";
      body.appendChild(h);
      const tbl = document.createElement("table");
      tbl.className = "res";
      tbl.innerHTML = "<tr><th class='lbl'>Column</th><th>Type</th><th>Role</th></tr>";
      plan.columns.slice(0, 20).forEach((c) => {
        const tr = document.createElement("tr");
        [c.name || "#" + c.index, c.dtype || "?", c.role || "Y"].forEach((v, i) => {
          const td = document.createElement("td");
          if (i === 0) td.className = "lbl";
          td.textContent = v;
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      body.appendChild(tbl);
    }
    const h2 = document.createElement("div");
    h2.className = "analyze-cat";
    h2.textContent = "Created";
    body.appendChild(h2);
    const ul = document.createElement("ul");
    ul.style.margin = "4px 0";
    ran.forEach((a) => { const li = document.createElement("li"); li.textContent = a.name; ul.appendChild(li); });
    const gi = document.createElement("li");
    gi.textContent = "Graph (table type: " + plan.tableType + ")";
    ul.appendChild(gi);
    body.appendChild(ul);
    FG.modal.show({
      title: "Auto-analysis complete",
      sub: "Detected by " + sourceLabel + ". Everything is in the navigator on the left — Ctrl+Z undoes it all.",
      body, okLabel: "OK", hideCancel: true,
    });
  }

  FG.aiAssist = {
    // Run the analysis. opts.context = optional free-text guidance from the
    // user (what the data is / which analysis they want) — passed to the AI.
    async run(table, app, opts) {
      opts = opts || {};
      if (!table) { FG.setStatus("Create or import a data table first."); return; }
      const hasData = table.grid.some((r) => r && r.some((v) => v !== "" && v !== undefined));
      if (!hasData) { FG.setStatus("This table is empty — enter or import data first."); return; }

      const local = localPlan(table);

      if (!FG.ai.configured()) {
        const note = opts.context
          ? "built-in heuristics — your guidance was ignored (free-text needs an AI key, see AI ⚙)"
          : "built-in heuristics (no AI key — set one in AI Settings for smarter analysis)";
        applyPlan(app, table, local, note);
        return;
      }

      const label = FG.ai.describeActive();
      FG.setStatus("Asking " + label + " to analyze “" + table.name + "”…");
      try {
        const { system, user } = buildPrompt(table, local, opts.context);
        const reply = await FG.ai.complete({ system, user });
        const plan = sanitizePlan(FG.ai.extractJSON(reply), table);
        if (!plan) throw new Error("could not parse the model's reply as JSON");
        if (!plan.analyses.length && local.analyses.length) plan.analyses = local.analyses;
        applyPlan(app, table, plan, label);
      } catch (e) {
        console.warn("AI analyze failed", e);
        applyPlan(app, table, local, "built-in heuristics (AI failed: " + e.message + ")");
      }
    },

    // Dialog shown before analysis: lets the user optionally steer the AI
    // ("fit a 4PL dose-response curve", "columns are paired", …) instead of
    // relying purely on auto-detection.
    openDialog(table, app, sub) {
      if (!table) { FG.setStatus("Create or import a data table first."); return; }
      const configured = FG.ai.configured();
      const engine = configured ? FG.ai.describeActive() : "built-in heuristics";

      const body = document.createElement("div");
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-weight:600;margin-bottom:4px;";
      lbl.textContent = "What do you already know about this data? (optional)";
      body.appendChild(lbl);
      const ta = document.createElement("textarea");
      ta.rows = 4;
      ta.style.cssText = "width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border);border-radius:5px;font:inherit;resize:vertical;";
      ta.placeholder = "e.g. fit a sigmoidal dose-response (4PL) curve · the two columns are paired before/after measurements · rows are time points, columns are treatment groups · compare everything against the Control column";
      body.appendChild(ta);
      const hint = document.createElement("div");
      hint.style.cssText = "color:var(--muted);font-size:11px;margin-top:6px;";
      hint.textContent = configured
        ? "Leave blank for full auto-detection. Your notes are sent to " + engine + " together with the column names and a data sample."
        : "No AI key configured (AI ⚙) — the built-in heuristics will auto-detect, and free-text guidance is ignored.";
      body.appendChild(hint);

      FG.modal.show({
        title: "✨ Auto-analyze “" + table.name + "”",
        sub: (sub || "Detect column types, pick the table type, run statistics and draw a graph") + " — using " + engine + ".",
        body,
        okLabel: "✨ Analyze",
        cancelLabel: sub ? "Not now" : "Cancel",
        onOk: () => { FG.aiAssist.run(table, app, { context: ta.value.trim() }); },
      });
      setTimeout(() => ta.focus(), 0);
    },

    // Post-import hook: offer to auto-analyze the freshly imported table.
    offerForImport(table, app) {
      const s = FG.ai.settings();
      if (s.autoAnalyze === false) return;
      this.openDialog(table, app, "Auto-analyze the imported data? (Turn this prompt off in AI Settings.)");
    },
  };
})();
