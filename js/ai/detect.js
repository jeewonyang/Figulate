/*
 * Figulate — local (offline) dataframe inspector. window.FG.detect
 *
 * Pure heuristics, no network: classifies each column of an imported grid
 * (numeric / integer / binary / categorical / empty), guesses the best
 * table type, and proposes a default analysis + graph. Used as the fallback
 * when no AI provider is configured, and to give the AI a hint. Kept free of
 * DOM access so the Node test suite can verify it.
 */
(function () {
  const FG = (window.FG = window.FG || {});

  const isNum = (v) => v !== "" && v != null && !isNaN(v);

  // Classify one column of raw (string) cell values.
  function classifyColumn(values) {
    const filled = (values || []).map((v) => String(v == null ? "" : v).trim()).filter((v) => v !== "");
    if (!filled.length) return "empty";
    const nums = filled.filter(isNum).map(Number);
    if (nums.length / filled.length >= 0.9) {
      if (filled.length >= 2 && nums.every((n) => n === 0 || n === 1)) return "binary";
      if (nums.every((n) => Number.isInteger(n))) return "integer";
      return "numeric";
    }
    return "categorical";
  }

  const NUMERIC_TYPES = ["numeric", "integer", "binary"];
  const numericish = (t) => NUMERIC_TYPES.includes(t);

  // Fraction of unique values and whether the column never decreases —
  // signals of an X (independent variable) column.
  function xLikeness(values) {
    const nums = (values || []).filter(isNum).map(Number);
    if (nums.length < 3) return { unique: 0, monotonic: false };
    const uniq = new Set(nums).size / nums.length;
    let mono = true;
    for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) { mono = false; break; }
    return { unique: uniq, monotonic: mono };
  }

  /*
   * Suggest a table type for a set of columns.
   * columns: [{ title, values }] (values are raw cell strings, per column)
   * opts: { rowLabels: [...] } optional
   * Returns { tableType, columns: [{index, title, dtype, role}], reason }
   */
  function suggestTableType(columns, opts) {
    opts = opts || {};
    const types = columns.map((c) => classifyColumn(c.values));
    const cols = columns.map((c, i) => ({ index: i, title: c.title, dtype: types[i], role: "Y" }));
    const nonEmpty = cols.filter((c) => c.dtype !== "empty");
    const done = (tableType, reason) => ({ tableType, columns: cols, reason });

    if (!nonEmpty.length) return done("column", "No data found.");

    // Survival: first numeric column (time) + only 0/1 event columns after it.
    if (nonEmpty.length >= 2 && numericish(types[0]) && types[0] !== "binary" &&
        nonEmpty.slice(1).every((c) => c.dtype === "binary")) {
      cols[0].role = "time";
      nonEmpty.slice(1).forEach((c) => (c.role = "event"));
      return done("survival", "A time column followed by 0/1 event columns suggests time-to-event data.");
    }

    // XY: first column numeric, mostly unique / non-decreasing, rest numeric.
    if (nonEmpty.length >= 2 && numericish(types[0]) && nonEmpty.slice(1).every((c) => numericish(c.dtype))) {
      const x = xLikeness(columns[0].values);
      if (x.monotonic && x.unique >= 0.8) {
        cols[0].role = "X";
        return done("xy", "The first column looks like an ordered X variable with numeric Y columns.");
      }
    }

    // Contingency: small all-integer count matrix with row labels.
    if (opts.rowLabels && opts.rowLabels.filter((l) => l).length >= 2 &&
        nonEmpty.length >= 2 && nonEmpty.length <= 6 &&
        nonEmpty.every((c) => c.dtype === "integer" || c.dtype === "binary")) {
      return done("contingency", "A small labelled table of integer counts suggests a contingency table.");
    }

    // Mixed numeric + categorical → spreadsheet-style multiple variables.
    if (nonEmpty.some((c) => c.dtype === "categorical") && nonEmpty.some((c) => numericish(c.dtype))) {
      return done("multiple", "Columns mix categories and numbers, like a spreadsheet of variables.");
    }

    // Default: each numeric column is a group.
    return done("column", "Each numeric column looks like one group of measurements.");
  }

  // Propose a default analysis + graph for a table type.
  // nGroups = number of Y datasets with data.
  function suggestPlan(tableType, nGroups) {
    if (tableType === "xy") return { analyses: [{ kind: "linreg", options: { colY: 1 } }], graph: { kind: "xy", showRegression: true } };
    if (tableType === "survival") return { analyses: [{ kind: "km", options: {} }], graph: { kind: "survival" } };
    if (tableType === "contingency") return { analyses: [{ kind: "chisquare", options: {} }], graph: { kind: "bar" } };
    if (tableType === "grouped") return { analyses: [{ kind: "twoway", options: {} }], graph: { kind: "grouped" } };
    if (tableType === "parts") return { analyses: [{ kind: "describe", options: {} }], graph: { kind: "pie" } };
    if (tableType === "multiple") return { analyses: [{ kind: "describe", options: {} }], graph: { kind: "column" } };
    // column tables
    if (nGroups >= 3) return { analyses: [{ kind: "describe", options: {} }, { kind: "anova", options: { posthoc: "tukey" } }], graph: { kind: "column", plotStyle: "meanSD" } };
    if (nGroups === 2) return { analyses: [{ kind: "describe", options: {} }, { kind: "ttest", options: { colA: 0, colB: 1 } }], graph: { kind: "column", plotStyle: "meanSD" } };
    return { analyses: [{ kind: "describe", options: {} }], graph: { kind: "column", plotStyle: "scatter" } };
  }

  FG.detect = { classifyColumn, suggestTableType, suggestPlan };
})();
