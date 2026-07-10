/*
 * Figulate — Analyze dialog + dispatch to the statistics engine.
 * window.FG.analyze
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;
  const stats = FG.stats;

  // Catalog: which analyses apply to which table type ----------------------
  const CATALOG = {
    column: [
      { cat: "Descriptive", items: [
        { kind: "describe", name: "Descriptive statistics", desc: "Mean, SD, SEM, median, quartiles, CI, skewness…" },
        { kind: "normality", name: "Normality test (D'Agostino-Pearson)", desc: "Test whether data follow a Gaussian distribution." },
      ]},
      { cat: "Compare two groups", items: [
        { kind: "ttest", name: "Unpaired t test", desc: "Compare the means of two columns (Student or Welch).", opts: ["pickTwo", "welch"] },
        { kind: "pairedt", name: "Paired t test", desc: "Compare two matched columns.", opts: ["pickTwo"] },
        { kind: "onesample", name: "One-sample t test", desc: "Compare one column's mean to a hypothetical value.", opts: ["pickOne", "mu0"] },
        { kind: "mannwhitney", name: "Mann-Whitney test", desc: "Nonparametric comparison of two columns.", opts: ["pickTwo"] },
        { kind: "wilcoxon", name: "Wilcoxon matched-pairs", desc: "Nonparametric paired comparison.", opts: ["pickTwo"] },
      ]},
      { cat: "Compare three or more groups", items: [
        { kind: "anova", name: "Ordinary one-way ANOVA", desc: "Compare means of 3+ columns, with multiple comparisons.", opts: ["posthoc"] },
        { kind: "welchanova", name: "Welch's ANOVA", desc: "One-way ANOVA not assuming equal variances." },
        { kind: "kruskal", name: "Kruskal-Wallis test", desc: "Nonparametric one-way ANOVA with Dunn's test." },
      ]},
    ],
    grouped: [
      { cat: "Compare two columns per row", items: [
        { kind: "multiplet", name: "Multiple t tests (one per row)", desc: "Compare two columns (conditions) within each row, with a multiplicity correction. Stars significant rows on the graph.", opts: ["pickTwoGrouped", "paired", "welch", "correction"] },
      ]},
      { cat: "ANOVA", items: [
        { kind: "twoway", name: "Two-way ANOVA", desc: "Two grouping variables (rows × columns) with interaction." },
      ]},
    ],
    xy: [
      { cat: "Correlation", items: [
        { kind: "pearson", name: "Pearson correlation", desc: "Linear correlation between X and Y.", opts: ["pickY"] },
        { kind: "spearman", name: "Spearman correlation", desc: "Nonparametric rank correlation.", opts: ["pickY"] },
      ]},
      { cat: "Regression", items: [
        { kind: "linreg", name: "Simple linear regression", desc: "Fit a straight line; slope, intercept, R².", opts: ["pickY"] },
        { kind: "nonlinreg", name: "Nonlinear regression (curve fit)", desc: "Fit a model curve: dose-response, exponential, Michaelis-Menten, Gaussian…", opts: ["pickY", "nlmodel"] },
      ]},
    ],
    contingency: [
      { cat: "Contingency", items: [
        { kind: "chisquare", name: "Chi-square / Fisher's exact test", desc: "Test association in a contingency table." },
      ]},
    ],
    survival: [
      { cat: "Survival", items: [
        { kind: "km", name: "Kaplan-Meier + log-rank", desc: "Survival curves and comparison of two groups." },
      ]},
    ],
    parts: [
      { cat: "Descriptive", items: [
        { kind: "describe", name: "Fraction of total", desc: "Summaries for parts-of-whole data." },
      ]},
    ],
    multiple: [
      { cat: "Descriptive", items: [
        { kind: "describe", name: "Descriptive statistics", desc: "Column-by-column summaries." },
        { kind: "pearson", name: "Pearson correlation", desc: "Correlate two variables.", opts: ["pickTwoVars"] },
      ]},
    ],
  };
  FG.analyze = { CATALOG };

  FG.analyze.open = function (table, project, done) {
    const cats = CATALOG[table.type] || [];
    const body = document.createElement("div");
    const h = document.createElement("div");
    h.className = "analyze-list";
    let selected = null;
    const optHost = document.createElement("div");
    optHost.style.marginTop = "10px";

    cats.forEach((cat) => {
      const c = document.createElement("div");
      c.className = "analyze-cat";
      c.textContent = cat.cat;
      h.appendChild(c);
      cat.items.forEach((item) => {
        const d = document.createElement("div");
        d.className = "analyze-item";
        d.innerHTML = `<div class="ai-name">${item.name}</div><div class="ai-desc">${item.desc}</div>`;
        d.onclick = () => {
          h.querySelectorAll(".analyze-item").forEach((x) => x.classList.remove("selected"));
          d.classList.add("selected");
          selected = item;
          renderOpts(optHost, item, table);
        };
        h.appendChild(d);
      });
    });
    body.appendChild(h);
    body.appendChild(optHost);

    FG.modal.show({
      title: "Analyze data",
      sub: `Choose an analysis for “${table.name}” (${M.TABLE_TYPES[table.type].name} table).`,
      body,
      okLabel: "Run analysis",
      onOk: () => {
        if (!selected) return false;
        const opts = readOpts(optHost, selected);
        const result = runAnalysis(selected.kind, table, opts);
        if (!result) { FG.setStatus("Analysis could not run — check your data."); return false; }
        const analysis = {
          id: M.uid("an"), tableId: table.id, kind: selected.kind,
          name: selected.name, options: opts, result,
        };
        project.analyses.push(analysis);
        done(analysis);
        return true;
      },
    });
  };

  // Render the option controls for an analysis item. `cur` (optional) pre-fills
  // each control with the analysis's current option values so the same builder
  // works for the initial dialog and the editable results-page panel.
  function renderOpts(host, item, table, cur) {
    host.innerHTML = "";
    const opts = item.opts || [];
    cur = cur || {};
    const at = (key, fallback) => (cur[key] !== undefined && cur[key] !== null ? cur[key] : fallback);
    const yCols = table.datasets.map((d, i) => ({ i, title: d.title, role: d.role }));
    const groupCols = yCols.filter((c) => c.role !== "X");

    if (opts.includes("pickTwo") || opts.includes("pickTwoVars")) {
      host.appendChild(selectRow("Group A", "colA", groupCols, at("colA", groupCols[0]?.i)));
      host.appendChild(selectRow("Group B", "colB", groupCols, at("colB", groupCols[1]?.i)));
    }
    if (opts.includes("pickOne")) host.appendChild(selectRow("Column", "colA", groupCols, at("colA", groupCols[0]?.i)));
    if (opts.includes("pickTwoGrouped")) {
      // Columns are the grouped table's conditions (colFactors of groupedCells),
      // indexed by position so they line up with the per-row replicate data.
      let cols = [];
      try { cols = M.groupedCells(table).colFactors.map((n, i) => ({ i, title: n })); } catch (e) { /* not enough data */ }
      if (cols.length < 2) cols = table.datasets.map((d, i) => ({ i, title: d.title }));
      host.appendChild(selectRow("Condition A", "colA", cols, at("colA", cols[0]?.i)));
      host.appendChild(selectRow("Condition B", "colB", cols, at("colB", cols[1] ? cols[1].i : cols[0]?.i)));
    }
    if (opts.includes("paired")) host.appendChild(checkRow("Paired (replicates matched by row position)", "paired", at("paired", false)));
    if (opts.includes("correction")) {
      host.appendChild(selectRowRaw("Multiplicity correction", "correction", [
        ["holm-sidak", "Holm-Šídák (adjusted P)"],
        ["bonferroni", "Bonferroni (adjusted P)"],
        ["fdr-bh", "FDR — Benjamini-Hochberg (Q = 5%)"],
        ["fdr-bky", "FDR — two-stage (Q = 5%)"],
        ["none", "None (raw P)"],
      ], at("correction", "holm-sidak")));
    }
    if (opts.includes("pickY")) {
      const ys = groupCols;
      host.appendChild(selectRow("Y dataset", "colY", ys, at("colY", ys[0]?.i)));
    }
    if (opts.includes("nlmodel")) {
      host.appendChild(selectRowRaw("Model", "nlmodel", Object.entries(FG.stats.NLMODELS).map(([k, m]) => [k, m.name]), at("nlmodel", "logistic4")));
    }
    if (opts.includes("mu0")) host.appendChild(numRow("Hypothetical mean", "mu0", at("mu0", 0)));
    if (opts.includes("welch")) host.appendChild(checkRow("Welch's correction (unequal variances)", "welch", at("welch", false)));
    if (opts.includes("posthoc")) {
      const sel = selectRowRaw("Multiple comparisons", "posthoc", [
        ["tukey", "Tukey (compare all pairs)"],
        ["holm-sidak", "Holm-Šídák"],
        ["sidak", "Šídák"],
        ["bonferroni", "Bonferroni"],
        ["none", "Don't compare"],
      ], at("posthoc", "tukey"));
      host.appendChild(sel);
    }
  }

  // Find the catalog item describing an analysis kind (for its option list).
  // Searches the table's own catalog first, then all catalogs (some kinds like
  // "describe" appear under several table types).
  FG.analyze.itemFor = function (table, kind) {
    const search = (cats) => { for (const c of cats || []) for (const it of c.items) if (it.kind === kind) return it; return null; };
    return search(CATALOG[table.type]) || Object.keys(CATALOG).reduce((f, k) => f || search(CATALOG[k]), null);
  };

  // Build an editable parameter panel for an existing analysis. Any change
  // re-runs the analysis in place (analysis.options + analysis.result) and
  // calls onRerun(). Returns false when the analysis has no adjustable options.
  FG.analyze.buildParamEditor = function (host, analysis, table, onRerun) {
    const item = FG.analyze.itemFor(table, analysis.kind);
    if (!item || !item.opts || !item.opts.length) return false;
    const h = document.createElement("div");
    h.className = "analyze-cat";
    h.textContent = "Parameters";
    host.appendChild(h);
    const optHost = document.createElement("div");
    renderOpts(optHost, item, table, analysis.options || {});
    optHost.addEventListener("change", () => {
      const opts = readOpts(optHost, item);
      const fresh = runAnalysis(analysis.kind, table, opts);
      if (!fresh) { FG.setStatus("Could not re-run analysis with those parameters."); return; }
      analysis.options = opts;
      analysis.result = fresh;
      FG.setStatus("Re-ran " + analysis.name + " with updated parameters.");
      if (onRerun) onRerun();
    });
    host.appendChild(optHost);
    return true;
  };

  function selectRow(label, key, cols, defVal) {
    return selectRowRaw(label, key, cols.map((c) => [c.i, c.title]), defVal);
  }
  function selectRowRaw(label, key, pairs, defVal) {
    const row = document.createElement("div");
    row.className = "opt-row";
    row.innerHTML = `<label>${label}</label>`;
    const sel = document.createElement("select");
    sel.dataset.key = key;
    pairs.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); });
    if (defVal !== undefined) sel.value = defVal;
    row.appendChild(sel);
    return row;
  }
  function numRow(label, key, def) {
    const row = document.createElement("div");
    row.className = "opt-row";
    row.innerHTML = `<label>${label}</label>`;
    const inp = document.createElement("input");
    inp.type = "number"; inp.value = def; inp.dataset.key = key; inp.style.width = "100px";
    row.appendChild(inp);
    return row;
  }
  function checkRow(label, key, checked) {
    const row = document.createElement("div");
    row.className = "opt-row";
    const inp = document.createElement("input"); inp.type = "checkbox"; inp.dataset.key = key; inp.checked = !!checked;
    const l = document.createElement("label"); l.textContent = label; l.style.minWidth = "auto";
    row.appendChild(inp); row.appendChild(l);
    return row;
  }
  function readOpts(host, item) {
    const o = {};
    host.querySelectorAll("[data-key]").forEach((el) => {
      if (el.type === "checkbox") o[el.dataset.key] = el.checked;
      else if (el.type === "number") o[el.dataset.key] = parseFloat(el.value);
      else o[el.dataset.key] = el.value;
    });
    return o;
  }

  // Dispatch ---------------------------------------------------------------
  function runAnalysis(kind, table, opts) {
    try {
      if (kind === "describe") {
        return { test: "Descriptive statistics", multi: M.columnGroups(table).map((g) => ({ name: g.name, d: stats.describe(g.values) })) };
      }
      if (kind === "normality") {
        return { test: "Normality (D'Agostino-Pearson)", multi: M.columnGroups(table).filter((g) => g.values.length >= 8).map((g) => ({ name: g.name, r: stats.dagostino(g.values) })) };
      }
      const groups = M.columnGroups(table);
      const A = () => groups[opts.colA ?? 0]?.values || [];
      const B = () => groups[opts.colB ?? 1]?.values || [];
      if (kind === "ttest") return stats.unpairedT(A(), B(), { welch: !!opts.welch });
      if (kind === "pairedt") return stats.pairedT(A(), B());
      if (kind === "onesample") return stats.oneSampleT(A(), opts.mu0 || 0);
      if (kind === "mannwhitney") return stats.mannWhitney(A(), B());
      if (kind === "wilcoxon") return stats.wilcoxon(A(), B());
      if (kind === "anova") return stats.oneWayANOVA(groups, { posthoc: opts.posthoc || "tukey" });
      if (kind === "welchanova") return stats.welchANOVA(groups);
      if (kind === "kruskal") return stats.kruskalWallis(groups);
      if (kind === "multiplet") return stats.multipleTTests(M.groupedCells(table), {
        colA: opts.colA != null ? +opts.colA : 0,
        colB: opts.colB != null ? +opts.colB : 1,
        paired: !!opts.paired, welch: !!opts.welch,
        correction: opts.correction || "holm-sidak",
      });
      if (kind === "twoway") return stats.twoWayANOVA(M.groupedCells(table));
      if (kind === "chisquare") return stats.chiSquare(M.contingencyMatrix(table));
      if (kind === "km") return stats.kaplanMeier(M.survivalGroups(table));
      if (kind === "pearson" || kind === "spearman" || kind === "linreg" || kind === "nonlinreg") {
        const yi = opts.colY ?? 1;
        const yData = valuesForDataset(table, yi);
        const xData = valuesForDataset(table, 0);
        if (kind === "pearson") return stats.pearson(xData, yData);
        if (kind === "spearman") return stats.spearman(xData, yData);
        if (kind === "nonlinreg") return stats.nonlinearFit(xData, yData, opts.nlmodel || "logistic4");
        return stats.linearRegression(xData, yData);
      }
    } catch (e) {
      console.error("analysis error", e);
      return null;
    }
    return null;
  }
  FG.analyze.run = runAnalysis;

  // Get the raw (per-row, first subcolumn) values of a dataset for XY pairing
  function valuesForDataset(table, di) {
    const layout = M.columnLayout(table);
    const cols = layout.map((c, idx) => (c.datasetIndex === di ? idx : -1)).filter((i) => i >= 0);
    const out = [];
    table.grid.forEach((r) => {
      if (!r) { out.push(""); return; }
      // average replicates
      const reps = cols.map((ci) => r[ci]).filter((v) => v !== "" && v !== undefined && !isNaN(v)).map(Number);
      out.push(reps.length ? reps.reduce((s, v) => s + v, 0) / reps.length : "");
    });
    return out;
  }
})();
