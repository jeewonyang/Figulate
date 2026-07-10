/*
 * Figulate — graph editor (inspector panel) + annotation interactions.
 * Provides a vector-editor-style experience: select/multi-select, marquee,
 * drag-to-draw, move with Shift H/V constraint, resize with Shift aspect/45°
 * lock, snapping with guides, align/distribute, z-order, duplicate, copy/paste.
 * window.FG.editor
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;
  const NS = "http://www.w3.org/2000/svg";

  // ---- Small inspector control builders ---------------------------------
  function field(label, ctrl) {
    const d = document.createElement("div");
    d.className = "field";
    const l = document.createElement("label");
    l.textContent = label;
    d.appendChild(l);
    d.appendChild(ctrl);
    return d;
  }
  function num(val, min, max, step, fn) {
    const i = document.createElement("input");
    i.type = "number"; i.value = val; if (min != null) i.min = min; if (max != null) i.max = max; if (step) i.step = step;
    const commit = () => { const v = parseFloat(i.value); if (!isNaN(v)) fn(v); };
    i.onchange = commit;
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") { commit(); i.blur(); } });
    return i;
  }
  function range(val, min, max, step, fn) {
    const i = document.createElement("input");
    i.type = "range"; i.value = val; i.min = min; i.max = max; i.step = step || 1;
    i.oninput = () => fn(parseFloat(i.value));
    return i;
  }
  function text(val, fn) {
    const i = document.createElement("input"); i.type = "text"; i.value = val || "";
    i.oninput = () => fn(i.value);
    return i;
  }
  function color(val, fn) {
    const i = document.createElement("input"); i.type = "color"; i.value = val;
    i.oninput = () => fn(i.value);
    return i;
  }
  function check(val, fn) {
    const i = document.createElement("input"); i.type = "checkbox"; i.checked = !!val;
    i.onchange = () => fn(i.checked);
    return i;
  }
  function select(val, pairs, fn) {
    const s = document.createElement("select");
    pairs.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); });
    s.value = val;
    s.onchange = () => fn(s.value);
    return s;
  }
  function heading(t) { const h = document.createElement("h3"); h.textContent = t; return h; }
  const LINE_STYLES = [["solid", "Solid ───"], ["dashed", "Dashed ─ ─"], ["dotted", "Dotted ·····"], ["dashdot", "Dash-dot ─·─"]];
  function addBtnTo(host, label, fn, opts) {
    const b = document.createElement("button");
    b.textContent = label; b.style.marginTop = (opts && opts.mt) || "5px"; b.style.marginRight = "6px";
    if (opts && opts.active) b.classList.add("accent");
    b.onclick = fn; host.appendChild(b); return b;
  }
  function btnRow(host, buttons) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;";
    buttons.forEach(([label, fn, title]) => {
      const b = document.createElement("button"); b.textContent = label; b.onclick = fn; if (title) b.title = title;
      b.style.flex = "1 0 auto";
      row.appendChild(b);
    });
    host.appendChild(row);
  }

  FG.editor = {
    buildInspector(host, graph, table, onChange) {
      const scrollTop = host.scrollTop;
      host.innerHTML = "";
      const upd = () => onChange();
      const rebuild = () => { this.buildInspector(host, graph, table, onChange); host.scrollTop = scrollTop; };

      // Auto-switch to the Objects tab when a new object gets selected.
      const ms = FG.app.multiSel || [];
      const selKey = ms.length ? ms.join(",") : (FG.app.selectedAnn || "");
      if (selKey && selKey !== FG.app._lastInspSel) FG.app.inspectorTab = "arrange";
      FG.app._lastInspSel = selKey;
      const tab = FG.app.inspectorTab || "graph";

      const bar = document.createElement("div");
      bar.className = "insp-tabs";
      [["graph", "Graph"], ["axes", "Axes"], ["data", "Data"], ["arrange", "Objects"]].forEach(([id, label]) => {
        const b = document.createElement("button");
        b.textContent = label; b.className = "insp-tab" + (tab === id ? " active" : "");
        b.onclick = () => { FG.app.inspectorTab = id; rebuild(); };
        bar.appendChild(b);
      });
      host.appendChild(bar);
      const body = document.createElement("div");
      body.className = "insp-body";
      host.appendChild(body);

      if (tab === "graph") this.tabGraph(body, graph, table, upd, rebuild);
      else if (tab === "axes") this.tabAxes(body, graph, table, upd, rebuild);
      else if (tab === "data") this.tabData(body, graph, table, upd, rebuild);
      else this.tabArrange(body, graph, table, upd, rebuild);
    },

    tabGraph(host, graph, table, upd, rebuild) {
      const o = graph.options;
      host.appendChild(heading("Graph"));
      host.appendChild(field("Type", select(graph.kind, [
        ["column", "Column / scatter"], ["bar", "Bar"], ["box", "Box & whiskers"],
        ["violin", "Violin"], ["xy", "XY"], ["grouped", "Grouped bar"],
        ["survival", "Survival"], ["pie", "Pie"],
      ], (v) => { graph.kind = v; if (["column", "bar", "box", "violin"].includes(v)) o.plotStyle = v === "column" ? "meanSD" : v; upd(); rebuild(); })));

      host.appendChild(heading("Titles & fonts"));
      host.appendChild(field("Title", text(o.title, (v) => { o.title = v; upd(); })));
      host.appendChild(field("X axis title", text(o.xTitle, (v) => { o.xTitle = v; upd(); })));
      host.appendChild(field("Y axis title", text(o.yTitle, (v) => { o.yTitle = v; upd(); })));
      host.appendChild(field("Font", select(o.fontFamily, [
        ["Arial, sans-serif", "Arial"], ["'Segoe UI', sans-serif", "Segoe UI"],
        ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times"],
        ["'Courier New', monospace", "Courier"], ["Helvetica, Arial, sans-serif", "Helvetica"],
      ], (v) => { o.fontFamily = v; upd(); })));
      host.appendChild(field("Title size (pt)", num(o.titleSize, 4, 96, 1, (v) => { o.titleSize = v; upd(); })));
      host.appendChild(field("Axis title size (pt)", num(o.axisTitleSize, 4, 72, 1, (v) => { o.axisTitleSize = v; upd(); })));
      host.appendChild(field("Tick label size (pt)", num(o.tickSize, 4, 72, 1, (v) => { o.tickSize = v; upd(); })));
      host.appendChild(field("Legend size (pt)", num(o.legendSize, 4, 72, 1, (v) => { o.legendSize = v; upd(); })));

      host.appendChild(heading("Figure size"));
      host.appendChild(field("Width", num(o.width, 200, 4000, 10, (v) => { o.width = v; upd(); })));
      host.appendChild(field("Height", num(o.height, 200, 4000, 10, (v) => { o.height = v; upd(); })));
      host.appendChild(field("Background", color(o.background, (v) => { o.background = v; upd(); })));

      host.appendChild(heading("Colors (data series)"));
      const nSeries = seriesCount(graph, table);
      const schemePairs = [["", "Custom / individual"], ...Object.entries(FG.plot.SCHEMES).map(([k, s]) => [k, s.name])];
      host.appendChild(field("Color scheme", select(o.colorScheme || "", schemePairs, (v) => {
        o.colorScheme = v;
        if (v) { const cols = FG.plot.schemeColors(v, Math.max(nSeries, 1)); if (cols) o.colors = cols; }
        upd(); rebuild();
      })));
      const cr = document.createElement("div");
      cr.className = "color-row";
      const nColors = Math.max(nSeries, table.datasets.length, 3);
      for (let i = 0; i < nColors; i++) cr.appendChild(color(o.colors[i] || FG.plot.PALETTE[i % FG.plot.PALETTE.length], (v) => { o.colors[i] = v; o.colorScheme = ""; upd(); }));
      host.appendChild(cr);

      host.appendChild(heading("General"));
      host.appendChild(field("Show legend", check(o.showLegend, (v) => { o.showLegend = v; upd(); })));

      host.appendChild(heading("My default style"));
      const dhint = document.createElement("div");
      dhint.style.cssText = "color:var(--muted);font-size:11px;margin-bottom:6px;";
      dhint.textContent = FG.plot.userDefaults()
        ? "Saved defaults are active — every new graph starts with them."
        : "Save this graph's fonts, sizes, line widths and colors as the default for all new graphs.";
      host.appendChild(dhint);
      addBtnTo(host, "★ Set as default style", () => {
        if (FG.plot.saveDefaultsFrom(o)) FG.setStatus("Saved as default style — new graphs will use these fonts, sizes and colors.");
        else FG.setStatus("Could not save defaults (browser storage unavailable).");
        rebuild();
      });
      if (FG.plot.userDefaults()) {
        addBtnTo(host, "Apply defaults here", () => {
          if (FG.plot.applyUserDefaults(o)) { FG.setStatus("Applied your saved default style to this graph."); upd(); rebuild(); }
        });
        addBtnTo(host, "Reset to built-in defaults", () => {
          FG.plot.clearUserDefaults();
          FG.setStatus("Cleared saved defaults — new graphs use the built-in style.");
          rebuild();
        });
      }
    },

    tabAxes(host, graph, table, upd, rebuild) {
      const o = graph.options;
      const numeric = graph.kind === "xy" || graph.kind === "survival";
      host.appendChild(heading("Y axis"));
      host.appendChild(field("Log scale (log₁₀)", check(o.yLog, (v) => { o.yLog = v; upd(); })));
      host.appendChild(field("Auto range", check(o.yAuto, (v) => { o.yAuto = v; upd(); })));
      host.appendChild(field("Min", num(o.yMin, null, null, "any", (v) => { o.yMin = v; o.yAuto = false; upd(); })));
      host.appendChild(field("Max", num(o.yMax, null, null, "any", (v) => { o.yMax = v; o.yAuto = false; upd(); })));
      host.appendChild(field("Tick interval (0=auto)", num(o.yTickStep || 0, 0, null, "any", (v) => { o.yTickStep = v; upd(); })));
      host.appendChild(field("Decimals (−1=auto)", num(o.yDecimals != null ? o.yDecimals : -1, -1, 10, 1, (v) => { o.yDecimals = v; upd(); })));
      host.appendChild(field("Y gridlines", check(o.gridY, (v) => { o.gridY = v; upd(); })));
      if (["xy", "column", "bar", "box", "violin", "grouped"].includes(graph.kind))
        host.appendChild(field("Horizontal axis at", select(o.baseline || "min", [["min", "Minimum (bottom)"], ["zero", "Origin (y = 0)"]], (v) => { o.baseline = v; upd(); })));

      if (numeric) {
        host.appendChild(heading("X axis"));
        host.appendChild(field("Log scale (log₁₀)", check(o.xLog, (v) => { o.xLog = v; upd(); })));
        host.appendChild(field("Auto range", check(o.xAuto, (v) => { o.xAuto = v; upd(); })));
        host.appendChild(field("Min", num(o.xMin, null, null, "any", (v) => { o.xMin = v; o.xAuto = false; upd(); })));
        host.appendChild(field("Max", num(o.xMax, null, null, "any", (v) => { o.xMax = v; o.xAuto = false; upd(); })));
        host.appendChild(field("Tick interval (0=auto)", num(o.xTickStep || 0, 0, null, "any", (v) => { o.xTickStep = v; upd(); })));
        host.appendChild(field("Decimals (−1=auto)", num(o.xDecimals != null ? o.xDecimals : -1, -1, 10, 1, (v) => { o.xDecimals = v; upd(); })));
        host.appendChild(field("X gridlines", check(o.gridX, (v) => { o.gridX = v; upd(); })));
      }

      host.appendChild(heading("Tick & number format"));
      host.appendChild(field("Number format", select(o.numberFmt || "auto", [["auto", "Automatic"], ["fixed", "Fixed decimals"], ["sci", "Scientific"], ["percent", "Percentage"]], (v) => { o.numberFmt = v; upd(); })));
      if (["column", "bar", "box", "violin", "grouped"].includes(graph.kind))
        host.appendChild(field("X label angle", select(String(o.xLabelAngle || "auto"), [["auto", "Auto (rotate if tight)"], ["0", "Horizontal"], ["45", "45°"], ["90", "Vertical"]], (v) => { o.xLabelAngle = v; upd(); })));
      host.appendChild(field("Axis line width", num(o.axisWidth, 0.25, 8, 0.25, (v) => { o.axisWidth = v; upd(); })));
      host.appendChild(field("Tick length", num(o.tickLen != null ? o.tickLen : 6, 0, 30, 1, (v) => { o.tickLen = v; upd(); })));
    },

    tabData(host, graph, table, upd, rebuild) {
      const o = graph.options;
      host.appendChild(heading("Data appearance"));
      if (graph.kind === "grouped") {
        host.appendChild(field("Grouped style", select(o.groupedStyle || "bar", [
          ["bar", "Grouped bars"], ["scatter", "Grouped scatter (points + mean)"], ["stacked", "Stacked bars"],
        ], (v) => { o.groupedStyle = v; upd(); rebuild(); })));
        host.appendChild(field("Plot orientation", select(o.groupOrientation || "byRow", [["byRow", "Group by row (rows on X)"], ["byColumn", "Group by column (columns on X)"]], (v) => { o.groupOrientation = v; upd(); rebuild(); })));
        host.appendChild(field("Color by", select(o.groupColorBy || "series", [["series", "Series (legend entries)"], ["category", "X category"]], (v) => { o.groupColorBy = v; upd(); rebuild(); })));
        if ((o.groupedStyle || "bar") === "bar")
          host.appendChild(field("Show individual points", check(o.showPoints, (v) => { o.showPoints = v; upd(); rebuild(); })));
      }
      if (["column", "bar", "box", "violin"].includes(graph.kind)) {
        host.appendChild(field("Plot style", select(o.plotStyle, [
          ["bar", "Bars"], ["meanSD", "Mean ± error, points"], ["meanSEM", "Mean ± SEM, points"],
          ["scatter", "Scatter (points + mean)"], ["box", "Box & whiskers"], ["violin", "Violin"],
        ], (v) => { o.plotStyle = v; upd(); rebuild(); })));
        if (o.plotStyle === "bar")
          host.appendChild(field("Show individual points", check(o.showPoints, (v) => { o.showPoints = v; upd(); rebuild(); })));
      }
      // Bar appearance: fill opacity + border stroke are independent of the
      // fill color, for both column bars and grouped/stacked bars.
      const barish = (["column", "bar", "box", "violin"].includes(graph.kind) && o.plotStyle === "bar") ||
        (graph.kind === "grouped" && (o.groupedStyle || "bar") !== "scatter");
      if (barish) {
        host.appendChild(heading("Bar style"));
        host.appendChild(field("Fill opacity", range(o.barFillOpacity != null ? o.barFillOpacity : 1, 0, 1, 0.05, (v) => { o.barFillOpacity = v; upd(); })));
        host.appendChild(field("Border color", color(o.barBorderColor || "#111111", (v) => { o.barBorderColor = v; upd(); })));
        host.appendChild(field("Border width", num(o.barBorderWidth != null ? o.barBorderWidth : 0.5, 0, 10, 0.25, (v) => { o.barBorderWidth = v; upd(); })));
        host.appendChild(field("Gap between groups", range(o.barGap != null ? o.barGap : 0.35, 0, 0.9, 0.05, (v) => { o.barGap = v; upd(); })));
        if (graph.kind === "grouped" && (o.groupedStyle || "bar") === "bar")
          host.appendChild(field("Gap within group", range(o.groupGap != null ? o.groupGap : 0.1, 0, 0.9, 0.05, (v) => { o.groupGap = v; upd(); })));
      }
      // Error-bar controls: bar/mean column styles, grouped bars, and XY (needs replicates).
      const errKinds = graph.kind === "grouped" || graph.kind === "xy" ||
        (["column", "bar", "box", "violin"].includes(graph.kind) && ["bar", "meanSD", "meanSEM"].includes(o.plotStyle));
      if (errKinds) {
        if (o.plotStyle !== "meanSEM")
          host.appendChild(field("Error bars", select(o.errorBar, [["sd", "SD"], ["sem", "SEM"], ["ci", "95% CI"], ["none", "None"]], (v) => { o.errorBar = v; upd(); rebuild(); })));
        if (o.errorBar !== "none") {
          host.appendChild(field("Error direction", select(o.errorDir || "both", [["both", "Both directions"], ["outer", "Outer only"]], (v) => { o.errorDir = v; upd(); })));
          host.appendChild(field("Error bar width", num(o.errorWidth != null ? o.errorWidth : 1.5, 0.25, 10, 0.25, (v) => { o.errorWidth = v; upd(); })));
          host.appendChild(field("Error bar color", color(o.errorColor || "#111111", (v) => { o.errorColor = v; upd(); })));
          host.appendChild(field("Cap width", num(o.capWidth != null ? o.capWidth : 8, 0, 40, 1, (v) => { o.capWidth = v; upd(); })));
        }
        if (graph.kind === "xy" && o.errorBar !== "none") {
          const h = document.createElement("div");
          h.style.cssText = "color:var(--muted);font-size:11px;margin:-2px 0 8px;";
          h.textContent = "XY error bars use replicate sub-columns — set Replicates in the data table.";
          host.appendChild(h);
        }
      }
      const groupedPts = graph.kind === "grouped" && ((o.groupedStyle || "bar") === "scatter" || o.showPoints);
      if (["column", "scatter", "xy"].includes(graph.kind) || o.plotStyle === "scatter" || o.plotStyle === "meanSD" || groupedPts) {
        host.appendChild(field("Symbol", select(o.symbol, [["circle", "Circle"], ["square", "Square"], ["triangle", "Triangle"], ["diamond", "Diamond"]], (v) => { o.symbol = v; upd(); })));
        host.appendChild(field("Symbol size", num(o.symbolSize, 1, 40, 1, (v) => { o.symbolSize = v; upd(); })));
        host.appendChild(field("Filled symbols", check(o.symbolFilled !== false, (v) => { o.symbolFilled = v; upd(); })));
        host.appendChild(field("Symbol border width", num(o.symbolBorder != null ? o.symbolBorder : 0.75, 0, 10, 0.25, (v) => { o.symbolBorder = v; upd(); })));
      }
      if (graph.kind === "xy") {
        host.appendChild(field("Connect points", check(o.connectLine, (v) => { o.connectLine = v; upd(); })));
        host.appendChild(field("Linear regression", check(o.showRegression, (v) => { o.showRegression = v; upd(); })));
        const nlPairs = [["none", "None"], ...Object.entries(FG.stats.NLMODELS).map(([k, m]) => [k, m.name])];
        host.appendChild(field("Nonlinear fit", select(o.nonlinearModel || "none", nlPairs, (v) => { o.nonlinearModel = v; upd(); })));
      }
      if (graph.kind === "xy" || graph.kind === "survival") {
        host.appendChild(field("Line width", num(o.lineWidth, 0.5, 12, 0.5, (v) => { o.lineWidth = v; upd(); })));
        host.appendChild(field("Line style", select(o.lineStyle || "solid", LINE_STYLES, (v) => { o.lineStyle = v; upd(); })));
      }

      // ---- Per-series style overrides ----
      const names = seriesNames(graph, table);
      if (names.length && ["xy", "column", "bar", "box", "violin", "grouped", "survival"].includes(graph.kind)) {
        host.appendChild(heading("Per-series style"));
        const hint = document.createElement("div");
        hint.style.cssText = "color:var(--muted);font-size:11px;margin-bottom:6px;";
        hint.textContent = "Overrides the defaults above for one series. Blank = use default.";
        host.appendChild(hint);
        o.series = o.series || [];
        const idx = Math.min(FG.app.seriesIdx || 0, names.length - 1);
        host.appendChild(field("Series", select(idx, names.map((n, i) => [i, n]), (v) => { FG.app.seriesIdx = parseInt(v); rebuild(); })));
        const s = (o.series[idx] = o.series[idx] || {});
        const eff = FG.plot.seriesStyle(o, idx);
        host.appendChild(field("Color", color(o.colors[idx] || eff.color, (v) => { o.colors[idx] = v; upd(); })));
        if (barish) {
          host.appendChild(field("Bar border color", color(s.barBorderColor || eff.barBorderColor, (v) => { s.barBorderColor = v; upd(); })));
          host.appendChild(field("Bar border width", num(eff.barBorderWidth, 0, 10, 0.25, (v) => { s.barBorderWidth = v; upd(); })));
          host.appendChild(field("Bar fill opacity", range(eff.barFillOpacity, 0, 1, 0.05, (v) => { s.barFillOpacity = v; upd(); })));
        }
        const symbolPanel = ["xy", "column", "scatter"].includes(graph.kind) || o.plotStyle === "scatter" || o.plotStyle === "meanSD" || ["box", "violin"].includes(graph.kind) || groupedPts;
        if (symbolPanel) {
          host.appendChild(field("Symbol", select(s.symbol || o.symbol, [["circle", "Circle"], ["square", "Square"], ["triangle", "Triangle"], ["diamond", "Diamond"]], (v) => { s.symbol = v; upd(); })));
          host.appendChild(field("Symbol size", num(eff.symbolSize, 1, 40, 1, (v) => { s.symbolSize = v; upd(); })));
          host.appendChild(field("Filled", check(eff.symbolFilled, (v) => { s.symbolFilled = v; upd(); })));
          host.appendChild(field("Border width", num(eff.symbolBorder, 0, 10, 0.25, (v) => { s.symbolBorder = v; upd(); })));
        }
        if (graph.kind === "xy") {
          host.appendChild(field("Connect points", check(eff.connectLine, (v) => { s.connectLine = v; upd(); })));
          host.appendChild(field("Line width", num(eff.lineWidth, 0.5, 12, 0.5, (v) => { s.lineWidth = v; upd(); })));
          host.appendChild(field("Line style", select(s.lineStyle || o.lineStyle || "solid", LINE_STYLES, (v) => { s.lineStyle = v; upd(); })));
        }
        addBtnTo(host, "Reset this series", () => { o.series[idx] = {}; upd(); rebuild(); });
      }

      if (!["column", "bar", "box", "violin", "xy", "scatter", "grouped", "survival", "pie"].includes(graph.kind))
        host.appendChild(document.createTextNode("No data-appearance options for this graph type."));
    },

    tabArrange(host, graph, table, upd, rebuild) {
      const multi = FG.app.multiSel || [];
      host.appendChild(heading("Insert shapes"));
      const st = document.createElement("div");
      st.className = "shape-tools";
      const armDraw = (type) => { FG.app.drawMode = FG.app.drawMode === type ? null : type; upd(); rebuild(); };
      [["✎ Text", "text"], ["╱ Line", "line"], ["→ Arrow", "arrow"], ["▭ Rectangle", "rect"], ["◯ Ellipse", "ellipse"]].forEach(([label, type]) => {
        const b = document.createElement("button"); b.textContent = label;
        if (FG.app.drawMode === type) b.classList.add("accent");
        b.onclick = () => armDraw(type); st.appendChild(b);
      });
      host.appendChild(st);
      const shapeHint = document.createElement("div");
      shapeHint.style.cssText = "color:var(--muted);font-size:11px;margin-top:4px;";
      shapeHint.textContent = FG.app.drawMode
        ? `Draw mode: drag on the graph to place a ${FG.app.drawMode}. Click the tool again to cancel.`
        : "Pick a tool, then drag on the graph to draw. Click to select; Shift-click or drag a box to multi-select.";
      host.appendChild(shapeHint);

      if (multi.length > 1) {
        host.appendChild(heading(`${multi.length} shapes selected`));
        btnRow(host, [
          ["⇤ Left", () => { this.align(graph, "left"); upd(); }, "Align left edges"],
          ["↔ Center", () => { this.align(graph, "cx"); upd(); }, "Align horizontal centers"],
          ["⇥ Right", () => { this.align(graph, "right"); upd(); }, "Align right edges"],
        ]);
        btnRow(host, [
          ["⤒ Top", () => { this.align(graph, "top"); upd(); }, "Align top edges"],
          ["↕ Middle", () => { this.align(graph, "cy"); upd(); }, "Align vertical centers"],
          ["⤓ Bottom", () => { this.align(graph, "bottom"); upd(); }, "Align bottom edges"],
        ]);
        btnRow(host, [
          ["Distribute H", () => { this.distribute(graph, "h"); upd(); }],
          ["Distribute V", () => { this.distribute(graph, "v"); upd(); }],
        ]);
        btnRow(host, [
          ["Bring to front", () => { this.zorder(graph, "front"); upd(); rebuild(); }],
          ["Send to back", () => { this.zorder(graph, "back"); upd(); rebuild(); }],
        ]);
        btnRow(host, [
          ["Duplicate", () => { this.duplicateSelected(graph); upd(); rebuild(); }],
          ["Delete all", () => { graph.annotations = graph.annotations.filter((a) => !multi.includes(a.id)); FG.app.multiSel = []; FG.app.selectedAnn = null; upd(); rebuild(); }],
        ]);
      } else {
        this.selectedObjectPanel(host, graph, table, upd, rebuild);
      }

      if (["column", "bar", "box", "violin", "grouped"].includes(graph.kind)) {
        host.appendChild(heading("Significance (stars)"));
        const cats = FG.plot.categoryLabels(graph, table) || [];
        if (cats.length >= 2) {
          const g1 = select(0, cats.map((n, i) => [i, n]), () => {});
          const g2 = select(Math.min(1, cats.length - 1), cats.map((n, i) => [i, n]), () => {});
          const lab = text("*", () => {});
          lab.style.width = "50px";
          host.appendChild(field("From", g1));
          host.appendChild(field("To", g2));
          host.appendChild(field("Label", lab));
          addBtnTo(host, "＋ Add bracket", () => {
            graph.stars = graph.stars || [];
            graph.stars.push({ i: parseInt(g1.value), j: parseInt(g2.value), label: lab.value, level: graph.stars.length + 1 });
            upd(); rebuild();
          });
        }
        if (graph.stars && graph.stars.length) addBtnTo(host, "Clear brackets", () => { graph.stars = []; upd(); rebuild(); });
        if (graph.kind === "grouped") {
          addBtnTo(host, "Auto from multiple t-tests", () => { const r = this.autoStarsGrouped(graph, table); FG.setStatus(r.msg); upd(); rebuild(); });
          const gh = document.createElement("div");
          gh.style.cssText = "color:var(--muted);font-size:11px;margin-top:4px;";
          gh.textContent = "Runs after a “Multiple t tests (one per row)” analysis — brackets the two compared columns over each significant row.";
          host.appendChild(gh);
        } else {
          addBtnTo(host, "Auto from ANOVA/t-test", () => { this.autoStars(graph, table); upd(); rebuild(); });
        }
      }
    },

    // Editor for the single selected object (shape / legend / axis title / bracket).
    selectedObjectPanel(host, graph, table, upd, rebuild) {
      const o = graph.options;
      const sel = FG.app.selectedAnn;
      if (!sel) return;
      const FONTS = [
        ["", "(graph font)"], ["Arial, sans-serif", "Arial"], ["'Segoe UI', sans-serif", "Segoe UI"],
        ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times"],
        ["'Courier New', monospace", "Courier"], ["Helvetica, Arial, sans-serif", "Helvetica"],
      ];
      if (sel === "__title__") {
        host.appendChild(heading("Selected: title"));
        host.appendChild(field("Text", text(o.title, (v) => { o.title = v; upd(); })));
        host.appendChild(field("Font", select(o.titleFont || "", FONTS, (v) => { o.titleFont = v; upd(); })));
        host.appendChild(field("Size (pt)", num(o.titleSize, 4, 96, 1, (v) => { o.titleSize = v; upd(); })));
        host.appendChild(field("Color", color(o.titleColor || "#111111", (v) => { o.titleColor = v; upd(); })));
        host.appendChild(field("Bold", check(o.titleBold !== false, (v) => { o.titleBold = v; upd(); })));
        host.appendChild(field("Italic", check(o.titleItalic, (v) => { o.titleItalic = v; upd(); })));
        addBtnTo(host, "Reset position", () => { o.titleX = null; o.titleY = null; upd(); });
        return;
      }
      if (sel === "__legend__") {
        host.appendChild(heading("Selected: legend"));
        host.appendChild(field("Size (pt)", num(o.legendSize, 4, 72, 1, (v) => { o.legendSize = v; upd(); })));
        host.appendChild(field("Color", color(o.legendColor || "#111111", (v) => { o.legendColor = v; upd(); })));
        host.appendChild(field("Bold", check(o.legendBold, (v) => { o.legendBold = v; upd(); })));
        host.appendChild(field("Italic", check(o.legendItalic, (v) => { o.legendItalic = v; upd(); })));
        addBtnTo(host, "Reset position", () => { o.legendX = null; o.legendY = null; upd(); });
        addBtnTo(host, "Hide legend", () => { o.showLegend = false; FG.app.selectedAnn = null; upd(); rebuild(); });
        return;
      }
      if (sel === "__xtitle__" || sel === "__ytitle__") {
        const ax = sel === "__ytitle__" ? "y" : "x";
        host.appendChild(heading("Selected: " + ax.toUpperCase() + " axis title"));
        host.appendChild(field("Text", text(o[ax + "Title"], (v) => { o[ax + "Title"] = v; upd(); })));
        host.appendChild(field("Size (pt)", num(o[ax + "TitleSize"] || o.axisTitleSize, 4, 72, 1, (v) => { o[ax + "TitleSize"] = v; upd(); })));
        host.appendChild(field("Color", color(o[ax + "TitleColor"] || "#111111", (v) => { o[ax + "TitleColor"] = v; upd(); })));
        host.appendChild(field("Bold", check(o[ax + "TitleBold"], (v) => { o[ax + "TitleBold"] = v; upd(); })));
        host.appendChild(field("Italic", check(o[ax + "TitleItalic"], (v) => { o[ax + "TitleItalic"] = v; upd(); })));
        addBtnTo(host, "Reset position", () => { o[ax + "TitleX"] = null; o[ax + "TitleY"] = null; upd(); });
        return;
      }
      if (sel === "__xticks__" || sel === "__yticks__") {
        const ax = sel === "__yticks__" ? "y" : "x";
        host.appendChild(heading("Selected: " + ax.toUpperCase() + " axis labels"));
        host.appendChild(field("Size (pt)", num(o[ax + "TickSize"] || o.tickSize, 4, 72, 1, (v) => { o[ax + "TickSize"] = v; upd(); })));
        host.appendChild(field("Color", color(o[ax + "TickColor"] || o.tickColor || "#111111", (v) => { o[ax + "TickColor"] = v; upd(); })));
        host.appendChild(field("Bold", check(o.tickBold, (v) => { o.tickBold = v; upd(); })));
        host.appendChild(field("Italic", check(o.tickItalic, (v) => { o.tickItalic = v; upd(); })));
        if (ax === "x" && ["column", "bar", "box", "violin", "grouped"].includes(graph.kind))
          host.appendChild(field("Angle", select(String(o.xLabelAngle || "auto"), [["auto", "Auto"], ["0", "Horizontal"], ["45", "45°"], ["90", "Vertical"]], (v) => { o.xLabelAngle = v; upd(); })));
        const hh = document.createElement("div");
        hh.style.cssText = "color:var(--muted);font-size:11px;margin:4px 0;";
        hh.textContent = "Drag the labels on the graph to reposition them as a block.";
        host.appendChild(hh);
        addBtnTo(host, "Reset position", () => { o[ax + "TicksDX"] = 0; o[ax + "TicksDY"] = 0; upd(); });
        return;
      }
      if (sel.startsWith && sel.startsWith("bracket:")) {
        const idx = parseInt(sel.split(":")[1]);
        const s = (graph.stars || [])[idx];
        if (s) {
          host.appendChild(heading("Selected: significance bracket"));
          host.appendChild(field("Label", text(s.label, (v) => { s.label = v; upd(); })));
          addBtnTo(host, "Reset height", () => { delete s.y; upd(); });
          addBtnTo(host, "Delete bracket", () => { graph.stars.splice(idx, 1); FG.app.selectedAnn = null; upd(); rebuild(); });
        }
        return;
      }
      const a = (graph.annotations || []).find((x) => x.id === sel);
      if (!a) return;
      host.appendChild(heading("Selected " + a.type));
      if (a.type === "text") {
        host.appendChild(field("Text", text(a.text, (v) => { a.text = v; upd(); })));
        host.appendChild(field("Font", select(a.font || "", FONTS, (v) => { a.font = v; upd(); })));
        host.appendChild(field("Font size (pt)", num(a.size, 4, 96, 1, (v) => { a.size = v; upd(); })));
        host.appendChild(field("Bold", check(a.bold, (v) => { a.bold = v; upd(); })));
        host.appendChild(field("Italic", check(a.italic, (v) => { a.italic = v; upd(); })));
        host.appendChild(field("Rotation°", num(a.rotate || 0, -180, 180, 1, (v) => { a.rotate = v; upd(); })));
      }
      host.appendChild(field("Color", color(a.color || "#111111", (v) => { a.color = v; upd(); })));
      host.appendChild(field("Opacity", range(a.opacity != null ? a.opacity : 1, 0.1, 1, 0.05, (v) => { a.opacity = v; upd(); })));
      if (a.fill !== undefined) {
        host.appendChild(field("Fill", select(a.fill === "none" ? "none" : "solid", [["none", "None"], ["solid", "Solid"]], (v) => { a.fill = v === "none" ? "none" : (a._fill || "#cccccc"); upd(); rebuild(); })));
        if (a.fill !== "none") host.appendChild(field("Fill color", color(a.fill, (v) => { a.fill = v; a._fill = v; upd(); })));
      }
      if (a.strokeWidth !== undefined) host.appendChild(field("Line width", num(a.strokeWidth, 0.5, 20, 0.5, (v) => { a.strokeWidth = v; upd(); })));
      if (a.type !== "text") host.appendChild(field("Line style", select(a.dash || "solid", LINE_STYLES, (v) => { a.dash = v; upd(); })));
      host.appendChild(field("Behind data points", check(!!a.behind, (v) => { a.behind = v; upd(); rebuild(); })));
      if (a.type === "rect") host.appendChild(field("Corner radius", num(a.rx || 0, 0, 200, 1, (v) => { a.rx = v; upd(); })));
      if (a.type === "rect" || a.type === "ellipse") {
        host.appendChild(field("Shape width", num(Math.round(a.w), 1, 4000, 1, (v) => { a.w = v; upd(); })));
        host.appendChild(field("Shape height", num(Math.round(a.h), 1, 4000, 1, (v) => { a.h = v; upd(); })));
      }
      if (a.type === "line" || a.type === "arrow") {
        const len = Math.round(Math.hypot(a.x2 - a.x, a.y2 - a.y));
        const ang = Math.round((Math.atan2(a.y2 - a.y, a.x2 - a.x) * 180) / Math.PI);
        host.appendChild(field("Length", num(len, 1, 4000, 1, (v) => { const th = Math.atan2(a.y2 - a.y, a.x2 - a.x); a.x2 = a.x + v * Math.cos(th); a.y2 = a.y + v * Math.sin(th); upd(); })));
        host.appendChild(field("Angle°", num(ang, -180, 180, 1, (v) => { const l = Math.hypot(a.x2 - a.x, a.y2 - a.y); const th = (v * Math.PI) / 180; a.x2 = a.x + l * Math.cos(th); a.y2 = a.y + l * Math.sin(th); upd(); })));
        host.appendChild(field("Arrow at start", check(a.arrowStart, (v) => { a.arrowStart = v; upd(); })));
        host.appendChild(field("Arrow at end", check(a.arrowEnd !== false && (a.type === "arrow" || a.arrowEnd), (v) => { a.arrowEnd = v; upd(); })));
        btnRow(host, [
          ["Make horizontal", () => { const l = Math.hypot(a.x2 - a.x, a.y2 - a.y); a.x2 = a.x + l; a.y2 = a.y; upd(); rebuild(); }],
          ["Make vertical", () => { const l = Math.hypot(a.x2 - a.x, a.y2 - a.y); a.x2 = a.x; a.y2 = a.y + l; upd(); rebuild(); }],
        ]);
      }
      if (a.type !== "text") {
        const hh = document.createElement("div");
        hh.style.cssText = "color:var(--muted);font-size:11px;margin:4px 0;";
        hh.textContent = a.type === "line" || a.type === "arrow"
          ? "Drag the end-handles to resize (Shift = snap to 45°)."
          : "Drag the corner-handles to resize (Shift = keep aspect ratio).";
        host.appendChild(hh);
      }
      btnRow(host, [
        ["Bring to front", () => { this.zorder(graph, "front"); upd(); }],
        ["Send to back", () => { this.zorder(graph, "back"); upd(); }],
      ]);
      btnRow(host, [
        ["Duplicate", () => { this.duplicateSelected(graph); upd(); rebuild(); }],
        ["Delete", () => { graph.annotations = graph.annotations.filter((x) => x.id !== a.id); FG.app.selectedAnn = null; upd(); rebuild(); }],
      ]);
    },

    addAnnotation(graph, ann, onChange) {
      ann.id = M.uid("ann");
      graph.annotations = graph.annotations || [];
      graph.annotations.push(ann);
      FG.app.selectedAnn = ann.id;
      FG.app.multiSel = [ann.id];
      if (onChange) onChange();
      return ann;
    },

    autoStars(graph, table) {
      const groups = M.columnGroups(table);
      const an = FG.app.project.analyses.filter((a) => a.tableId === table.id && a.result && a.result.comparisons).slice(-1)[0];
      graph.stars = [];
      const source = an ? an.result.comparisons : FG.stats.oneWayANOVA(groups, { posthoc: "tukey" }).comparisons;
      source.filter((c) => c.sig).forEach((c, k) => addStarFor(graph, groups, c, k));
    },

    // Star significant rows from the most recent "Multiple t tests" analysis on
    // this table. Each bracket spans the two compared columns for that row; the
    // endpoints are [category, series] so they follow the graph orientation.
    autoStarsGrouped(graph, table) {
      const an = FG.app.project.analyses
        .filter((a) => a.tableId === table.id && a.kind === "multiplet" && a.result && a.result.tests)
        .slice(-1)[0];
      if (!an) return { ok: false, msg: "Run “Multiple t tests (one per row)” on this table first (＋ Analyze)." };
      const res = an.result;
      const byCol = graph.options.groupOrientation === "byColumn";
      graph.stars = [];
      let n = 0;
      res.tests.filter((t) => t.sig).forEach((t) => {
        const val = t.padj != null ? t.padj : t.p;
        let label = FG.stats.pStars(val);
        if (label === "ns") label = "*"; // FDR discovery whose q rounds ≥ 0.05
        // byRow: X = rows → category = this row, series = the two columns.
        // byColumn: X = columns → the two columns are separate groups, one bar each per row-series.
        const a = byCol ? [res.colA, t.rowIndex] : [t.rowIndex, res.colA];
        const b = byCol ? [res.colB, t.rowIndex] : [t.rowIndex, res.colB];
        graph.stars.push({ a, b, label, level: ++n });
      });
      return { ok: true, n, msg: n ? `Added ${n} significance bracket(s) from multiple t-tests.` : "No significant rows to star." };
    },

    // ---- Arrange operations ----------------------------------------------
    selectedShapes(graph) {
      const ids = (FG.app.multiSel && FG.app.multiSel.length) ? FG.app.multiSel : (FG.app.selectedAnn ? [FG.app.selectedAnn] : []);
      return (graph.annotations || []).filter((a) => ids.includes(a.id));
    },
    align(graph, mode) {
      const shapes = this.selectedShapes(graph);
      if (shapes.length < 2) return;
      const bxs = shapes.map((a) => ({ a, b: shapeBBox(a) }));
      const L = Math.min(...bxs.map((s) => s.b.l)), R = Math.max(...bxs.map((s) => s.b.r));
      const T = Math.min(...bxs.map((s) => s.b.t)), B = Math.max(...bxs.map((s) => s.b.b));
      bxs.forEach(({ a, b }) => {
        if (mode === "left") moveShape(a, L - b.l, 0);
        else if (mode === "right") moveShape(a, R - b.r, 0);
        else if (mode === "cx") moveShape(a, (L + R) / 2 - (b.l + b.r) / 2, 0);
        else if (mode === "top") moveShape(a, 0, T - b.t);
        else if (mode === "bottom") moveShape(a, 0, B - b.b);
        else if (mode === "cy") moveShape(a, 0, (T + B) / 2 - (b.t + b.b) / 2);
      });
    },
    distribute(graph, axis) {
      const shapes = this.selectedShapes(graph);
      if (shapes.length < 3) return;
      const bxs = shapes.map((a) => ({ a, b: shapeBBox(a) }));
      const cen = (b) => axis === "h" ? (b.l + b.r) / 2 : (b.t + b.b) / 2;
      bxs.sort((p, q) => cen(p.b) - cen(q.b));
      const first = cen(bxs[0].b), last = cen(bxs[bxs.length - 1].b);
      const step = (last - first) / (bxs.length - 1);
      bxs.forEach((s, i) => {
        const target = first + step * i;
        const d = target - cen(s.b);
        if (axis === "h") moveShape(s.a, d, 0); else moveShape(s.a, 0, d);
      });
    },
    // "front" = in front of the data (default layer); "back" = behind the data.
    // Also reorders within the annotation list for stacking among shapes.
    zorder(graph, mode) {
      const ids = (FG.app.multiSel && FG.app.multiSel.length) ? FG.app.multiSel : (FG.app.selectedAnn ? [FG.app.selectedAnn] : []);
      const moving = graph.annotations.filter((a) => ids.includes(a.id));
      const rest = graph.annotations.filter((a) => !ids.includes(a.id));
      moving.forEach((a) => { a.behind = mode === "back"; });
      graph.annotations = mode === "front" ? rest.concat(moving) : moving.concat(rest);
    },
    duplicateSelected(graph) {
      const shapes = this.selectedShapes(graph);
      if (!shapes.length) return;
      const clones = shapes.map((a) => { const c = JSON.parse(JSON.stringify(a)); c.id = M.uid("ann"); moveShape(c, 14, 14); return c; });
      graph.annotations.push(...clones);
      FG.app.multiSel = clones.map((c) => c.id);
      FG.app.selectedAnn = clones[clones.length - 1].id;
    },
    copySelected(graph) {
      const shapes = this.selectedShapes(graph);
      if (shapes.length) FG.app.shapeClipboard = shapes.map((a) => JSON.parse(JSON.stringify(a)));
    },
    pasteClipboard(graph) {
      const cb = FG.app.shapeClipboard;
      if (!cb || !cb.length) return false;
      const clones = cb.map((a) => { const c = JSON.parse(JSON.stringify(a)); c.id = M.uid("ann"); moveShape(c, 16, 16); return c; });
      graph.annotations.push(...clones);
      FG.app.multiSel = clones.map((c) => c.id);
      FG.app.selectedAnn = clones[clones.length - 1].id;
      return true;
    },
  };

  function addStarFor(graph, groups, c, k) {
    const i = groups.findIndex((g) => g.name === c.groupA);
    const j = groups.findIndex((g) => g.name === c.groupB);
    if (i < 0 || j < 0) return;
    graph.stars.push({ i, j, label: FG.stats.pStars(c.p), level: k + 1 });
  }
  // Names of the plotted data series for a graph (per-series style order).
  function seriesNames(graph, table) {
    if (graph.kind === "xy") return table.datasets.filter((d) => d.role !== "X").map((d) => d.title);
    if (graph.kind === "grouped") {
      // Series follow the legend: rows when transposed, else columns — and the
      // X categories when coloring by category.
      try {
        const c = M.groupedCells(table);
        const byCol = graph.options.groupOrientation === "byColumn";
        if (graph.options.groupColorBy === "category") return byCol ? c.colFactors : c.rowFactors;
        return byCol ? c.rowFactors : c.colFactors;
      } catch (e) { /* fall through */ }
    }
    return table.datasets.map((d) => d.title);
  }
  // How many series a graph draws (drives color-scheme sampling).
  function seriesCount(graph, table) {
    if (graph.kind === "grouped") return seriesNames(graph, table).length || table.datasets.length;
    if (graph.kind === "xy") return table.datasets.filter((d) => d.role !== "X").length;
    return table.datasets.length;
  }
  function shapeBBox(a) {
    if (a.type === "rect" || a.type === "ellipse") return { l: a.x, t: a.y, r: a.x + a.w, b: a.y + a.h };
    if (a.type === "line" || a.type === "arrow") return { l: Math.min(a.x, a.x2), t: Math.min(a.y, a.y2), r: Math.max(a.x, a.x2), b: Math.max(a.y, a.y2) };
    return { l: a.x, t: a.y - (a.size || 16), r: a.x + 40, b: a.y };
  }
  function moveShape(a, dx, dy) {
    a.x += dx; a.y += dy;
    if (a.x2 !== undefined) { a.x2 += dx; a.y2 += dy; }
  }

  // ---- Geometry helpers -------------------------------------------------
  function getTranslate(node) {
    const t = node.getAttribute("transform") || "";
    const m = t.match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
  }
  function rectSvg(svg, node) {
    const r = node.getBoundingClientRect();
    const b = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const sx = vb.width / b.width, sy = vb.height / b.height;
    return { left: (r.left - b.left) * sx, right: (r.right - b.left) * sx, top: (r.top - b.top) * sy, bottom: (r.bottom - b.top) * sy };
  }
  function svgPoint(svg, e) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return { x: ((e.clientX - rect.left) / rect.width) * vb.width, y: ((e.clientY - rect.top) / rect.height) * vb.height };
  }
  function constrainLine(fx, fy, x, y) {
    const th = Math.atan2(y - fy, x - fx);
    const snap = Math.round(th / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(x - fx, y - fy);
    return { x: fx + len * Math.cos(snap), y: fy + len * Math.sin(snap) };
  }

  // Non-annotation draggables (title / legend / axis title / bracket) → model.
  function classify(node, graph) {
    const o = graph.options;
    if (node.classList.contains("op-title")) {
      const base = getTranslate(node);
      return { sel: "__title__", axisLock: null, apply: (dx, dy) => { o.titleX = base.x + dx; o.titleY = base.y + dy; }, transform: (dx, dy) => `translate(${base.x + dx},${base.y + dy})` };
    }
    if (node.classList.contains("op-legend")) {
      const base = getTranslate(node);
      return { sel: "__legend__", axisLock: null, apply: (dx, dy) => { o.legendX = base.x + dx; o.legendY = base.y + dy; }, transform: (dx, dy) => `translate(${base.x + dx},${base.y + dy})` };
    }
    if (node.classList.contains("op-axistitle")) {
      const ax = node.getAttribute("data-axis");
      const base = getTranslate(node);
      return { sel: ax === "y" ? "__ytitle__" : "__xtitle__", axisLock: null, apply: (dx, dy) => { o[ax === "y" ? "yTitleX" : "xTitleX"] = base.x + dx; o[ax === "y" ? "yTitleY" : "xTitleY"] = base.y + dy; }, transform: (dx, dy) => `translate(${base.x + dx},${base.y + dy})` };
    }
    if (node.classList.contains("op-ticks")) {
      // Axis tick/category labels: draggable as a block via a stored offset.
      const ax = node.getAttribute("data-axis");
      const base = getTranslate(node);
      const kx = ax === "y" ? "yTicksDX" : "xTicksDX";
      const ky = ax === "y" ? "yTicksDY" : "xTicksDY";
      return { sel: ax === "y" ? "__yticks__" : "__xticks__", axisLock: null, apply: (dx, dy) => { o[kx] = base.x + dx; o[ky] = base.y + dy; }, transform: (dx, dy) => `translate(${base.x + dx},${base.y + dy})` };
    }
    const idx = parseInt(node.getAttribute("data-idx"));
    const baseY = parseFloat(node.getAttribute("data-basey"));
    return { sel: "bracket:" + idx, axisLock: "y", apply: (dx, dy) => { if (graph.stars[idx]) graph.stars[idx].y = baseY + dy; }, transform: (dx, dy) => `translate(0,${dy})` };
  }

  function snapDelta(box0, dx, dy, others, thresh) {
    const guides = [];
    const px = [box0.left + dx, (box0.left + box0.right) / 2 + dx, box0.right + dx];
    const py = [box0.top + dy, (box0.top + box0.bottom) / 2 + dy, box0.bottom + dy];
    let bestX = null, bestXd = thresh;
    let bestY = null, bestYd = thresh;
    others.forEach((o) => {
      const oxs = [o.left, (o.left + o.right) / 2, o.right];
      const oys = [o.top, (o.top + o.bottom) / 2, o.bottom];
      px.forEach((v) => oxs.forEach((ov) => { const d = ov - v; if (Math.abs(d) < Math.abs(bestXd)) { bestXd = d; bestX = ov; } }));
      py.forEach((v) => oys.forEach((ov) => { const d = ov - v; if (Math.abs(d) < Math.abs(bestYd)) { bestYd = d; bestY = ov; } }));
    });
    if (bestX !== null) { dx += bestXd; guides.push({ x: bestX }); }
    if (bestY !== null) { dy += bestYd; guides.push({ y: bestY }); }
    return { dx, dy, guides };
  }
  function drawGuides(svg, guides) {
    let layer = svg.querySelector(".op-guides");
    if (!layer) { layer = document.createElementNS(NS, "g"); layer.setAttribute("class", "op-guides"); svg.appendChild(layer); }
    layer.innerHTML = "";
    const vb = svg.viewBox.baseVal;
    guides.forEach((g) => {
      const ln = document.createElementNS(NS, "line");
      if (g.x != null) { ln.setAttribute("x1", g.x); ln.setAttribute("x2", g.x); ln.setAttribute("y1", 0); ln.setAttribute("y2", vb.height); }
      else { ln.setAttribute("y1", g.y); ln.setAttribute("y2", g.y); ln.setAttribute("x1", 0); ln.setAttribute("x2", vb.width); }
      ln.setAttribute("stroke", "#ff4d8d"); ln.setAttribute("stroke-width", "0.75"); ln.setAttribute("stroke-dasharray", "4 3");
      layer.appendChild(ln);
    });
  }
  function clearGuides(svg) { const l = svg.querySelector(".op-guides"); if (l) l.remove(); }

  FG.editor.paintSelection = function (svg) {
    svg.querySelectorAll(".selected").forEach((n) => n.classList.remove("selected"));
    const ms = FG.app.multiSel || [];
    ms.forEach((id) => { const n = svg.querySelector(`.op-annotation[data-annid="${id}"]`); if (n) n.classList.add("selected"); });
    const sel = FG.app.selectedAnn;
    if (!sel) return;
    if (sel === "__title__") { const n = svg.querySelector(".op-title"); if (n) n.classList.add("selected"); }
    else if (sel === "__legend__") { const n = svg.querySelector(".op-legend"); if (n) n.classList.add("selected"); }
    else if (sel === "__xtitle__") { const n = svg.querySelector('.op-axistitle[data-axis="x"]'); if (n) n.classList.add("selected"); }
    else if (sel === "__ytitle__") { const n = svg.querySelector('.op-axistitle[data-axis="y"]'); if (n) n.classList.add("selected"); }
    else if (sel === "__xticks__") { svg.querySelectorAll('.op-ticks[data-axis="x"]').forEach((n) => n.classList.add("selected")); }
    else if (sel === "__yticks__") { const n = svg.querySelector('.op-ticks[data-axis="y"]'); if (n) n.classList.add("selected"); }
    else if (sel.startsWith("bracket:")) { const n = svg.querySelector('.op-bracket[data-idx="' + sel.split(":")[1] + '"]'); if (n) n.classList.add("selected"); }
    else { const n = svg.querySelector(`.op-annotation[data-annid="${sel}"]`); if (n) n.classList.add("selected"); }
  };

  // ---- Master pointer interaction ---------------------------------------
  FG.editor.enableDrag = function (svg, graph, commit, selectRefresh) {
    let drag = null, marquee = null, draw = null;
    const nodes = Array.from(svg.querySelectorAll(".op-annotation, .op-title, .op-legend, .op-axistitle, .op-bracket, .op-ticks"));
    const boxes = nodes.map((n) => ({ node: n, rect: rectSvg(svg, n) }));
    if (FG.app.drawMode) svg.style.cursor = "crosshair";

    // Clicking a bar / point / slice jumps to its series' style panel (Data tab)
    // instead of clearing the selection via the background handler.
    svg.querySelectorAll(".op-data").forEach((node) => {
      node.addEventListener("mousedown", (e) => {
        if (FG.app.drawMode) return;
        e.preventDefault();
        e.stopPropagation();
        const s = node.getAttribute("data-series");
        FG.app.selectedAnn = null;
        FG.app.multiSel = [];
        FG.app.inspectorTab = "data";
        if (s != null && s !== "") FG.app.seriesIdx = parseInt(s);
        FG.editor.paintSelection(svg);
        const handles = svg.querySelector(".op-handles"); if (handles) handles.remove();
        selectRefresh();
        FG.setStatus("Editing data series style — see the Data tab.");
      });
    });

    nodes.forEach((node) => {
      node.style.cursor = node.classList.contains("op-ticks") ? "pointer" : "move";
      node.addEventListener("mousedown", (e) => {
        if (FG.app.drawMode) return; // background handler starts the draw
        e.preventDefault();
        e.stopPropagation();
        const pt = svgPoint(svg, e);
        if (node.classList.contains("op-annotation")) {
          const id = node.getAttribute("data-annid");
          let ms = FG.app.multiSel || [];
          if (e.shiftKey) {
            ms = ms.includes(id) ? ms.filter((x) => x !== id) : ms.concat(id);
            FG.app.multiSel = ms;
            FG.app.selectedAnn = ms.length ? ms[ms.length - 1] : null;
          } else {
            if (!ms.includes(id)) FG.app.multiSel = [id];
            FG.app.selectedAnn = id;
          }
          const ids = (FG.app.multiSel && FG.app.multiSel.length) ? FG.app.multiSel : [id];
          const group = ids.map((iid) => {
            const a = graph.annotations.find((x) => x.id === iid);
            const nd = svg.querySelector(`.op-annotation[data-annid="${iid}"]`);
            return a ? { a, nd, o0: { x: a.x, y: a.y, x2: a.x2, y2: a.y2 } } : null;
          }).filter(Boolean);
          drag = { group, sx: pt.x, sy: pt.y, box0: rectSvg(svg, node), others: boxes.filter((b) => !ids.includes(b.node.getAttribute("data-annid"))).map((b) => b.rect) };
        } else {
          FG.app.multiSel = [];
          const info = classify(node, graph);
          FG.app.selectedAnn = info.sel;
          drag = { node, info, sx: pt.x, sy: pt.y, box0: rectSvg(svg, node), others: boxes.filter((b) => b.node !== node).map((b) => b.rect) };
        }
        FG.editor.paintSelection(svg);
        selectRefresh();
      });
    });

    svg.addEventListener("mousedown", (e) => {
      const pt = svgPoint(svg, e);
      if (FG.app.drawMode) { e.preventDefault(); draw = { type: FG.app.drawMode, x0: pt.x, y0: pt.y, node: null }; return; }
      if (e.target === svg || (e.target.tagName === "rect" && e.target === svg.firstChild)) {
        marquee = { x0: pt.x, y0: pt.y, node: null, moved: false };
        if (FG.app.selectedAnn || (FG.app.multiSel || []).length) {
          FG.app.selectedAnn = null; FG.app.multiSel = [];
          FG.editor.paintSelection(svg); selectRefresh();
        }
      }
    });

    svg.addEventListener("mousemove", (e) => {
      const pt = svgPoint(svg, e);
      if (draw) { updateDrawPreview(svg, draw, pt, e.shiftKey); return; }
      if (marquee) { marquee.moved = true; updateMarquee(svg, marquee, pt); return; }
      if (!drag) return;
      let dx = pt.x - drag.sx, dy = pt.y - drag.sy;
      if (e.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; } // H/V constraint
      if (drag.info && drag.info.axisLock === "y") dx = 0;
      if (graph.options.snap !== false && !e.shiftKey) {
        const s = snapDelta(drag.box0, dx, dy, drag.others, 7);
        dx = s.dx; dy = s.dy;
        if (drag.info && drag.info.axisLock === "y") dx = 0;
        drawGuides(svg, s.guides);
      } else { clearGuides(svg); }
      if (drag.group) {
        drag.group.forEach((p) => {
          p.a.x = p.o0.x + dx; p.a.y = p.o0.y + dy;
          if (p.a.x2 !== undefined) { p.a.x2 = p.o0.x2 + dx; p.a.y2 = p.o0.y2 + dy; }
          if (p.nd) p.nd.setAttribute("transform", `translate(${dx},${dy})`);
        });
      } else if (drag.info) {
        drag.info.apply(dx, dy);
        drag.node.setAttribute("transform", drag.info.transform(dx, dy));
      }
    });

    const stop = (e) => {
      if (draw) {
        const pt = e ? svgPoint(svg, e) : null;
        finishDraw(svg, graph, draw, pt, e && e.shiftKey);
        draw = null; FG.app.drawMode = null;
        commit(); selectRefresh();
        return;
      }
      if (marquee) {
        if (marquee.moved) finishMarquee(svg, graph, marquee);
        const el = svg.querySelector(".op-marquee"); if (el) el.remove();
        marquee = null;
        FG.editor.paintSelection(svg); selectRefresh();
        return;
      }
      if (drag) { drag = null; clearGuides(svg); commit(); }
    };
    svg.addEventListener("mouseup", stop);
    svg.addEventListener("mouseleave", stop);
  };

  function updateMarquee(svg, m, pt) {
    if (!m.node) { m.node = document.createElementNS(NS, "rect"); m.node.setAttribute("class", "op-marquee"); m.node.setAttribute("fill", "rgba(47,111,176,0.10)"); m.node.setAttribute("stroke", "#2f6fb0"); m.node.setAttribute("stroke-dasharray", "4 3"); svg.appendChild(m.node); }
    const x = Math.min(m.x0, pt.x), y = Math.min(m.y0, pt.y), w = Math.abs(pt.x - m.x0), h = Math.abs(pt.y - m.y0);
    m.node.setAttribute("x", x); m.node.setAttribute("y", y); m.node.setAttribute("width", w); m.node.setAttribute("height", h);
    m.rect = { left: x, top: y, right: x + w, bottom: y + h };
  }
  function finishMarquee(svg, graph, m) {
    if (!m.rect) return;
    const hit = [];
    (graph.annotations || []).forEach((a) => {
      const node = svg.querySelector(`.op-annotation[data-annid="${a.id}"]`);
      if (!node) return;
      const r = rectSvg(svg, node);
      if (r.right >= m.rect.left && r.left <= m.rect.right && r.bottom >= m.rect.top && r.top <= m.rect.bottom) hit.push(a.id);
    });
    FG.app.multiSel = hit;
    FG.app.selectedAnn = hit.length ? hit[hit.length - 1] : null;
  }

  function updateDrawPreview(svg, draw, pt, shift) {
    const line = draw.type === "line" || draw.type === "arrow";
    if (!draw.node) {
      draw.node = document.createElementNS(NS, line ? "line" : "rect");
      draw.node.setAttribute("class", "op-draw-preview");
      draw.node.setAttribute("stroke", "#2f6fb0"); draw.node.setAttribute("stroke-dasharray", "4 3");
      if (!line) draw.node.setAttribute("fill", "rgba(47,111,176,0.10)");
      svg.appendChild(draw.node);
    }
    let x = pt.x, y = pt.y;
    if (line) {
      if (shift) { const c = constrainLine(draw.x0, draw.y0, x, y); x = c.x; y = c.y; }
      draw.node.setAttribute("x1", draw.x0); draw.node.setAttribute("y1", draw.y0); draw.node.setAttribute("x2", x); draw.node.setAttribute("y2", y);
      draw.cur = { x, y };
    } else {
      let w = x - draw.x0, h = y - draw.y0;
      if (shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
      draw.node.setAttribute("x", Math.min(draw.x0, draw.x0 + w)); draw.node.setAttribute("y", Math.min(draw.y0, draw.y0 + h));
      draw.node.setAttribute("width", Math.abs(w)); draw.node.setAttribute("height", Math.abs(h));
      draw.cur = { w, h };
    }
  }
  function finishDraw(svg, graph, draw, pt, shift) {
    const prev = svg.querySelector(".op-draw-preview"); if (prev) prev.remove();
    const t = draw.type;
    if (t === "text") {
      FG.editor.addAnnotation(graph, { type: "text", x: draw.x0, y: draw.y0, text: "Label", size: 16, color: "#111" });
      return;
    }
    if (t === "line" || t === "arrow") {
      let x2 = draw.cur ? draw.cur.x : draw.x0 + 120, y2 = draw.cur ? draw.cur.y : draw.y0;
      if (Math.hypot(x2 - draw.x0, y2 - draw.y0) < 5) { x2 = draw.x0 + 120; y2 = draw.y0; }
      FG.editor.addAnnotation(graph, { type: t, x: draw.x0, y: draw.y0, x2, y2, color: "#111", strokeWidth: 2 });
      return;
    }
    // rect / ellipse
    let w = draw.cur ? draw.cur.w : 0, h = draw.cur ? draw.cur.h : 0;
    if (Math.abs(w) < 5 || Math.abs(h) < 5) { w = 110; h = 80; }
    const x = Math.min(draw.x0, draw.x0 + w), y = Math.min(draw.y0, draw.y0 + h);
    FG.editor.addAnnotation(graph, { type: t, x, y, w: Math.abs(w), h: Math.abs(h), color: "#111", fill: "none", strokeWidth: 2 });
  }

  // ---- Resize handles for the selected shape ----------------------------
  function applyResize(a, role, orig, dx, dy, shift) {
    if (role === "p1" || role === "p2") {
      let px = (role === "p1" ? orig.x : orig.x2) + dx;
      let py = (role === "p1" ? orig.y : orig.y2) + dy;
      if (shift) { const fx = role === "p1" ? orig.x2 : orig.x, fy = role === "p1" ? orig.y2 : orig.y; const c = constrainLine(fx, fy, px, py); px = c.x; py = c.y; }
      if (role === "p1") { a.x = px; a.y = py; } else { a.x2 = px; a.y2 = py; }
      return;
    }
    let left = orig.x, top = orig.y, right = orig.x + orig.w, bottom = orig.y + orig.h;
    if (role.includes("w")) left = orig.x + dx;
    if (role.includes("e")) right = orig.x + orig.w + dx;
    if (role.includes("n")) top = orig.y + dy;
    if (role.includes("s")) bottom = orig.y + orig.h + dy;
    if (shift && orig.w > 0 && orig.h > 0) {
      const ratio = orig.w / orig.h;
      let w = right - left, h = bottom - top;
      const sw = Math.sign(w) || 1, sh = Math.sign(h) || 1;
      let aw = Math.abs(w), ah = Math.abs(h);
      if (aw / ah > ratio) ah = aw / ratio; else aw = ah * ratio;
      w = aw * sw; h = ah * sh;
      if (role.includes("w")) left = right - w; else right = left + w;
      if (role.includes("n")) top = bottom - h; else bottom = top + h;
    }
    a.x = Math.min(left, right); a.y = Math.min(top, bottom);
    a.w = Math.max(1, Math.abs(right - left)); a.h = Math.max(1, Math.abs(bottom - top));
  }
  function updateShapeNodes(svg, a) {
    const grp = svg.querySelector('.op-annotation[data-annid="' + a.id + '"]');
    if (!grp) return;
    grp.querySelectorAll(".op-shape, .op-hit").forEach((n) => {
      if (a.type === "rect") { n.setAttribute("x", a.x); n.setAttribute("y", a.y); n.setAttribute("width", a.w); n.setAttribute("height", a.h); }
      else if (a.type === "ellipse") { n.setAttribute("cx", a.x + a.w / 2); n.setAttribute("cy", a.y + a.h / 2); n.setAttribute("rx", Math.abs(a.w / 2)); n.setAttribute("ry", Math.abs(a.h / 2)); }
      else { n.setAttribute("x1", a.x); n.setAttribute("y1", a.y); n.setAttribute("x2", a.x2); n.setAttribute("y2", a.y2); }
    });
  }
  function positionHandles(svg, a) {
    const layer = svg.querySelector(".op-handles");
    if (!layer) return;
    const set = (role, x, y) => { const h = layer.querySelector('[data-role="' + role + '"]'); if (h) { h.setAttribute("x", x - 4.5); h.setAttribute("y", y - 4.5); } };
    if (a.type === "line" || a.type === "arrow") { set("p1", a.x, a.y); set("p2", a.x2, a.y2); }
    else { set("nw", a.x, a.y); set("ne", a.x + a.w, a.y); set("sw", a.x, a.y + a.h); set("se", a.x + a.w, a.y + a.h); }
  }
  FG.editor.addResizeHandles = function (svg, graph, commit) {
    if ((FG.app.multiSel || []).length > 1) return; // handles only for a single shape
    const s = FG.app.selectedAnn;
    if (!s || typeof s !== "string" || s.startsWith("__") || s.startsWith("bracket:")) return;
    const a = (graph.annotations || []).find((x) => x.id === s);
    if (!a || a.type === "text") return;
    const pts = a.type === "line" || a.type === "arrow"
      ? [{ role: "p1", x: a.x, y: a.y, cur: "move" }, { role: "p2", x: a.x2, y: a.y2, cur: "move" }]
      : [{ role: "nw", x: a.x, y: a.y, cur: "nwse-resize" }, { role: "ne", x: a.x + a.w, y: a.y, cur: "nesw-resize" },
         { role: "sw", x: a.x, y: a.y + a.h, cur: "nesw-resize" }, { role: "se", x: a.x + a.w, y: a.y + a.h, cur: "nwse-resize" }];
    const layer = document.createElementNS(NS, "g");
    layer.setAttribute("class", "op-handles");
    svg.appendChild(layer);
    pts.forEach((p) => {
      const h = document.createElementNS(NS, "rect");
      h.setAttribute("x", p.x - 4.5); h.setAttribute("y", p.y - 4.5); h.setAttribute("width", 9); h.setAttribute("height", 9);
      h.setAttribute("data-role", p.role); h.setAttribute("fill", "#fff"); h.setAttribute("stroke", "#2f6fb0"); h.setAttribute("stroke-width", 1.5);
      h.style.cursor = p.cur;
      layer.appendChild(h);
      h.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const start = svgPoint(svg, e);
        const orig = { x: a.x, y: a.y, w: a.w, h: a.h, x2: a.x2, y2: a.y2 };
        const move = (ev) => { const cur = svgPoint(svg, ev); applyResize(a, p.role, orig, cur.x - start.x, cur.y - start.y, ev.shiftKey); updateShapeNodes(svg, a); positionHandles(svg, a); };
        const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); commit(); };
        window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      });
    });
  };

  // Nudge selected object(s) by (dx, dy) — arrow keys.
  FG.editor.nudge = function (graph, dx, dy) {
    const multi = FG.app.multiSel || [];
    if (multi.length) {
      const shapes = graph.annotations.filter((a) => multi.includes(a.id));
      if (!shapes.length) return false;
      shapes.forEach((a) => moveShape(a, dx, dy));
      return true;
    }
    const sel = FG.app.selectedAnn;
    if (!sel) return false;
    const o = graph.options, svg = FG.app._svg;
    const baseOf = (q) => { const n = svg && svg.querySelector(q); return n ? getTranslate(n) : { x: 0, y: 0 }; };
    if (sel === "__title__") { const b = baseOf(".op-title"); o.titleX = (o.titleX != null ? o.titleX : b.x) + dx; o.titleY = (o.titleY != null ? o.titleY : b.y) + dy; }
    else if (sel === "__legend__") { const b = baseOf(".op-legend"); o.legendX = (o.legendX != null ? o.legendX : b.x) + dx; o.legendY = (o.legendY != null ? o.legendY : b.y) + dy; }
    else if (sel === "__xtitle__") { const b = baseOf('.op-axistitle[data-axis="x"]'); o.xTitleX = (o.xTitleX != null ? o.xTitleX : b.x) + dx; o.xTitleY = (o.xTitleY != null ? o.xTitleY : b.y) + dy; }
    else if (sel === "__ytitle__") { const b = baseOf('.op-axistitle[data-axis="y"]'); o.yTitleX = (o.yTitleX != null ? o.yTitleX : b.x) + dx; o.yTitleY = (o.yTitleY != null ? o.yTitleY : b.y) + dy; }
    else if (sel === "__xticks__") { o.xTicksDX = (o.xTicksDX || 0) + dx; o.xTicksDY = (o.xTicksDY || 0) + dy; }
    else if (sel === "__yticks__") { o.yTicksDX = (o.yTicksDX || 0) + dx; o.yTicksDY = (o.yTicksDY || 0) + dy; }
    else if (sel.startsWith("bracket:")) { const idx = parseInt(sel.split(":")[1]); const node = svg && svg.querySelector('.op-bracket[data-idx="' + idx + '"]'); const baseY = node ? parseFloat(node.getAttribute("data-basey")) : 0; if (graph.stars[idx]) graph.stars[idx].y = (graph.stars[idx].y != null ? graph.stars[idx].y : baseY) + dy; }
    else { const a = (graph.annotations || []).find((x) => x.id === sel); if (!a) return false; moveShape(a, dx, dy); }
    return true;
  };
})();
