/*
 * Figulate — main application controller. window.FG.app
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;

  // ---- Modal utility ------------------------------------------------------
  FG.modal = {
    show({ title, sub, body, okLabel = "OK", cancelLabel = "Cancel", onOk, hideCancel }) {
      const backdrop = document.getElementById("modal-backdrop");
      const modal = document.getElementById("modal");
      modal.innerHTML = "";
      if (title) { const h = document.createElement("h2"); h.textContent = title; modal.appendChild(h); }
      if (sub) { const s = document.createElement("p"); s.className = "modal-sub"; s.textContent = sub; modal.appendChild(s); }
      if (typeof body === "string") { const d = document.createElement("div"); d.innerHTML = body; modal.appendChild(d); }
      else if (body) modal.appendChild(body);
      const actions = document.createElement("div");
      actions.className = "modal-actions";
      if (!hideCancel) { const c = document.createElement("button"); c.textContent = cancelLabel; c.onclick = () => this.hide(); actions.appendChild(c); }
      const ok = document.createElement("button"); ok.textContent = okLabel; ok.className = "accent";
      ok.onclick = () => { const r = onOk ? onOk() : true; if (r !== false) this.hide(); };
      actions.appendChild(ok);
      modal.appendChild(actions);
      // Dismiss with a click outside the dialog (unless the modal is mandatory).
      this.cancellable = !hideCancel;
      backdrop.onmousedown = (e) => { if (e.target === backdrop && this.cancellable) this.hide(); };
      backdrop.classList.remove("hidden");
    },
    hide() { document.getElementById("modal-backdrop").classList.add("hidden"); },
  };

  FG.setStatus = (msg) => { document.getElementById("status").textContent = msg; };

  // ---- App state ----------------------------------------------------------
  const app = {
    project: null,
    current: { view: "sheet", id: null },
    selectedAnn: null,
    multiSel: [],
    drawMode: null,
    shapeClipboard: null,
    _undo: [],
    _redo: [],
    _undoTimer: null,

    init() {
      this.project = M.createProject();
      this.bindToolbar();
      this.bindKeys();
      this.initNavResizer();
      // Capture pre-edit state whenever the user starts interacting with the
      // graph canvas or the editor panel (covers drags, resizes, field edits).
      document.addEventListener("pointerdown", (e) => {
        if (this.current.view !== "graph") return;
        if (e.target.closest && (e.target.closest("#inspector") || e.target.closest(".graph-canvas"))) this.snapshot();
      }, true);
      // Keep "fit" zoom in sync with the window size.
      window.addEventListener("resize", () => {
        if (this.current.view !== "graph") return;
        const g = this.project.graphs.find((x) => x.id === this.current.id);
        if (g && (g.options.zoom == null || g.options.zoom === "fit")) this.renderGraph(g, true);
      });
      this.welcome();
    },

    // ---- Undo / redo (project-level JSON snapshots) ----------------------
    snapshot() {
      // Capture the pre-edit state so it can be restored. Debounced (one entry
      // per gesture) and deduped (skip if identical to the last entry) so pure
      // selection clicks and drag bursts don't bloat the history.
      if (this._undoTimer) return;
      const snap = JSON.stringify(this.project);
      if (this._undo[this._undo.length - 1] !== snap) {
        this._undo.push(snap);
        if (this._undo.length > 60) this._undo.shift();
        this._redo = [];
        this.updateUndoButtons();
      }
      this._undoTimer = setTimeout(() => { this._undoTimer = null; }, 350);
    },
    restore(json) {
      this.project = JSON.parse(json);
      this.project.graphs = this.project.graphs || [];
      this.project.analyses = this.project.analyses || [];
      this.selectedAnn = null; this.multiSel = [];
      // Re-open whatever the current view points at, if it still exists.
      const cur = this.current;
      if (cur.view === "graph" && this.project.graphs.find((x) => x.id === cur.id)) this.openGraph(cur.id);
      else if (cur.view === "results" && this.project.analyses.find((x) => x.id === cur.id)) this.openResults(cur.id);
      else if (this.project.tables[0]) this.openTable(this.project.tables[0].id);
      else this.renderNav();
      this.updateUndoButtons();
    },
    undo() {
      if (this._undoTimer) { clearTimeout(this._undoTimer); this._undoTimer = null; }
      if (!this._undo.length) { FG.setStatus("Nothing to undo."); return; }
      this._redo.push(JSON.stringify(this.project));
      this.restore(this._undo.pop());
      FG.setStatus("Undo.");
    },
    redo() {
      if (!this._redo.length) { FG.setStatus("Nothing to redo."); return; }
      this._undo.push(JSON.stringify(this.project));
      this.restore(this._redo.pop());
      FG.setStatus("Redo.");
    },
    updateUndoButtons() {
      const u = document.querySelector('[data-cmd="undo"]'), r = document.querySelector('[data-cmd="redo"]');
      if (u) u.disabled = !this._undo.length;
      if (r) r.disabled = !this._redo.length;
    },

    bindKeys() {
      const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      document.addEventListener("keydown", (e) => {
        const mod = e.ctrlKey || e.metaKey;
        const tag = document.activeElement && document.activeElement.tagName;
        const editing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

        // Escape closes an open (dismissible) modal before anything else.
        if (e.key === "Escape" && !document.getElementById("modal-backdrop").classList.contains("hidden")) {
          if (FG.modal.cancellable) FG.modal.hide();
          return;
        }

        // Ctrl+S saves the project (and stops the browser's own save dialog).
        if (mod && (e.key === "s" || e.key === "S")) { e.preventDefault(); this.saveFile(); return; }

        // Undo/redo work anywhere (except while typing in a field).
        if (mod && !editing && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
        if (mod && !editing && (e.key === "y" || e.key === "Y")) { e.preventDefault(); this.redo(); return; }

        if (this.current.view !== "graph") return;
        const g = this.project.graphs.find((x) => x.id === this.current.id);
        if (!g) return;

        if (e.key === "Escape") { this.drawMode = null; this.selectedAnn = null; this.multiSel = []; this.renderGraph(g); return; }

        // Shape clipboard (graph view only, not while typing).
        if (mod && !editing && (e.key === "c" || e.key === "C")) { FG.editor.copySelected(g); FG.setStatus("Copied shape(s)."); return; }
        if (mod && !editing && (e.key === "v" || e.key === "V")) { this.snapshot(); if (FG.editor.pasteClipboard(g)) this.renderGraph(g); return; }
        if (mod && !editing && (e.key === "d" || e.key === "D")) { e.preventDefault(); this.snapshot(); FG.editor.duplicateSelected(g); this.renderGraph(g); return; }

        if (editing) return;
        const hasSel = this.selectedAnn || (this.multiSel && this.multiSel.length);
        if (!hasSel) return;

        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          this.snapshot();
          const ms = this.multiSel || [];
          if (ms.length) g.annotations = (g.annotations || []).filter((a) => !ms.includes(a.id));
          else {
            const sel = this.selectedAnn;
            if (sel === "__title__") g.options.title = "";
            else if (sel === "__legend__") g.options.showLegend = false;
            else if (sel === "__xtitle__") g.options.xTitle = "";
            else if (sel === "__ytitle__") g.options.yTitle = "";
            else if (sel.startsWith("bracket:")) (g.stars || []).splice(parseInt(sel.split(":")[1]), 1);
            else g.annotations = (g.annotations || []).filter((a) => a.id !== sel);
          }
          this.selectedAnn = null; this.multiSel = [];
          this.renderGraph(g);
          return;
        }
        if (ARROWS[e.key]) {
          e.preventDefault();
          this.snapshot();
          const step = e.shiftKey ? 10 : 1;
          const [ux, uy] = ARROWS[e.key];
          if (FG.editor.nudge(g, ux * step, uy * step)) this.renderGraph(g, true);
        }
      });
    },

    // Drag the divider next to the navigator to widen it (helps long table /
    // analysis names). Width persists across sessions; double-click resets.
    initNavResizer() {
      const LS = "op_nav_width";
      const DEFAULT_W = 232, MIN_W = 150, MAX_W = 560;
      const setW = (px) => document.documentElement.style.setProperty("--nav-w", px + "px");
      try {
        const saved = parseInt(localStorage.getItem(LS));
        if (saved) setW(Math.max(MIN_W, Math.min(MAX_W, saved)));
      } catch (e) { /* storage unavailable */ }
      const rz = document.getElementById("nav-resizer");
      if (!rz) return;
      rz.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        rz.setPointerCapture(e.pointerId);
        rz.classList.add("dragging");
        const startX = e.clientX;
        const startW = document.getElementById("navigator").getBoundingClientRect().width;
        let w = startW;
        const move = (ev) => { w = Math.max(MIN_W, Math.min(MAX_W, startW + ev.clientX - startX)); setW(w); };
        const up = () => {
          rz.removeEventListener("pointermove", move);
          rz.classList.remove("dragging");
          try { localStorage.setItem(LS, String(Math.round(w))); } catch (err) { /* ignore */ }
        };
        rz.addEventListener("pointermove", move);
        rz.addEventListener("pointerup", up, { once: true });
        rz.addEventListener("pointercancel", up, { once: true });
      });
      rz.addEventListener("dblclick", () => {
        setW(DEFAULT_W);
        try { localStorage.removeItem(LS); } catch (e) { /* ignore */ }
        FG.setStatus("Panel width reset.");
      });
    },

    bindToolbar() {
      document.querySelectorAll("#toolbar [data-cmd]").forEach((b) => {
        b.onclick = () => this.command(b.dataset.cmd);
      });
      document.querySelectorAll("[data-add=table]").forEach((b) => b.onclick = () => this.newTableDialog());
    },

    command(cmd) {
      if (cmd === "new") { this.project = M.createProject(); this.selectedAnn = null; this.multiSel = []; this._undo = []; this._redo = []; this.welcome(); }
      else if (cmd === "open") this.openFile();
      else if (cmd === "save") this.saveFile();
      else if (cmd === "analyze") this.doAnalyze();
      else if (cmd === "newgraph") this.doNewGraph();
      else if (cmd === "exportSvg") this.exportSvg();
      else if (cmd === "exportPng") this.exportPng();
      else if (cmd === "demo") this.loadDemo();
      else if (cmd === "undo") this.undo();
      else if (cmd === "redo") this.redo();
      else if (cmd === "aiAnalyze") this.doAiAnalyze();
      else if (cmd === "aiSettings") FG.ai.showSettings();
    },

    // ---- Welcome / new table --------------------------------------------
    welcome() {
      this.renderNav();
      const grid = document.createElement("div");
      grid.className = "choice-grid";
      let sel = "column";
      Object.entries(M.TABLE_TYPES).forEach(([key, def]) => {
        const c = document.createElement("div");
        c.className = "choice" + (key === "column" ? " selected" : "");
        c.innerHTML = `<div class="c-title">${def.name}</div><div class="c-desc">${def.desc}</div>`;
        c.onclick = () => { grid.querySelectorAll(".choice").forEach((x) => x.classList.remove("selected")); c.classList.add("selected"); sel = key; };
        grid.appendChild(c);
      });
      FG.modal.show({
        title: "Create a new data table",
        sub: "Pick the kind of data you have — the table type determines which analyses and graphs are available.",
        body: grid, okLabel: "Create", hideCancel: this.project.tables.length === 0,
        onOk: () => { this.addTable(sel); },
      });
    },

    newTableDialog() { this.welcome(); },

    addTable(type) {
      const t = M.createTable(type);
      this.project.tables.push(t);
      this.openTable(t.id);
      FG.setStatus(`Created ${M.TABLE_TYPES[type].name} table.`);
    },

    // ---- Navigator -------------------------------------------------------
    renderNav() {
      const nt = document.getElementById("nav-tables");
      const na = document.getElementById("nav-analyses");
      const ng = document.getElementById("nav-graphs");
      const item = (label, ico, active, onClick, onDel) => {
        const li = document.createElement("li");
        li.className = active ? "active" : "";
        li.title = label; // full name on hover (long titles get ellipsized)
        const icoEl = document.createElement("span"); icoEl.className = "ico"; icoEl.textContent = ico;
        const labelEl = document.createElement("span"); labelEl.textContent = label;
        li.append(icoEl, labelEl);
        li.onclick = onClick;
        if (onDel) { const d = document.createElement("span"); d.className = "del"; d.textContent = "✕"; d.onclick = (e) => { e.stopPropagation(); onDel(); }; li.appendChild(d); }
        return li;
      };
      nt.innerHTML = ""; na.innerHTML = ""; ng.innerHTML = "";
      this.project.tables.forEach((t) => nt.appendChild(item(t.name, "▤", this.current.view === "sheet" && this.current.id === t.id, () => this.openTable(t.id), () => this.deleteTable(t.id))));
      // After deleting the item that is currently open, navigate somewhere real
      // so `current` never points at a ghost (which breaks Analyze/New Graph).
      const leaveDeleted = (wasCurrent) => {
        if (!wasCurrent) { this.renderNav(); return; }
        if (this.project.tables.length) this.openTable(this.project.tables[0].id);
        else this.welcome();
      };
      this.project.analyses.forEach((a) => {
        na.appendChild(item(a.name, "∑", this.current.view === "results" && this.current.id === a.id, () => this.openResults(a.id), () => {
          const wasCurrent = this.current.view === "results" && this.current.id === a.id;
          this.project.analyses = this.project.analyses.filter((x) => x.id !== a.id);
          leaveDeleted(wasCurrent);
        }));
      });
      this.project.graphs.forEach((g) => ng.appendChild(item(g.name, "◔", this.current.view === "graph" && this.current.id === g.id, () => this.openGraph(g.id), () => {
        const wasCurrent = this.current.view === "graph" && this.current.id === g.id;
        this.project.graphs = this.project.graphs.filter((x) => x.id !== g.id);
        leaveDeleted(wasCurrent);
      })));
    },

    tableById(id) { return this.project.tables.find((t) => t.id === id); },
    currentTable() {
      if (this.current.view === "sheet") return this.tableById(this.current.id);
      if (this.current.view === "results") { const a = this.project.analyses.find((x) => x.id === this.current.id); return a && this.tableById(a.tableId); }
      if (this.current.view === "graph") { const g = this.project.graphs.find((x) => x.id === this.current.id); return g && this.tableById(g.tableId); }
      return this.project.tables[0];
    },

    showView(view) {
      ["sheet", "results", "graph"].forEach((v) => document.getElementById(v + "-view").classList.toggle("hidden", v !== view));
      document.getElementById("inspector").classList.toggle("hidden", view !== "graph");
    },

    // ---- Data sheet ------------------------------------------------------
    openTable(id) {
      this.current = { view: "sheet", id };
      this.showView("sheet");
      const t = this.tableById(id);
      FG.grid.render(document.getElementById("sheet-view"), t, (info) => {
        if (info && info.nav) this.renderNav();
        if (info && info.full) this.openTable(id);
      });
      this.renderNav();
    },

    deleteTable(id) {
      this.project.tables = this.project.tables.filter((t) => t.id !== id);
      this.project.analyses = this.project.analyses.filter((a) => a.tableId !== id);
      this.project.graphs = this.project.graphs.filter((g) => g.tableId !== id);
      if (this.project.tables.length) this.openTable(this.project.tables[0].id);
      else this.welcome();
    },

    // ---- Analyze ---------------------------------------------------------
    doAnalyze() {
      const t = this.currentTable();
      if (!t) { FG.setStatus("Create a data table first."); return; }
      FG.analyze.open(t, this.project, (analysis) => { this.openResults(analysis.id); FG.setStatus("Analysis complete: " + analysis.name); });
    },

    // ---- AI auto-analysis --------------------------------------------------
    doAiAnalyze() {
      const t = this.currentTable();
      if (!t) { FG.setStatus("Create or import a data table first."); return; }
      FG.aiAssist.openDialog(t, this);
    },

    openResults(id) {
      const a = this.project.analyses.find((x) => x.id === id);
      if (!a) return;
      const t = this.tableById(a.tableId);
      // Re-run to stay in sync with current data (graphs & results auto-update).
      if (t) { const fresh = FG.analyze.run(a.kind, t, a.options); if (fresh) a.result = fresh; }
      this.current = { view: "results", id };
      this.showView("results");
      FG.results.render(document.getElementById("results-view"), a, t);
      this.renderNav();
    },

    // ---- Graphs ----------------------------------------------------------
    doNewGraph() {
      const t = this.currentTable();
      if (!t) { FG.setStatus("Create a data table first."); return; }
      const defaultKind = { column: "column", grouped: "grouped", xy: "xy", survival: "survival", parts: "pie", contingency: "bar", multiple: "column" }[t.type] || "column";
      const g = {
        id: M.uid("gr"), tableId: t.id, name: t.name + " — graph",
        kind: defaultKind, options: FG.plot.defaultOptions(defaultKind),
        annotations: [], stars: [],
      };
      g.options.yTitle = t.datasets.find((d) => d.role !== "X")?.title ? "Value" : "Value";
      if (t.type === "xy") { g.options.xTitle = t.xTitle || "X"; g.options.yTitle = "Y"; }
      this.project.graphs.push(g);
      this.openGraph(g.id);
      FG.setStatus("Created graph.");
    },

    openGraph(id) {
      const g = this.project.graphs.find((x) => x.id === id);
      if (!g) return;
      this.current = { view: "graph", id };
      this.showView("graph");
      this.renderGraph(g);
      this.renderNav();
    },

    renderGraph(g, light) {
      const t = this.tableById(g.tableId);
      const view = document.getElementById("graph-view");
      view.innerHTML = "";
      const bar = document.createElement("div");
      bar.className = "graph-toolbar";
      const nameInp = document.createElement("input");
      nameInp.type = "text"; nameInp.value = g.name; nameInp.style.fontWeight = "600"; nameInp.style.padding = "5px 8px"; nameInp.style.border = "1px solid var(--border)"; nameInp.style.borderRadius = "5px";
      nameInp.oninput = () => { g.name = nameInp.value; this.renderNav(); };
      bar.appendChild(nameInp);
      const snapBtn = document.createElement("button");
      const snapLabel = () => (g.options.snap !== false ? "🧲 Snap: On" : "🧲 Snap: Off");
      snapBtn.textContent = snapLabel();
      snapBtn.style.marginLeft = "8px";
      snapBtn.title = "Magnet mode: snap edges to other objects while dragging";
      snapBtn.onclick = () => { g.options.snap = g.options.snap === false; snapBtn.textContent = snapLabel(); snapBtn.classList.toggle("accent", g.options.snap !== false); };
      snapBtn.classList.toggle("accent", g.options.snap !== false);
      bar.appendChild(snapBtn);
      const hint = document.createElement("span");
      hint.style.color = "var(--muted)"; hint.style.marginLeft = "8px";
      hint.textContent = this.drawMode
        ? `Draw mode (${this.drawMode}): drag on the graph. Esc to cancel.`
        : "Click to select · Shift-click / drag-box = multi-select · drag/arrows move · Shift constrains · Ctrl+D duplicate · Ctrl+Z undo.";
      bar.appendChild(hint);

      // Display zoom — scales the panel view only; exports use the true figure size.
      const zoomBox = document.createElement("span");
      zoomBox.style.cssText = "margin-left:auto;display:flex;gap:4px;align-items:center;";
      const zoomLabel = document.createElement("span");
      zoomLabel.style.cssText = "color:var(--muted);min-width:52px;text-align:center;font-size:11.5px;";
      const mkZ = (label, fn, title) => { const b = document.createElement("button"); b.textContent = label; if (title) b.title = title; b.onclick = fn; return b; };
      let curScale = 1;
      const applyZoom = () => {
        const o = g.options;
        const z = o.zoom == null ? "fit" : o.zoom;
        let s;
        if (z === "fit") {
          const cw = canvas.clientWidth - 48, ch = canvas.clientHeight - 48;
          s = cw > 0 && ch > 0 ? Math.min(cw / o.width, ch / o.height) : 1;
          s = Math.max(0.3, Math.min(s, 3));
        } else s = +z || 1;
        curScale = s;
        frame.style.transform = `scale(${s})`;
        frame.style.transformOrigin = "top center";
        zoomLabel.textContent = Math.round(s * 100) + "%" + (z === "fit" ? " ⤢" : "");
      };
      zoomBox.appendChild(mkZ("−", () => { g.options.zoom = Math.max(0.25, Math.round(curScale * 80) / 100); applyZoom(); }, "Zoom out"));
      zoomBox.appendChild(zoomLabel);
      zoomBox.appendChild(mkZ("＋", () => { g.options.zoom = Math.min(4, Math.round(curScale * 125) / 100); applyZoom(); }, "Zoom in"));
      zoomBox.appendChild(mkZ("Fit", () => { g.options.zoom = "fit"; applyZoom(); }, "Fit the panel"));
      zoomBox.appendChild(mkZ("1:1", () => { g.options.zoom = 1; applyZoom(); }, "Actual size (100%)"));
      bar.appendChild(zoomBox);
      view.appendChild(bar);

      const canvas = document.createElement("div");
      canvas.className = "graph-canvas";
      const frame = document.createElement("div");
      frame.className = "graph-frame";
      const svg = FG.plot.render(g, t);
      frame.appendChild(svg);
      canvas.appendChild(frame);
      view.appendChild(canvas);
      applyZoom();
      this._svg = svg;

      FG.editor.paintSelection(svg);
      // drag: commit = light re-render from model; selectRefresh = rebuild inspector
      FG.editor.enableDrag(svg, g, () => this.renderGraph(g, true), () => this.refreshInspector());
      FG.editor.addResizeHandles(svg, g, () => this.renderGraph(g, true));

      if (!light) this.refreshInspector();
    },

    refreshInspector() {
      const g = this.project.graphs.find((x) => x.id === this.current.id);
      if (g && this.current.view === "graph") {
        // onChange re-renders the GRAPH only (light) so the panel stays put while editing
        FG.editor.buildInspector(document.getElementById("inspector"), g, this.tableById(g.tableId), () => this.renderGraph(g, true));
      }
    },

    // ---- Export ----------------------------------------------------------
    currentSvg() {
      if (this.current.view === "graph" && this._svg) return this._svg;
      FG.setStatus("Open a graph to export.");
      return null;
    },
    exportSvg() {
      const svg = this.currentSvg(); if (!svg) return;
      const data = new XMLSerializer().serializeToString(svg);
      const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + data], { type: "image/svg+xml" });
      this.download(blob, (this.currentGraphName() || "graph") + ".svg", "SVG image");
    },
    exportPng() {
      const svg = this.currentSvg(); if (!svg) return;
      const data = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      const scale = 3; // publication resolution
      const w = +svg.getAttribute("width"), h = +svg.getAttribute("height");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w * scale; canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => this.download(blob, (this.currentGraphName() || "graph") + ".png", "PNG image"));
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data)));
    },
    currentGraphName() { const g = this.project.graphs.find((x) => x.id === this.current.id); return g ? g.name.replace(/[^\w]+/g, "_") : null; },

    // Save a blob to disk. Uses the browser's native "Save As" dialog where
    // available (Chrome/Edge, incl. Electron) so the user picks the location
    // and filename; falls back to a plain download elsewhere (Firefox/Safari).
    async download(blob, filename, description) {
      if (window.showSaveFilePicker) {
        try {
          const ext = "." + filename.split(".").pop();
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: description || "File", accept: { [blob.type || "application/octet-stream"]: [ext] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          FG.setStatus("Saved " + handle.name);
          return;
        } catch (e) {
          if (e && e.name === "AbortError") { FG.setStatus("Save cancelled."); return; }
          // Any other failure (e.g. picker blocked in an embedded frame):
          // fall through to the classic download below.
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      FG.setStatus("Saved " + filename);
    },

    saveFile() {
      const blob = new Blob([JSON.stringify(this.project, null, 2)], { type: "application/json" });
      this.download(blob, (this.project.name || "project").replace(/[^\w]+/g, "_") + ".figulate.json", "Figulate project");
    },
    openFile() {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".json,.csv,.tsv,.txt,.xlsx,.pzfx";
      inp.onchange = () => {
        const file = inp.files[0]; if (!file) return;
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (ext === "json") {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              this.project = JSON.parse(reader.result);
              this.project.graphs = this.project.graphs || [];
              this.project.analyses = this.project.analyses || [];
              this._undo = []; this._redo = [];
              if (this.project.tables[0]) this.openTable(this.project.tables[0].id); else this.welcome();
              FG.setStatus("Opened " + file.name);
            } catch (e) { FG.setStatus("Could not open file: " + e.message); }
          };
          reader.readAsText(file);
        } else {
          // Excel / CSV / .pzfx import → new data table(s)
          FG.importer.importFile(file, this, (tables, msg) => {
            if (!tables || !tables.length) { FG.setStatus(msg || "Could not import " + file.name); return; }
            tables.forEach((t) => this.project.tables.push(t));
            this.openTable(tables[0].id);
            FG.setStatus(msg || `Imported ${tables.length} table(s) from ${file.name}`);
            // Offer AI auto-detection/analysis for the freshly imported data.
            FG.aiAssist.offerForImport(tables[0], this);
          });
        }
      };
      inp.click();
    },

    // ---- Demo data -------------------------------------------------------
    loadDemo() {
      const t = M.createTable("column", "Enzyme activity (demo)");
      t.datasets = [
        { title: "Control", sub: 1, role: "Y" },
        { title: "Drug A", sub: 1, role: "Y" },
        { title: "Drug B", sub: 1, role: "Y" },
      ];
      const cols = [
        [23.1, 25.4, 22.8, 24.9, 26.0, 23.7, 25.1, 24.2],
        [31.5, 33.2, 30.8, 34.1, 32.6, 33.9, 31.0, 32.8],
        [28.3, 27.1, 29.5, 26.8, 28.9, 27.6, 30.1, 28.0],
      ];
      t.grid = [];
      const maxLen = Math.max(...cols.map((c) => c.length));
      for (let r = 0; r < maxLen; r++) t.grid[r] = cols.map((c) => (c[r] !== undefined ? c[r] : ""));
      t.rows = maxLen + 4;
      this.project.tables.push(t);

      // XY demo
      const xy = M.createTable("xy", "Dose-response (demo)");
      xy.datasets = [{ title: "X", sub: 1, role: "X" }, { title: "Response", sub: 1, role: "Y" }];
      const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      xy.grid = xs.map((x) => [x, (2.5 * x + 4 + (x % 2 ? 1.5 : -1.2)).toFixed(2)]);
      xy.rows = xs.length + 3;
      this.project.tables.push(xy);

      this.openTable(t.id);
      // auto ANOVA + graph
      const an = { id: M.uid("an"), tableId: t.id, kind: "anova", name: "One-way ANOVA (demo)", options: { posthoc: "tukey" }, result: FG.stats.oneWayANOVA(M.columnGroups(t), { posthoc: "tukey" }) };
      this.project.analyses.push(an);
      const g = { id: M.uid("gr"), tableId: t.id, name: "Enzyme activity graph", kind: "column", options: FG.plot.defaultOptions("column"), annotations: [], stars: [] };
      g.options.title = "Enzyme activity by treatment";
      g.options.yTitle = "Activity (U/mg)";
      g.options.plotStyle = "meanSD";
      FG.editor.autoStars(g, t);
      this.project.graphs.push(g);
      this.renderNav();
      FG.setStatus("Loaded demo data: column table with ANOVA + graph, and an XY dose-response table.");
    },
  };

  FG.app = app;
  document.addEventListener("DOMContentLoaded", () => app.init());
})();
