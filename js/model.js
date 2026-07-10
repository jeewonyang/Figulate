/*
 * Figulate — project + data model.
 * A Project holds Tables (data), Analyses (results) and Graphs, shown in the
 * project navigator. Attached to window.FG.model.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = {};

  let idCounter = 1;
  const uid = (prefix) => `${prefix}_${idCounter++}_${Math.floor(performance.now())}`;
  M.uid = uid;

  // Table type definitions -------------------------------------------------
  M.TABLE_TYPES = {
    column: {
      name: "Column",
      desc: "One grouping variable. Each column is a group; rows are values.",
      defaultDatasets: 3,
      defaultSub: 1,
      xLabel: null,
    },
    grouped: {
      name: "Grouped",
      desc: "Two grouping variables. Rows = one factor, columns = another.",
      defaultDatasets: 3,
      defaultSub: 3,
      hasRowLabels: true,
    },
    xy: {
      name: "XY",
      desc: "X and Y values for correlation, regression and curves.",
      defaultDatasets: 3,
      defaultSub: 1,
      hasX: true,
    },
    contingency: {
      name: "Contingency",
      desc: "Counts in a two-way table for chi-square / Fisher's tests.",
      defaultDatasets: 2,
      defaultSub: 1,
      hasRowLabels: true,
    },
    survival: {
      name: "Survival",
      desc: "Time-to-event data for Kaplan-Meier analysis.",
      defaultDatasets: 2,
      defaultSub: 1,
      survival: true,
    },
    parts: {
      name: "Parts of whole",
      desc: "Fractional data for pie charts.",
      defaultDatasets: 1,
      defaultSub: 1,
      hasRowLabels: true,
    },
    multiple: {
      name: "Multiple variables",
      desc: "Spreadsheet-style: each column is a variable.",
      defaultDatasets: 4,
      defaultSub: 1,
    },
  };

  // Table -------------------------------------------------------------------
  M.createTable = function (type, name) {
    const def = M.TABLE_TYPES[type];
    const t = {
      id: uid("tbl"),
      name: name || def.name + " data",
      type,
      xTitle: def.hasX ? "X" : null,
      datasets: [],
      rowLabels: [],
      grid: [],
      rows: 30,
    };
    const nd = def.defaultDatasets;
    for (let i = 0; i < nd; i++) {
      t.datasets.push({
        title: def.hasX && i === 0 ? "X" : String.fromCharCode(65 + (def.hasX ? i - 1 : i)),
        sub: def.hasX && i === 0 ? 1 : def.defaultSub,
        role: def.hasX && i === 0 ? "X" : "Y",
      });
    }
    if (def.hasX) t.datasets[0].title = "X";
    return t;
  };

  // Convert a table to another type in place, keeping the flat grid data.
  // XY needs dataset 0 to be an X column; other types treat every dataset as Y.
  M.convertTable = function (table, newType) {
    if (newType === table.type || !M.TABLE_TYPES[newType]) return;
    const def = M.TABLE_TYPES[newType];
    const wantX = !!def.hasX;
    const hadX = table.datasets[0] && table.datasets[0].role === "X";
    if (wantX && !hadX) {
      // Split a multi-replicate first dataset so the flat layout is unchanged,
      // then claim the first flat column as X.
      const d0 = table.datasets[0];
      if (d0 && d0.sub > 1) {
        const parts = [];
        for (let s = 0; s < d0.sub; s++) parts.push({ title: s === 0 ? d0.title : d0.title + "·" + (s + 1), sub: 1, role: "Y" });
        table.datasets.splice(0, 1, ...parts);
      }
      if (table.datasets[0]) { table.datasets[0].role = "X"; table.datasets[0].title = "X"; }
      else table.datasets.push({ title: "X", sub: 1, role: "X" });
    } else if (!wantX && hadX) {
      table.datasets[0].role = "Y";
      if (table.datasets[0].title === "X") table.datasets[0].title = M.nextDatasetTitle(table);
    }
    table.type = newType;
    table.xTitle = wantX ? (table.xTitle || "X") : null;
    table.rowLabels = table.rowLabels || [];
  };

  // Flatten datasets to grid column layout.
  M.columnLayout = function (table) {
    const cols = [];
    table.datasets.forEach((ds, di) => {
      for (let s = 0; s < ds.sub; s++) {
        cols.push({ datasetIndex: di, subIndex: s, dataset: ds });
      }
    });
    return cols;
  };

  // Auto-generate a fresh dataset title (A, B, C … then Group N).
  M.nextDatasetTitle = function (table) {
    const used = table.datasets.map((d) => d.title);
    for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.includes(c)) return c; }
    return "Group " + (table.datasets.length + 1);
  };

  // Grow the table so the flat layout has at least `needed` columns, adding Y
  // datasets that inherit the current replicate (subcolumn) count. Returns the
  // new flat-column count.
  M.ensureColumns = function (table, needed) {
    const def = M.TABLE_TYPES[table.type];
    const yds = table.datasets.filter((d) => d.role !== "X");
    const sub = yds.length ? yds[yds.length - 1].sub : (def.defaultSub || 1);
    let guard = 0;
    while (M.columnLayout(table).length < needed && guard++ < 500) {
      table.datasets.push({ title: M.nextDatasetTitle(table), sub, role: "Y" });
    }
    return M.columnLayout(table).length;
  };

  M.getCell = function (table, row, flatCol) {
    return table.grid[row] && table.grid[row][flatCol] !== undefined ? table.grid[row][flatCol] : "";
  };
  M.setCell = function (table, row, flatCol, value) {
    if (!table.grid[row]) table.grid[row] = [];
    table.grid[row][flatCol] = value;
  };

  // Extract values for a dataset (pool all subcolumns/rows), skipping X for XY.
  M.datasetValues = function (table, datasetIndex) {
    const layout = M.columnLayout(table);
    const vals = [];
    layout.forEach((col, flatCol) => {
      if (col.datasetIndex !== datasetIndex) return;
      table.grid.forEach((r) => {
        if (r && r[flatCol] !== undefined && r[flatCol] !== "") vals.push(Number(r[flatCol]));
      });
    });
    return vals.filter((v) => !isNaN(v));
  };

  // For Column tables: list of {name, values}
  M.columnGroups = function (table) {
    return table.datasets.map((ds, i) => ({ name: ds.title, values: M.datasetValues(table, i) }));
  };

  // For XY: {x:[], series:[{title, y:[]}]}
  M.xySeries = function (table) {
    const layout = M.columnLayout(table);
    const xCol = layout.findIndex((c) => c.datasetIndex === 0);
    const x = [];
    table.grid.forEach((r) => x.push(r && r[xCol] !== undefined ? r[xCol] : ""));
    const series = [];
    table.datasets.forEach((ds, di) => {
      if (di === 0) return;
      // average subcolumns per row for the Y value, but keep replicates for scatter
      const y = [];
      const yRep = [];
      const cols = layout.map((c, idx) => (c.datasetIndex === di ? idx : -1)).filter((i) => i >= 0);
      table.grid.forEach((r) => {
        const reps = cols.map((ci) => (r && r[ci] !== "" && r[ci] !== undefined ? Number(r[ci]) : null)).filter((v) => v !== null && !isNaN(v));
        yRep.push(reps);
        y.push(reps.length ? reps.reduce((s, v) => s + v, 0) / reps.length : null);
      });
      series.push({ title: ds.title, y, yRep });
    });
    return { x, series };
  };

  // For Grouped: cells[row][dataset] = replicate array
  M.groupedCells = function (table) {
    const layout = M.columnLayout(table);
    const R = table.rowLabels.length || table.grid.filter((r) => r && r.some((c) => c !== "" && c !== undefined)).length;
    const rows = [];
    const maxRow = Math.max(R, table.grid.length);
    const data = [];
    for (let r = 0; r < maxRow; r++) {
      data[r] = [];
      table.datasets.forEach((ds, di) => {
        const cols = layout.map((c, idx) => (c.datasetIndex === di ? idx : -1)).filter((i) => i >= 0);
        const reps = cols
          .map((ci) => (table.grid[r] && table.grid[r][ci] !== "" && table.grid[r][ci] !== undefined ? Number(table.grid[r][ci]) : null))
          .filter((v) => v !== null && !isNaN(v));
        data[r][di] = reps;
      });
    }
    // drop empty rows and empty columns (datasets with no data anywhere)
    const keepRows = [];
    for (let r = 0; r < data.length; r++) if (data[r].some((c) => c.length)) keepRows.push(r);
    const keepCols = [];
    table.datasets.forEach((_, di) => { if (keepRows.some((r) => data[r][di] && data[r][di].length)) keepCols.push(di); });
    return {
      rowFactors: keepRows.map((r) => table.rowLabels[r] || `Row ${r + 1}`),
      colFactors: keepCols.map((di) => table.datasets[di].title),
      colIndices: keepCols,
      data: keepRows.map((r) => keepCols.map((di) => data[r][di])),
    };
  };

  // For contingency: integer matrix
  M.contingencyMatrix = function (table) {
    const layout = M.columnLayout(table);
    const cols = layout.map((c) => c.datasetIndex);
    const matrix = [];
    table.grid.forEach((r, ri) => {
      if (!r) return;
      const rowVals = table.datasets.map((_, di) => {
        const ci = layout.findIndex((c) => c.datasetIndex === di);
        return r[ci] !== "" && r[ci] !== undefined ? Number(r[ci]) : null;
      });
      if (rowVals.every((v) => v !== null && !isNaN(v))) matrix.push(rowVals);
    });
    return matrix;
  };

  // For survival: [{name, subjects:[{time,event}]}]  — layout: X=time col per dataset pair
  // Simpler survival layout: dataset 0 = time, then one Y column per group with 1/0 codes.
  M.survivalGroups = function (table) {
    const layout = M.columnLayout(table);
    const timeCol = 0;
    const groups = [];
    table.datasets.forEach((ds, di) => {
      if (di === 0) return;
      const ci = layout.findIndex((c) => c.datasetIndex === di);
      const subjects = [];
      table.grid.forEach((r) => {
        if (!r) return;
        const t = r[timeCol];
        const e = r[ci];
        if (t !== "" && t !== undefined && e !== "" && e !== undefined && !isNaN(t))
          subjects.push({ time: Number(t), event: Number(e) });
      });
      if (subjects.length) groups.push({ name: ds.title, subjects });
    });
    return groups;
  };

  // Project -----------------------------------------------------------------
  M.createProject = function () {
    return {
      id: uid("proj"),
      name: "Untitled Project",
      tables: [],
      analyses: [],
      graphs: [],
      version: 1,
    };
  };

  FG.model = M;
})();
