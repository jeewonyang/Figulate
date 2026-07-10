/*
 * Figulate — file importer. Opens CSV/TSV, Excel (.xlsx) and .pzfx (XML)
 * files and turns them into data tables. window.FG.importer
 *
 * .xlsx is a ZIP of XML; we read it using the browser's built-in
 * DecompressionStream (no external libraries). .pzfx is plain XML.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;

  const isNum = (v) => v !== "" && v != null && !isNaN(v);

  // ---- Build a Column table from a 2D array of string cells --------------
  function tableFromGrid(name, rows) {
    rows = (rows || []).filter((r) => r && r.some((c) => String(c == null ? "" : c).trim() !== ""));
    if (!rows.length) return null;
    const ncol = Math.max(...rows.map((r) => r.length));
    // Treat row 0 as a header when it's mostly text and later rows have numbers.
    const firstText = rows[0].filter((c) => c !== "" && c != null && !isNum(c)).length;
    const laterNumeric = rows.slice(1).some((r) => r.some((c) => isNum(c)));
    const header = rows.length > 1 && firstText >= Math.ceil(ncol / 2) && laterNumeric;
    const titles = [];
    for (let c = 0; c < ncol; c++) titles.push(header ? (String(rows[0][c] || "").trim() || col(c)) : col(c));
    const dataRows = header ? rows.slice(1) : rows;
    const t = M.createTable("column", name || "Imported data");
    t.datasets = titles.map((ti) => ({ title: ti, sub: 1, role: "Y" }));
    t.grid = dataRows.map((r) => { const row = []; for (let c = 0; c < ncol; c++) row[c] = r[c] != null ? String(r[c]).trim() : ""; return row; });
    t.rows = Math.max(dataRows.length + 3, 12);
    return t;
  }
  function col(i) { return i < 26 ? String.fromCharCode(65 + i) : "Col " + (i + 1); }

  // ---- Delimited text (CSV / TSV) ----------------------------------------
  function parseDelimited(text) {
    text = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
    const delim = text.indexOf("\t") >= 0 ? "\t" : ",";
    return text.split("\n").map((line) => (delim === "," ? parseCsvLine(line) : line.split(delim)));
  }
  function parseCsvLine(line) {
    const out = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  // ---- XLSX (ZIP + raw-DEFLATE via DecompressionStream) ------------------
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function unzip(buf, wanted) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a zip");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (wanted.includes(name)) {
        const lNameLen = dv.getUint16(localOff + 26, true);
        const lExtraLen = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const comp = u8.subarray(start, start + compSize);
        out[name] = method === 0 ? comp : await inflateRaw(comp);
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }
  function colIndex(ref) { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }
  async function parseXlsx(buf) {
    const dec = new TextDecoder();
    const files = await unzip(buf, ["xl/worksheets/sheet1.xml", "xl/sharedStrings.xml"]);
    if (!files["xl/worksheets/sheet1.xml"]) throw new Error("no worksheet");
    const shared = files["xl/sharedStrings.xml"]
      ? [...new DOMParser().parseFromString(dec.decode(files["xl/sharedStrings.xml"]), "application/xml").getElementsByTagName("si")]
          .map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent).join(""))
      : [];
    const doc = new DOMParser().parseFromString(dec.decode(files["xl/worksheets/sheet1.xml"]), "application/xml");
    const grid = [];
    [...doc.getElementsByTagName("row")].forEach((rowEl) => {
      const r = parseInt(rowEl.getAttribute("r")) - 1;
      const row = [];
      [...rowEl.getElementsByTagName("c")].forEach((c) => {
        const ci = colIndex(c.getAttribute("r"));
        const t = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0];
        let val = "";
        if (t === "s") val = v ? (shared[parseInt(v.textContent)] || "") : "";
        else if (t === "inlineStr") { const is = c.getElementsByTagName("t")[0]; val = is ? is.textContent : ""; }
        else val = v ? v.textContent : "";
        row[ci] = val;
      });
      grid[r] = row;
    });
    return grid.map((r) => (r ? Array.from(r, (v) => (v === undefined ? "" : v)) : []));
  }

  // ---- .pzfx (XML) --------------------------------------------------------
  function subcolData(colEl) {
    return [...colEl.getElementsByTagName("Subcolumn")].map((s) => [...s.getElementsByTagName("d")].map((d) => d.textContent.trim()));
  }
  function parsePzfx(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("not a valid .pzfx XML file");
    const out = [];
    [...doc.getElementsByTagName("Table")].forEach((tEl) => {
      const titleEl = tEl.getElementsByTagName("Title")[0];
      const title = (titleEl ? titleEl.textContent : "Imported table").trim() || "Imported table";
      const kids = [...tEl.children];
      const xcols = kids.filter((c) => c.tagName === "XColumn" || c.tagName === "XAdvancedColumn");
      const ycols = kids.filter((c) => c.tagName === "YColumn");
      const rowTitles = kids.filter((c) => c.tagName === "RowTitlesColumn");
      if (!ycols.length) return;
      const hasX = xcols.length > 0;
      const t = M.createTable(hasX ? "xy" : "column", title);
      t.datasets = [];
      const flat = [];
      if (hasX) { t.datasets.push({ title: "X", sub: 1, role: "X" }); const xd = subcolData(xcols[0]); flat.push(xd[0] || []); }
      ycols.forEach((yc, i) => {
        const subs = subcolData(yc);
        const nSub = Math.max(1, subs.length);
        const ct = yc.getElementsByTagName("Title")[0];
        t.datasets.push({ title: (ct ? ct.textContent.trim() : "") || (hasX ? "Y" + (i + 1) : col(i)), sub: nSub, role: "Y" });
        (subs.length ? subs : [[]]).forEach((s) => flat.push(s));
      });
      const maxLen = Math.max(0, ...flat.map((a) => a.length));
      t.grid = [];
      for (let r = 0; r < maxLen; r++) t.grid[r] = flat.map((cvals) => (cvals[r] !== undefined ? cvals[r] : ""));
      t.rows = maxLen + 3;
      if (rowTitles.length) { const rt = subcolData(rowTitles[0])[0] || []; t.rowLabels = rt; }
      out.push(t);
    });
    return out;
  }

  // ---- Entry point -------------------------------------------------------
  FG.importer = {
    importFile(file, app, done) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const base = file.name.replace(/\.[^.]+$/, "");
      const reader = new FileReader();
      if (ext === "xlsx") {
        if (typeof DecompressionStream === "undefined") { done(null, "This browser can't read .xlsx here — save it as CSV and open that."); return; }
        reader.onload = async () => {
          try { const t = tableFromGrid(base, await parseXlsx(reader.result)); done(t ? [t] : null, t ? `Imported ${file.name}` : "No data found in the first sheet."); }
          catch (e) { done(null, "Could not read .xlsx (" + e.message + "). Try saving it as CSV."); }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === "pzfx") {
        reader.onload = () => {
          try { const tables = parsePzfx(reader.result); done(tables.length ? tables : null, tables.length ? `Imported ${tables.length} table(s) from ${file.name}` : "No data tables found in this .pzfx file."); }
          catch (e) { done(null, "Could not read .pzfx file: " + e.message); }
        };
        reader.readAsText(file);
      } else {
        reader.onload = () => { const t = tableFromGrid(base, parseDelimited(reader.result)); done(t ? [t] : null, t ? `Imported ${file.name}` : "The file appears to be empty."); };
        reader.readAsText(file);
      }
    },
    // exposed for testing
    _tableFromGrid: tableFromGrid, _parseDelimited: parseDelimited, _parsePzfx: parsePzfx,
  };
})();
