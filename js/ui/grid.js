/*
 * Figulate — data grid (spreadsheet) renderer/editor. window.FG.grid
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;

  FG.grid = {
    render(container, table, onChange) {
      container.innerHTML = "";
      const def = M.TABLE_TYPES[table.type];

      // Header row
      const header = document.createElement("div");
      header.className = "sheet-header";
      const title = document.createElement("input");
      title.className = "sheet-title";
      title.value = table.name;
      title.addEventListener("input", () => { table.name = title.value; onChange({ nav: true }); });
      header.appendChild(title);
      // Table type is changeable after creation (e.g. imports guess wrong).
      const typeSel = document.createElement("select");
      typeSel.className = "badge";
      typeSel.title = "Change table type — data is kept; XY claims the first column as X.";
      Object.entries(M.TABLE_TYPES).forEach(([key, d]) => {
        const o = document.createElement("option");
        o.value = key; o.textContent = d.name + " table";
        typeSel.appendChild(o);
      });
      typeSel.value = table.type;
      typeSel.onchange = () => {
        M.convertTable(table, typeSel.value);
        FG.setStatus(`Table type changed to ${M.TABLE_TYPES[table.type].name}.`);
        onChange({ full: true, nav: true, deps: true });
      };
      header.appendChild(typeSel);

      // controls
      const mk = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; return b; };
      header.appendChild(mk("＋ Column", () => {
        table.datasets.push({ title: nextTitle(table), sub: def.hasX ? def.defaultSub : table.datasets[table.datasets.length - 1]?.sub || 1, role: "Y" });
        onChange({ full: true });
      }));
      header.appendChild(mk("＋ Row", () => { table.rows += 5; onChange({ full: true }); }));
      if (def.defaultSub > 1 || table.type === "grouped" || table.type === "xy") {
        header.appendChild(mk("Replicates…", () => {
          const n = prompt("Subcolumns (replicates) per group:", table.datasets.find((d) => d.role === "Y")?.sub || 1);
          if (n && !isNaN(n)) { table.datasets.forEach((d) => { if (d.role !== "X") d.sub = Math.max(1, parseInt(n)); }); onChange({ full: true }); }
        }));
      }
      container.appendChild(header);

      const hint = document.createElement("div");
      hint.style.cssText = "color:var(--muted);font-size:11px;margin:-4px 0 8px;";
      hint.textContent = "Paste from Excel with Ctrl+V (auto-expands columns; a leading header row becomes the column titles). Ctrl+Shift+V pastes transposed. Drag to select (row labels and column titles included); Ctrl+C copies; Delete clears; Enter moves down.";
      container.appendChild(hint);

      // Grid
      const wrap = document.createElement("div");
      wrap.className = "grid-wrap";
      const tbl = document.createElement("table");
      tbl.className = "grid";
      const layout = M.columnLayout(table);
      const hasSub = table.datasets.some((d) => d.sub > 1);
      const hasRowLabels = def.hasRowLabels;

      // thead
      const thead = document.createElement("thead");
      const tr1 = document.createElement("tr");
      const corner = document.createElement("th");
      corner.textContent = table.type === "survival" ? "" : "";
      tr1.appendChild(corner);
      if (hasRowLabels) { const th = document.createElement("th"); th.textContent = "Label"; tr1.appendChild(th); }
      let flatStart = 0;
      table.datasets.forEach((ds, di) => {
        const th = document.createElement("th");
        th.className = "ds-head";
        th.colSpan = ds.sub;
        const inp = document.createElement("input");
        inp.value = ds.title;
        // Titles live at row −1 of the selection grid so they can be
        // drag-selected and copied together with the data.
        inp.dataset.r = -1;
        inp.dataset.c = flatStart;
        inp.addEventListener("input", () => { ds.title = inp.value; onChange({ nav: false, deps: true }); });
        inp.addEventListener("keydown", (e) => this.nav(e, tbl, -1, +inp.dataset.c));
        inp.addEventListener("paste", (e) => this.pasteTitles(e, table, di, onChange));
        th.appendChild(inp);
        tr1.appendChild(th);
        flatStart += ds.sub;
      });
      thead.appendChild(tr1);
      if (hasSub) {
        const tr2 = document.createElement("tr");
        const c0 = document.createElement("th"); tr2.appendChild(c0);
        if (hasRowLabels) tr2.appendChild(document.createElement("th"));
        layout.forEach((col) => {
          const th = document.createElement("th");
          th.textContent = col.dataset.sub > 1 ? "Y" + (col.subIndex + 1) : "";
          tr2.appendChild(th);
        });
        thead.appendChild(tr2);
      }
      tbl.appendChild(thead);

      // tbody
      const tbody = document.createElement("tbody");
      const nRows = Math.max(table.rows, table.grid.length);
      for (let r = 0; r < nRows; r++) {
        const tr = document.createElement("tr");
        const rh = document.createElement("td");
        rh.className = "rowhdr";
        rh.textContent = r + 1;
        tr.appendChild(rh);
        if (hasRowLabels) {
          const td = document.createElement("td");
          td.className = "rowlabel";
          const inp = document.createElement("input");
          inp.value = table.rowLabels[r] || "";
          inp.placeholder = "Row " + (r + 1);
          // Labels are column −1 of the selection grid: drag-select, copy,
          // delete and Enter/arrow navigation all work like data cells.
          inp.dataset.r = r;
          inp.dataset.c = -1;
          inp.addEventListener("input", () => { table.rowLabels[r] = inp.value; onChange({ deps: true }); });
          inp.addEventListener("keydown", (e) => this.nav(e, tbl, r, -1));
          inp.addEventListener("paste", (e) => this.pasteLabels(e, table, r, onChange));
          td.appendChild(inp);
          tr.appendChild(td);
        }
        layout.forEach((col, flatCol) => {
          const td = document.createElement("td");
          const inp = document.createElement("input");
          inp.value = M.getCell(table, r, flatCol);
          inp.dataset.r = r;
          inp.dataset.c = flatCol;
          inp.addEventListener("input", () => { M.setCell(table, r, flatCol, inp.value); onChange({ deps: true }); });
          inp.addEventListener("keydown", (e) => this.nav(e, tbl, r, flatCol));
          inp.addEventListener("paste", (e) => this.paste(e, table, r, flatCol, layout.length, onChange));
          td.appendChild(inp);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      container.appendChild(wrap);
      this.setupSelection(tbl, table, onChange);

      // survival helper hint
      if (table.type === "survival") {
        const hint = document.createElement("div");
        hint.className = "callout";
        hint.style.maxWidth = "700px"; hint.style.marginTop = "10px";
        hint.innerHTML = "<b>Survival layout:</b> column 1 = time (X). Each following column is a group; enter <b>1</b> for an event (death) or <b>0</b> for censored at that time.";
        container.appendChild(hint);
      }
    },

    // Drag to select a rectangular block of cells; Ctrl/Cmd+C copies it as TSV
    // (so it pastes cleanly into Excel/Sheets). Single click still edits a cell.
    setupSelection(tbl, table, onChange) {
      const self = this;
      const sel = (this._sel = { tbl, table, onChange, r0: -1, c0: -1, r1: -1, c1: -1, active: false });
      let anchor = null, selecting = false;

      const cellFrom = (t) => { const cell = t && t.closest && t.closest("td, th"); const inp = cell && cell.querySelector("input[data-r]"); return inp ? { r: +inp.dataset.r, c: +inp.dataset.c } : null; };
      const clear = () => tbl.querySelectorAll(".cell-sel").forEach((td) => td.classList.remove("cell-sel"));
      const paint = () => {
        clear();
        const ra = Math.min(sel.r0, sel.r1), rb = Math.max(sel.r0, sel.r1);
        const ca = Math.min(sel.c0, sel.c1), cb = Math.max(sel.c0, sel.c1);
        tbl.querySelectorAll("input[data-r]").forEach((inp) => {
          const r = +inp.dataset.r, c = +inp.dataset.c;
          if (r >= ra && r <= rb && c >= ca && c <= cb) inp.closest("td, th").classList.add("cell-sel");
        });
      };

      tbl.addEventListener("mousedown", (e) => {
        const cell = cellFrom(e.target);
        if (!cell) return;
        anchor = cell; selecting = false;
        sel.r0 = sel.r1 = cell.r; sel.c0 = sel.c1 = cell.c; sel.active = false;
        clear();
      });
      tbl.addEventListener("mousemove", (e) => {
        if (!anchor || e.buttons !== 1) return;
        const cell = cellFrom(e.target);
        if (!cell) return;
        if (cell.r !== anchor.r || cell.c !== anchor.c || selecting) {
          if (!selecting) { selecting = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
          e.preventDefault();
          sel.r1 = cell.r; sel.c1 = cell.c; sel.active = true;
          paint();
        }
      });
      const finish = () => { anchor = null; };
      tbl.addEventListener("mouseup", finish);

      // Bind copy + global mouseup once for the whole app.
      if (!this._globalBound) {
        this._globalBound = true;
        // Track Shift so Ctrl+Shift+V (paste with Shift held) transposes the block.
        window.addEventListener("keydown", (e) => { if (e.key === "Shift") self._shift = true; });
        window.addEventListener("keyup", (e) => { if (e.key === "Shift") self._shift = false; });
        window.addEventListener("blur", () => { self._shift = false; });
        window.addEventListener("mouseup", () => { /* selection persists until next click */ });
        // Value of any selection cell: row −1 = dataset titles, col −1 = labels.
        const cellValue = (table, r, c) => {
          if (r === -1) {
            if (c === -1) return "";
            const col = M.columnLayout(table)[c];
            return col && col.subIndex === 0 ? col.dataset.title : "";
          }
          if (c === -1) return table.rowLabels[r] || "";
          return M.getCell(table, r, c);
        };
        document.addEventListener("copy", (e) => {
          const s = self._sel;
          if (!s || !s.active) return;
          const ra = Math.min(s.r0, s.r1), rb = Math.max(s.r0, s.r1);
          const ca = Math.min(s.c0, s.c1), cb = Math.max(s.c0, s.c1);
          const rows = [];
          for (let r = ra; r <= rb; r++) {
            const cells = [];
            for (let c = ca; c <= cb; c++) cells.push(cellValue(s.table, r, c));
            rows.push(cells.join("\t"));
          }
          e.clipboardData.setData("text/plain", rows.join("\n"));
          e.preventDefault();
          FG.setStatus(`Copied ${rb - ra + 1} × ${cb - ca + 1} cells.`);
        });
        // Delete/Backspace clears the contents of the selected cell block
        // (data cells and row labels; dataset titles are left alone).
        document.addEventListener("keydown", (e) => {
          const s = self._sel;
          if (!s || !s.active) return;
          if (FG.app.current.view !== "sheet") return;
          if (e.key !== "Delete" && e.key !== "Backspace") return;
          const tag = document.activeElement && document.activeElement.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return; // editing a cell, not the block
          e.preventDefault();
          const ra = Math.max(0, Math.min(s.r0, s.r1)), rb = Math.max(s.r0, s.r1);
          const ca = Math.min(s.c0, s.c1), cb = Math.max(s.c0, s.c1);
          for (let r = ra; r <= rb; r++) for (let c = Math.max(0, ca); c <= cb; c++) M.setCell(s.table, r, c, "");
          if (ca === -1) for (let r = ra; r <= rb; r++) s.table.rowLabels[r] = "";
          s.tbl.querySelectorAll("input[data-r]").forEach((inp) => {
            const r = +inp.dataset.r, c = +inp.dataset.c;
            if (r >= ra && r <= rb && c >= ca && c <= cb) inp.value = "";
          });
          if (s.onChange) s.onChange({ deps: true });
          FG.setStatus(`Cleared ${rb - ra + 1} × ${cb - ca + 1} cells.`);
        });
      }
    },

    // Paste a block copied from Excel/Sheets (tab-separated columns, newline rows).
    paste(e, table, startRow, startCol, nCols, onChange) {
      const cb = e.clipboardData || window.clipboardData;
      const textRaw = cb ? cb.getData("text") : "";
      // A single value with no delimiters pastes normally into one cell.
      if (!textRaw || (!textRaw.includes("\t") && !/[\r\n]/.test(textRaw.trim()))) return;
      e.preventDefault();
      let block = textRaw.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
      // Shift held (Ctrl+Shift+V) → transpose the pasted block (rows ↔ columns).
      const transpose = !!this._shift;
      if (transpose) {
        const R = block.length, C = Math.max(...block.map((r) => r.length));
        const T = [];
        for (let c = 0; c < C; c++) { T[c] = []; for (let r = 0; r < R; r++) T[c][r] = block[r][c] !== undefined ? block[r][c] : ""; }
        block = T;
      }
      // A block pasted at row 1 whose first line is all text while later lines
      // hold numbers was copied with its header row — route the header into the
      // column titles instead of the data cells.
      let titleRow = null;
      const isNum = (v) => (v || "").trim() !== "" && isFinite(Number(v));
      if (startRow === 0 && block.length > 1) {
        const first = block[0];
        const headerish = first.some((v) => (v || "").trim() !== "") && !first.some(isNum)
          && block.slice(1).some((row) => row.some(isNum));
        if (headerish) { titleRow = first; block = block.slice(1); }
      }
      // Grow the table to fit the widest row (adds groups/replicates as needed).
      const widest = Math.max(...block.map((l) => l.length), titleRow ? titleRow.length : 0);
      M.ensureColumns(table, startCol + widest);
      if (titleRow) {
        const layout = M.columnLayout(table);
        titleRow.forEach((tt, ci) => {
          const col = layout[startCol + ci];
          if (col && col.subIndex === 0 && (tt || "").trim()) col.dataset.title = tt.trim();
        });
      }
      let maxRow = startRow;
      block.forEach((cells, ri) => {
        cells.forEach((val, ci) => {
          const rr = startRow + ri;
          M.setCell(table, rr, startCol + ci, (val || "").trim());
          maxRow = Math.max(maxRow, rr);
        });
      });
      if (maxRow + 1 > table.rows) table.rows = maxRow + 3;
      FG.setStatus(`Pasted${transpose ? " (transposed)" : ""} ${block.length} row(s) × ${widest} column(s)${titleRow ? " + column titles" : ""}.`);
      onChange({ full: true });
    },

    // Paste a column of text into the row-label column (one label per line).
    // If the clipboard has multiple columns, the first column becomes labels and
    // the rest spill into the data cells starting at the same row.
    pasteLabels(e, table, startRow, onChange) {
      const cb = e.clipboardData || window.clipboardData;
      const textRaw = cb ? cb.getData("text") : "";
      if (!textRaw || (!textRaw.includes("\t") && !/[\r\n]/.test(textRaw.trim()))) return;
      e.preventDefault();
      const lines = textRaw.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
      const widest = Math.max(...lines.map((l) => l.split("\t").length));
      M.ensureColumns(table, widest - 1); // first column is the label
      let maxRow = startRow;
      lines.forEach((line, ri) => {
        const cells = line.split("\t");
        const rr = startRow + ri;
        table.rowLabels[rr] = (cells[0] || "").trim();
        for (let ci = 1; ci < cells.length; ci++) M.setCell(table, rr, ci - 1, cells[ci].trim());
        maxRow = rr;
      });
      if (maxRow + 1 > table.rows) table.rows = maxRow + 3;
      FG.setStatus(`Pasted ${lines.length} row label(s).`);
      onChange({ full: true });
    },

    // Keyboard navigation across data cells, row labels (c = −1) and the
    // dataset-title row (r = −1, one input per dataset at its first flat col).
    nav(e, tbl, r, c) {
      const q = (rr, cc) => tbl.querySelector(`input[data-r="${rr}"][data-c="${cc}"]`);
      const titles = () => Array.from(tbl.querySelectorAll('input[data-r="-1"]'));
      let target = null;
      if (e.key === "Enter" || e.key === "ArrowDown") target = q(r + 1, c);
      else if (e.key === "ArrowUp") {
        target = q(r - 1, c);
        if (!target && r === 0 && c >= 0) target = titles().filter((t) => +t.dataset.c <= c).pop();
      } else if (e.key === "ArrowRight" && e.target.selectionStart === e.target.value.length) {
        target = r === -1 ? titles().find((t) => +t.dataset.c > c) : q(r, c + 1);
      } else if (e.key === "ArrowLeft" && e.target.selectionStart === 0) {
        target = r === -1 ? titles().filter((t) => +t.dataset.c < c).pop() : q(r, c - 1);
      }
      if (target) { e.preventDefault(); target.focus(); target.select(); }
    },

    // Paste into a column-title cell. The first clipboard line becomes titles
    // (one per flat column, applied to each dataset's first subcolumn), and any
    // lines below it — a block copied WITH its header row — flow into the data
    // cells starting at row 1, aligned to the same columns.
    pasteTitles(e, table, startDi, onChange) {
      const cb = e.clipboardData || window.clipboardData;
      const textRaw = cb ? cb.getData("text") : "";
      if (!textRaw || (!textRaw.includes("\t") && !/[\r\n]/.test(textRaw.trim()))) return;
      e.preventDefault();
      const rows = textRaw.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
      const header = rows[0];
      const flatStart = table.datasets.slice(0, startDi).reduce((n, d) => n + (d.sub || 1), 0);
      const widest = Math.max(...rows.map((r) => r.length));
      M.ensureColumns(table, flatStart + widest);
      const layout = M.columnLayout(table);
      header.forEach((tt, ci) => {
        const col = layout[flatStart + ci];
        if (col && col.subIndex === 0 && (tt || "").trim()) col.dataset.title = tt.trim();
      });
      rows.slice(1).forEach((cells, ri) => {
        cells.forEach((val, ci) => M.setCell(table, ri, flatStart + ci, (val || "").trim()));
      });
      if (rows.length - 1 > table.rows - 2) table.rows = rows.length + 2;
      FG.setStatus(rows.length > 1
        ? `Pasted ${header.length} column title(s) + ${rows.length - 1} data row(s).`
        : `Pasted ${header.length} column title(s).`);
      onChange({ full: true, deps: true });
    },
  };

  function nextTitle(table) {
    const used = table.datasets.map((d) => d.title);
    for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.includes(c)) return c; }
    return "Group " + (table.datasets.length + 1);
  }
})();
