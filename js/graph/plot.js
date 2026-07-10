/*
 * Figulate — SVG plotting engine.
 * Renders a graph object into an <svg> DOM node. Supports scatter/column,
 * bar, box-and-whisker, violin, XY (with regression), grouped bar, survival
 * step curves and pie charts, plus annotations (shapes/text) and significance
 * brackets. Attached to window.FG.plot.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const M = FG.model;
  const stats = FG.stats;
  const NS = "http://www.w3.org/2000/svg";

  const PALETTE = [
    "#3b6fb0", "#c0392b", "#27924f", "#8e44ad", "#e08e0b",
    "#16a085", "#d35400", "#2c3e50", "#c2185b", "#607d8b",
  ];

  // Named color schemes: categorical lists (cat) and sequential colormaps (seq).
  const SCHEMES = {
    figulate: { name: "Figulate (default)", type: "cat", colors: PALETTE },
    category: { name: "Category", type: "cat", colors: ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"] },
    viridis: { name: "Viridis", type: "seq", anchors: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"] },
    warm: { name: "Warm", type: "seq", anchors: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"] },
    cool: { name: "Cool", type: "seq", anchors: ["#f7fcf0", "#a8ddb5", "#4eb3d3", "#08589e"] },
    blues: { name: "Blues", type: "seq", anchors: ["#deebf7", "#9ecae1", "#4292c6", "#08519c"] },
    grayscale: { name: "Grayscale", type: "seq", anchors: ["#e0e0e0", "#9e9e9e", "#616161", "#212121"] },
  };
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r) { return "#" + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join(""); }
  function interpAnchors(anchors, t) {
    const span = anchors.length - 1;
    const pos = Math.max(0, Math.min(span, t * span));
    const i = Math.min(span - 1, Math.floor(pos));
    const f = pos - i;
    const a = hexToRgb(anchors[i]), b = hexToRgb(anchors[i + 1]);
    return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }

  function el(tag, attrs = {}, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // Mark a rendered element as clickable data for series `s`, so clicking it in
  // the editor jumps to that series' style panel. No-op when s is null.
  function tagData(node, s) {
    if (!node || s == null) return node;
    const cls = node.getAttribute("class");
    node.setAttribute("class", (cls ? cls + " " : "") + "op-data");
    node.setAttribute("data-series", s);
    node.style.cursor = "pointer";
    return node;
  }

  // Map a line-style keyword to an SVG stroke-dasharray (null = solid).
  function dash(style) {
    if (style === "dashed") return "9 5";
    if (style === "dotted") return "2 4";
    if (style === "dashdot") return "9 4 2 4";
    return null;
  }

  // Appearance options a user can save as their personal defaults for new
  // graphs (fonts, sizes, line widths, colors — never data-specific state
  // like titles, ranges or dragged positions).
  const STYLE_KEYS = [
    "fontFamily", "titleSize", "titleColor", "titleBold", "titleItalic", "titleFont",
    "axisTitleSize", "xTitleColor", "yTitleColor", "xTitleBold", "xTitleItalic", "yTitleBold", "yTitleItalic",
    "tickSize", "tickColor", "tickBold", "tickItalic",
    "legendSize", "legendColor", "legendBold", "legendItalic",
    "lineWidth", "lineStyle", "axisWidth", "tickLen",
    "symbol", "symbolSize", "symbolFilled", "symbolBorder",
    "barBorderColor", "barBorderWidth", "barFillOpacity", "barGap",
    "errorWidth", "errorColor", "errorBar", "capWidth",
    "gridY", "gridX", "numberFmt",
    "width", "height", "background", "colors", "colorScheme",
  ];
  const DEFAULTS_LS_KEY = "op_style_defaults_v1";

  FG.plot = {
    PALETTE,
    SCHEMES,
    STYLE_KEYS,
    // The user's saved default style (or null).
    userDefaults() {
      try { return JSON.parse(localStorage.getItem(DEFAULTS_LS_KEY)); } catch (e) { return null; }
    },
    // Snapshot the style keys of `options` as the default for new graphs.
    saveDefaultsFrom(options) {
      const out = {};
      STYLE_KEYS.forEach((k) => {
        if (options[k] === undefined) return;
        out[k] = Array.isArray(options[k]) ? options[k].slice() : options[k];
      });
      try { localStorage.setItem(DEFAULTS_LS_KEY, JSON.stringify(out)); return true; } catch (e) { return false; }
    },
    clearUserDefaults() {
      try { localStorage.removeItem(DEFAULTS_LS_KEY); } catch (e) { /* ignore */ }
    },
    // Overwrite the style keys of an existing graph with the saved defaults.
    applyUserDefaults(options) {
      const saved = this.userDefaults();
      if (!saved) return false;
      STYLE_KEYS.forEach((k) => {
        if (saved[k] === undefined) return;
        options[k] = Array.isArray(saved[k]) ? saved[k].slice() : saved[k];
      });
      return true;
    },
    // Generate n colors from a named scheme (categorical repeat, or sampled colormap).
    schemeColors(key, n) {
      // Unknown keys (e.g. the renamed legacy default scheme in older saved
      // projects) fall back to the default palette.
      const s = SCHEMES[key] || (key ? SCHEMES.figulate : null);
      if (!s) return null;
      if (s.type === "cat") return Array.from({ length: n }, (_, i) => s.colors[i % s.colors.length]);
      return Array.from({ length: n }, (_, i) => interpAnchors(s.anchors, n <= 1 ? 0 : i / (n - 1)));
    },
    defaultOptions(kind) {
      const o = {
        title: "",
        xTitle: "",
        yTitle: "Value",
        width: 450,
        height: 300,
        zoom: "fit",          // panel display zoom: "fit" or a number (1 = 100%)
        fontFamily: "Arial, sans-serif",
        titleSize: 10,
        titleColor: "#111111",
        titleBold: true,
        titleItalic: false,
        titleFont: "",        // "" = inherit graph font
        axisTitleSize: 8,
        xTitleSize: null,     // null = use axisTitleSize
        yTitleSize: null,
        xTitleColor: "#111111",
        yTitleColor: "#111111",
        xTitleBold: false,
        xTitleItalic: false,
        yTitleBold: false,
        yTitleItalic: false,
        tickSize: 8,
        xTickSize: null,      // null = use tickSize
        yTickSize: null,
        tickColor: "#111111",
        xTickColor: null,     // null = use tickColor
        yTickColor: null,
        tickBold: false,
        tickItalic: false,
        legendSize: 8,
        legendColor: "#111111",
        legendBold: false,
        legendItalic: false,
        yAuto: true,
        yMin: 0,
        yMax: 100,
        xAuto: true,
        xMin: 0,
        xMax: 10,
        // Where the horizontal axis line sits: "zero" (through y=0) or "min"
        // (at the bottom). XY defaults to bottom; bar/grouped default to zero.
        baseline: kind === "xy" ? "min" : "zero",
        showLegend: kind === "xy" || kind === "grouped" || kind === "survival" || kind === "pie",
        plotStyle: kind === "column" ? "meanSD" : kind,
        errorBar: "sd",
        errorDir: "both",
        errorWidth: 0.5,
        errorColor: "#111111",
        symbol: "circle",
        symbolSize: 4,
        symbolFilled: true,
        symbolBorder: 0.5,
        barBorderColor: "#111111",
        barBorderWidth: 0.5,
        barFillOpacity: 1,
        showPoints: false,       // overlay individual data points on bars
        groupedStyle: "bar",     // grouped graphs: bar | scatter | stacked
        groupColorBy: "series",  // grouped graphs: series | category
        groupGap: 0.1,           // gap between bars within a group (fraction)
        lineWidth: 0.5,
        connectLine: kind === "xy",
        showRegression: false,
        nonlinearModel: "none",
        lineStyle: "solid",
        snap: true,
        legendX: null,
        legendY: null,
        xTitleX: null,
        xTitleY: null,
        yTitleX: null,
        yTitleY: null,
        barGap: 0.35,
        gridY: false,
        gridX: false,
        axisWidth: 0.5,
        tickLen: 5,
        numberFmt: "auto",   // auto | fixed | sci
        yDecimals: -1,        // -1 = auto
        yTickStep: 0,         // 0 = auto
        xDecimals: -1,
        xTickStep: 0,
        yLog: false,
        xLog: false,
        xLabelAngle: "auto",  // auto | 0 | 45 | 90
        groupOrientation: "byRow", // grouped graphs: byRow | byColumn
        titleX: null,
        titleY: null,
        xTicksDX: 0, xTicksDY: 0,   // draggable offset for the axis tick labels
        yTicksDX: 0, yTicksDY: 0,
        series: [],           // per-series style overrides, indexed by dataset
        background: "#ffffff",
        colors: PALETTE.slice(),
        capWidth: 8,
      };
      // User-saved default style overrides the built-ins for every new graph.
      this.applyUserDefaults(o);
      return o;
    },

    // Text attributes for tick labels on one axis (selectable via .op-ticks).
    tickTextAttrs(o, axis) {
      return {
        "font-size": (axis === "x" ? o.xTickSize : o.yTickSize) || o.tickSize,
        fill: (axis === "x" ? o.xTickColor : o.yTickColor) || o.tickColor || "#111",
        "font-weight": o.tickBold ? "bold" : null,
        "font-style": o.tickItalic ? "italic" : null,
      };
    },
    // Selectable + draggable group that holds all tick labels of one axis.
    // A stored per-axis offset (o.xTicksDX/DY, o.yTicksDX/DY) lets the labels be
    // nudged as a block without moving the axis line or ticks.
    tickGroup(svg, o, axis) {
      const dx = (axis === "x" ? o.xTicksDX : o.yTicksDX) || 0;
      const dy = (axis === "x" ? o.xTicksDY : o.yTicksDY) || 0;
      const g = el("g", { class: "op-ticks", "data-axis": axis, transform: `translate(${dx},${dy})` });
      svg.appendChild(g);
      return g;
    },

    // Format a numeric tick label per the axis number-format options.
    fmtTick(v, o, decimals) {
      if (Math.abs(v) < 1e-12) v = 0;
      const dec = decimals != null ? decimals : -1;
      if (o.numberFmt === "sci") return v.toExponential(dec >= 0 ? dec : 2);
      if (o.numberFmt === "percent") return (v * 100).toFixed(dec >= 0 ? dec : 0) + "%";
      if (dec >= 0) return v.toFixed(dec);
      return parseFloat(v.toPrecision(6)).toString();
    },

    render(graph, table) {
      const o = graph.options;
      const svg = el("svg", {
        width: o.width,
        height: o.height,
        viewBox: `0 0 ${o.width} ${o.height}`,
        xmlns: NS,
        "font-family": o.fontFamily,
        class: "op-graph-svg",
      });
      svg.appendChild(el("rect", { x: 0, y: 0, width: o.width, height: o.height, fill: o.background }));

      // Shapes flagged "behind" render before the plot so they sit under the data.
      (graph.annotations || []).filter((a) => a.behind).forEach((a) => this.renderAnnotation(svg, a));

      const m = { top: 46, right: o.showLegend ? 118 : 28, bottom: 60, left: 66 };
      // Category (column/grouped) graphs: decide X-label rotation and reserve
      // extra bottom space so rotated labels aren't clipped.
      let xLabelAngle = 0;
      const catLabels = this.categoryLabels(graph, table);
      if (catLabels) {
        const approxW = o.width - m.left - m.right;
        const band = approxW / Math.max(1, catLabels.length);
        const maxLen = Math.max(1, ...catLabels.map((l) => String(l).length));
        const estW = maxLen * o.tickSize * 0.62;
        if (o.xLabelAngle === "auto") xLabelAngle = estW > band * 1.35 ? 90 : estW > band * 0.95 ? 45 : 0;
        else xLabelAngle = parseInt(o.xLabelAngle) || 0;
        if (xLabelAngle) {
          const extra = xLabelAngle === 90 ? estW : estW * 0.72;
          m.bottom = Math.min(230, 40 + extra + (o.xTitle ? 24 : 0));
        }
      }
      const plotW = o.width - m.left - m.right;
      const plotH = o.height - m.top - m.bottom;
      const ctx = { svg, o, m, plotW, plotH, graph, table, xLabelAngle };

      // Title (draggable group)
      if (o.title) {
        const bx = m.left + plotW / 2, by = 28;
        const gx = o.titleX != null ? o.titleX : bx;
        const gy = o.titleY != null ? o.titleY : by;
        const g = el("g", { class: "op-title", transform: `translate(${gx},${gy})` });
        g.appendChild(el("rect", { x: -plotW / 2, y: -o.titleSize, width: plotW, height: o.titleSize * 1.5, fill: "transparent" }));
        g.appendChild(el("text", {
          x: 0, y: 0, "text-anchor": "middle", "font-size": o.titleSize,
          "font-weight": o.titleBold !== false ? "bold" : "normal",
          "font-style": o.titleItalic ? "italic" : "normal",
          "font-family": o.titleFont || null,
          fill: o.titleColor || "#111",
        }, o.title));
        svg.appendChild(g);
      }

      const kind = graph.kind;
      try {
        if (kind === "pie") this.renderPie(ctx);
        else if (kind === "survival") this.renderSurvival(ctx);
        else if (kind === "xy") this.renderXY(ctx);
        else if (kind === "grouped") this.renderGrouped(ctx);
        else this.renderColumn(ctx); // column/bar/box/violin
      } catch (e) {
        svg.appendChild(el("text", { x: m.left, y: m.top + 20, fill: "#c0392b", "font-size": 13 },
          "Not enough data to plot."));
        console.warn("plot error", e);
      }

      // Foreground shapes render on top of the data.
      (graph.annotations || []).filter((a) => !a.behind).forEach((a) => this.renderAnnotation(svg, a));
      return svg;
    },

    // ---- Axis helpers -----------------------------------------------------
    niceScale(min, max, ticks = 6) {
      if (min === max) { min -= 1; max += 1; }
      const range = max - min;
      const step = Math.pow(10, Math.floor(Math.log10(range / ticks)));
      const err = (ticks * step) / range;
      let mult = 1;
      if (err <= 0.15) mult = 10;
      else if (err <= 0.35) mult = 5;
      else if (err <= 0.75) mult = 2;
      const niceStep = mult * step;
      return {
        min: Math.floor(min / niceStep) * niceStep,
        max: Math.ceil(max / niceStep) * niceStep,
        step: niceStep,
      };
    },

    drawYAxis(ctx, yMin, yMax) {
      const { svg, o, m, plotW, plotH } = ctx;
      const y0 = m.top + plotH;
      const tickLen = o.tickLen != null ? o.tickLen : 6;
      svg.appendChild(el("line", { x1: m.left, y1: m.top, x2: m.left, y2: y0, stroke: "#111", "stroke-width": o.axisWidth }));
      const tickG = this.tickGroup(svg, o, "y");
      const tkAttr = this.tickTextAttrs(o, "y");

      let yScale;
      if (o.yLog) {
        // Expand the domain to whole decades; clamp non-positive values to the floor.
        let dmin = yMin > 0 ? yMin : (yMax > 0 ? yMax / 1000 : 1);
        const lo = Math.floor(Math.log10(dmin)), hi = Math.ceil(Math.log10(Math.max(yMax, dmin * 10)));
        const l0 = lo, l1 = hi || 1;
        yScale = (v) => y0 - ((Math.log10(Math.max(v, Math.pow(10, l0))) - l0) / (l1 - l0)) * plotH;
        for (let k = lo; k <= hi; k++) {
          const base = Math.pow(10, k), y = yScale(base);
          svg.appendChild(el("line", { x1: m.left - tickLen, y1: y, x2: m.left, y2: y, stroke: "#111", "stroke-width": o.axisWidth }));
          if (o.gridY) svg.appendChild(el("line", { x1: m.left, y1: y, x2: m.left + plotW, y2: y, stroke: "#e5e5e5", "stroke-width": 1 }));
          tickG.appendChild(el("text", { x: m.left - tickLen - 4, y: y + 4, "text-anchor": "end", ...tkAttr }, this.fmtTick(base, o, o.yDecimals)));
          for (let mmn = 2; mmn <= 9 && k < hi; mmn++) { const ym = yScale(base * mmn); svg.appendChild(el("line", { x1: m.left - tickLen * 0.6, y1: ym, x2: m.left, y2: ym, stroke: "#111", "stroke-width": o.axisWidth })); }
        }
      } else {
        yScale = (v) => y0 - ((v - yMin) / (yMax - yMin)) * plotH;
        const sc = this.niceScale(yMin, yMax, 6);
        const step = o.yTickStep > 0 ? o.yTickStep : sc.step;
        const start = Math.ceil((yMin - 1e-9) / step) * step;
        // Only draw ticks within [yMin, yMax] so labels never stick out past the axis.
        for (let v = start; v <= yMax + Math.abs(step) * 1e-6; v += step) {
          const y = yScale(v);
          svg.appendChild(el("line", { x1: m.left - tickLen, y1: y, x2: m.left, y2: y, stroke: "#111", "stroke-width": o.axisWidth }));
          if (o.gridY) svg.appendChild(el("line", { x1: m.left, y1: y, x2: m.left + plotW, y2: y, stroke: "#e5e5e5", "stroke-width": 1 }));
          tickG.appendChild(el("text", { x: m.left - tickLen - 4, y: y + 4, "text-anchor": "end", ...tkAttr }, this.fmtTick(v, o, o.yDecimals)));
        }
      }
      // Y title (draggable group; rotated text lives inside)
      if (o.yTitle) {
        const size = o.yTitleSize || o.axisTitleSize;
        const bx = 22, by = m.top + plotH / 2;
        const gx = o.yTitleX != null ? o.yTitleX : bx;
        const gy = o.yTitleY != null ? o.yTitleY : by;
        const g = el("g", { class: "op-axistitle", "data-axis": "y", transform: `translate(${gx},${gy})` });
        g.appendChild(el("rect", { x: -size, y: -plotH / 2, width: size * 1.6, height: plotH, fill: "transparent" }));
        g.appendChild(el("text", {
          x: 0, y: 0, "text-anchor": "middle", "font-size": size,
          fill: o.yTitleColor || "#111",
          "font-weight": o.yTitleBold ? "bold" : null,
          "font-style": o.yTitleItalic ? "italic" : null,
          transform: "rotate(-90)",
        }, o.yTitle));
        svg.appendChild(g);
      }
      return yScale;
    },

    // Draggable X-axis title used by all X-axis renderers.
    xAxisTitle(ctx, fallback) {
      const { svg, o, m, plotW } = ctx;
      const label = o.xTitle || fallback;
      if (!label) return;
      const size = o.xTitleSize || o.axisTitleSize;
      const bx = m.left + plotW / 2, by = o.height - 20;
      const gx = o.xTitleX != null ? o.xTitleX : bx;
      const gy = o.xTitleY != null ? o.xTitleY : by;
      const g = el("g", { class: "op-axistitle", "data-axis": "x", transform: `translate(${gx},${gy})` });
      g.appendChild(el("rect", { x: -plotW / 2, y: -size, width: plotW, height: size * 1.6, fill: "transparent" }));
      g.appendChild(el("text", {
        x: 0, y: 0, "text-anchor": "middle", "font-size": size,
        fill: o.xTitleColor || "#111",
        "font-weight": o.xTitleBold ? "bold" : null,
        "font-style": o.xTitleItalic ? "italic" : null,
      }, label));
      svg.appendChild(g);
    },

    drawXCategoryAxis(ctx, labels) {
      const { svg, o, m, plotW, plotH } = ctx;
      const y0 = m.top + plotH;
      const angle = ctx.xLabelAngle || 0;
      // Horizontal axis line at the chosen baseline (bottom or y=0); labels stay at bottom.
      const lineY = ctx.baselineY != null ? ctx.baselineY : y0;
      svg.appendChild(el("line", { x1: m.left, y1: lineY, x2: m.left + plotW, y2: lineY, stroke: "#111", "stroke-width": o.axisWidth }));
      const tickG = this.tickGroup(svg, o, "x");
      const tkAttr = this.tickTextAttrs(o, "x");
      const band = plotW / labels.length;
      labels.forEach((lab, i) => {
        const cx = m.left + band * (i + 0.5);
        if (angle) {
          // Rotate around a point just below the tick; anchor at the end so text
          // runs up-and-away from the axis without overlapping neighbors.
          const ly = y0 + 14;
          tickG.appendChild(el("text", { x: cx, y: ly, "text-anchor": "end", ...tkAttr, transform: `rotate(-${angle} ${cx} ${ly})` }, lab));
        } else {
          tickG.appendChild(el("text", { x: cx, y: y0 + 22, "text-anchor": "middle", ...tkAttr }, lab));
        }
      });
      this.xAxisTitle(ctx);
      return (i) => m.left + band * (i + 0.5);
    },

    // Category labels for the X axis (column groups / grouped rows), or null.
    categoryLabels(graph, table) {
      try {
        if (["column", "bar", "box", "violin"].includes(graph.kind)) return M.columnGroups(table).filter((g) => g.values.length).map((g) => g.name);
        if (graph.kind === "grouped") { const c = M.groupedCells(table); return graph.options.groupOrientation === "byColumn" ? c.colFactors : c.rowFactors; }
      } catch (e) { /* not enough data */ }
      return null;
    },

    color(o, i) { return (o.colors && o.colors[i]) || PALETTE[i % PALETTE.length]; },

    // ---- Column / bar / box / violin -------------------------------------
    renderColumn(ctx) {
      const { o, graph, table } = ctx;
      const groups = M.columnGroups(table).filter((g) => g.values.length);
      if (!groups.length) throw new Error("no data");
      const style = o.plotStyle;
      const descs = groups.map((g) => stats.describe(g.values));
      let dataMin = Math.min(...groups.flatMap((g) => g.values));
      let dataMax = Math.max(...groups.flatMap((g) => g.values));
      descs.forEach((d) => {
        const et = style === "meanSEM" ? d.sem : o.errorBar === "sem" ? d.sem : o.errorBar === "ci" ? (d.ci95hi - d.mean) : d.sd;
        dataMax = Math.max(dataMax, d.mean + et, d.mean + d.sd);
        dataMin = Math.min(dataMin, d.mean - et, d.mean - d.sd);
      });
      // Auto-range always includes the zero baseline and extends below it when
      // the data (or error bars) go negative, so nothing gets clipped.
      let yMin = o.yAuto ? Math.min(0, dataMin) : o.yMin;
      const nStars = (graph.stars || []).length;
      let dataMaxForScale = Math.max(0, dataMax);
      if (o.yAuto && nStars) {
        // Brackets stack in fixed pixel bands above the data, so reserve
        // headroom in pixel space (fraction of plot height), not value space.
        const f = Math.min(0.55, (12 + 28 * nStars) / ctx.plotH);
        dataMaxForScale = (dataMaxForScale - f * yMin) / (1 - f);
      }
      let yMax = o.yAuto ? this.niceScale(yMin, dataMaxForScale).max : o.yMax;
      if (o.yAuto) yMin = this.niceScale(yMin, dataMaxForScale).min;
      const yScale = this.drawYAxis(ctx, yMin, yMax);
      const zeroY = yScale(Math.max(yMin, Math.min(yMax, 0))); // pixel of the y=0 baseline
      // Highest data pixel (top of the tallest point / error bar) for bracket placement.
      let topVal = -Infinity;
      groups.forEach((gg, i) => {
        const d = descs[i];
        const e = o.errorBar === "sem" ? d.sem : o.errorBar === "ci" ? (d.ci95hi - d.mean) : d.sd;
        const t = style === "bar" || style === "meanSD" ? d.mean + e : style === "meanSEM" ? d.mean + d.sem : d.max;
        topVal = Math.max(topVal, t);
      });
      ctx.dataTopY = yScale(topVal);
      ctx.baselineY = (o.baseline === "zero" && yMin < 0 && yMax > 0) ? zeroY : (ctx.m.top + ctx.plotH);
      const xAt = this.drawXCategoryAxis(ctx, groups.map((g) => g.name));
      const band = ctx.plotW / groups.length;
      const barW = band * (1 - o.barGap);

      groups.forEach((g, i) => {
        const cx = xAt(i);
        const st = this.seriesStyle(o, i);
        const c = st.color;
        const d = descs[i];
        const err = o.errorBar === "sem" ? d.sem : o.errorBar === "ci" ? (d.ci95hi - d.mean) : d.sd;

        if (style === "bar" || style === "meanSD" || style === "meanSEM") {
          const showBar = style === "bar";
          if (showBar) {
            const my = yScale(d.mean);
            tagData(ctx.svg.appendChild(el("rect", {
              x: cx - barW / 2, y: Math.min(my, zeroY), width: barW, height: Math.abs(my - zeroY),
              fill: c, "fill-opacity": st.barFillOpacity,
              stroke: st.barBorderColor, "stroke-width": st.barBorderWidth,
            })), i);
          } else {
            // mean line
            ctx.svg.appendChild(el("line", { x1: cx - barW / 2, y1: yScale(d.mean), x2: cx + barW / 2, y2: yScale(d.mean), stroke: "#111", "stroke-width": 2 }));
          }
          // error bar
          const et = style === "meanSEM" ? d.sem : err;
          if (o.errorBar !== "none" && et > 0) this.errorBar(ctx, cx, yScale(d.mean), yScale(d.mean - et), yScale(d.mean + et), o.errorDir, d.mean >= 0);
          if (!showBar || o.showPoints) this.scatterPoints(ctx, g.values, cx, yScale, c, st, false, i);
        } else if (style === "scatter") {
          this.scatterPoints(ctx, g.values, cx, yScale, c, st, false, i);
          ctx.svg.appendChild(el("line", { x1: cx - barW / 2, y1: yScale(d.mean), x2: cx + barW / 2, y2: yScale(d.mean), stroke: "#111", "stroke-width": 2 }));
        } else if (style === "box") {
          this.box(ctx, d, cx, barW, yScale, c, i);
          this.scatterPoints(ctx, g.values, cx, yScale, c, st, true, i);
        } else if (style === "violin") {
          this.violin(ctx, g.values, cx, barW, yScale, yMin, yMax, c, i);
        }
      });

      this.renderStars(ctx, graph, xAt, yScale, yMax);
      const colSymbol = ["scatter", "meanSD", "meanSEM"].includes(style);
      this.legend(ctx, groups.map((g, i) => {
        const st = this.seriesStyle(o, i);
        return colSymbol
          ? { label: g.name, color: st.color, kind: "symbol", symbol: st.symbol, filled: st.symbolFilled, border: st.symbolBorder, symbolSize: st.symbolSize }
          : { label: g.name, color: st.color };
      }));
    },

    // Effective style for data series i, merging per-series overrides (o.series[i])
    // over the graph-wide defaults. Color lives in o.colors[i].
    seriesStyle(o, i) {
      const s = (o.series && o.series[i]) || {};
      return {
        color: (o.colors && o.colors[i]) || PALETTE[i % PALETTE.length],
        symbol: s.symbol || o.symbol,
        symbolSize: s.symbolSize != null ? s.symbolSize : o.symbolSize,
        symbolFilled: s.symbolFilled != null ? s.symbolFilled : (o.symbolFilled !== false),
        symbolBorder: s.symbolBorder != null ? s.symbolBorder : o.symbolBorder,
        lineWidth: s.lineWidth != null ? s.lineWidth : o.lineWidth,
        lineStyle: s.lineStyle || o.lineStyle,
        connectLine: s.connectLine != null ? s.connectLine : o.connectLine,
        barBorderColor: s.barBorderColor || o.barBorderColor || "#111111",
        barBorderWidth: s.barBorderWidth != null ? s.barBorderWidth : (o.barBorderWidth != null ? o.barBorderWidth : 0.5),
        barFillOpacity: s.barFillOpacity != null ? s.barFillOpacity : (o.barFillOpacity != null ? o.barFillOpacity : 1),
      };
    },

    scatterPoints(ctx, values, cx, yScale, c, st, jitterOnly, series) {
      const spread = jitterOnly ? 6 : 14;
      values.forEach((v, i) => {
        const jitter = values.length > 1 ? ((i % 5) - 2) / 2 * (spread / 2) : 0;
        const n = this.symbol(ctx.svg, cx + jitter, yScale(v), c, st.symbol, st.symbolSize, st);
        tagData(n, series);
      });
    },

    symbol(svg, x, y, c, shape, size, st) {
      const r = size / 2;
      const filled = !st || st.symbolFilled !== false;
      const border = st && st.symbolBorder != null ? st.symbolBorder : 0.5;
      // Filled: colored fill with a dark edge. Open: no fill, colored ring.
      const attrs = filled
        ? { fill: c, stroke: "#333", "stroke-width": border }
        : { fill: "none", stroke: c, "stroke-width": Math.max(border, 1) };
      let n;
      if (shape === "square") n = el("rect", { x: x - r, y: y - r, width: size, height: size, ...attrs });
      else if (shape === "triangle") n = el("polygon", { points: `${x},${y - r} ${x - r},${y + r} ${x + r},${y + r}`, ...attrs });
      else if (shape === "diamond") n = el("polygon", { points: `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`, ...attrs });
      else n = el("circle", { cx: x, cy: y, r, ...attrs });
      svg.appendChild(n);
      return n;
    },

    // Draw an error bar. yLo = pixel of (mean − err) [lower on data = larger y],
    // yHi = pixel of (mean + err). dir: "both" draws both whiskers; "outer" draws
    // only the whisker pointing away from the baseline (up for positive values,
    // down for negative). outerUp indicates which direction is "outer".
    errorBar(ctx, cx, yMean, yLo, yHi, dir, outerUp) {
      const o = ctx.o;
      const cap = o.capWidth / 2;
      dir = dir || "both";
      const g = el("g", { stroke: o.errorColor || "#111", "stroke-width": o.errorWidth != null ? o.errorWidth : 1.5, fill: "none" });
      const up = dir === "both" || (dir === "outer" && outerUp !== false);
      const down = dir === "both" || (dir === "outer" && outerUp === false);
      if (up) { g.appendChild(el("line", { x1: cx, y1: yMean, x2: cx, y2: yHi })); g.appendChild(el("line", { x1: cx - cap, y1: yHi, x2: cx + cap, y2: yHi })); }
      if (down) { g.appendChild(el("line", { x1: cx, y1: yMean, x2: cx, y2: yLo })); g.appendChild(el("line", { x1: cx - cap, y1: yLo, x2: cx + cap, y2: yLo })); }
      ctx.svg.appendChild(g);
    },

    box(ctx, d, cx, w, yScale, c, series) {
      const g = el("g", { stroke: "#111", "stroke-width": 1.2, fill: c, "fill-opacity": 0.35 });
      tagData(g, series);
      g.appendChild(el("rect", { x: cx - w / 2, y: yScale(d.q3), width: w, height: yScale(d.q1) - yScale(d.q3) }));
      g.appendChild(el("line", { x1: cx - w / 2, y1: yScale(d.median), x2: cx + w / 2, y2: yScale(d.median), "stroke-width": 2, fill: "none" }));
      g.appendChild(el("line", { x1: cx, y1: yScale(d.q3), x2: cx, y2: yScale(d.max), fill: "none" }));
      g.appendChild(el("line", { x1: cx, y1: yScale(d.q1), x2: cx, y2: yScale(d.min), fill: "none" }));
      g.appendChild(el("line", { x1: cx - w / 4, y1: yScale(d.max), x2: cx + w / 4, y2: yScale(d.max), fill: "none" }));
      g.appendChild(el("line", { x1: cx - w / 4, y1: yScale(d.min), x2: cx + w / 4, y2: yScale(d.min), fill: "none" }));
      ctx.svg.appendChild(g);
    },

    violin(ctx, values, cx, w, yScale, yMin, yMax, c, series) {
      const n = values.length;
      const s = stats.sd(values) || 1;
      const h = 1.06 * s * Math.pow(n, -0.2); // Silverman bandwidth
      const steps = 40;
      const density = [];
      for (let i = 0; i <= steps; i++) {
        const y = yMin + ((yMax - yMin) * i) / steps;
        let d = 0;
        values.forEach((v) => {
          const u = (y - v) / h;
          d += Math.exp(-0.5 * u * u);
        });
        density.push({ y, d: d / (n * h * Math.sqrt(2 * Math.PI)) });
      }
      const maxD = Math.max(...density.map((p) => p.d)) || 1;
      const scaleW = (w / 2) / maxD;
      let left = "", right = "";
      density.forEach((p) => {
        const px = p.d * scaleW;
        left += `${cx - px},${yScale(p.y)} `;
        right = `${cx + px},${yScale(p.y)} ` + right;
      });
      tagData(ctx.svg.appendChild(el("polygon", { points: left + right, fill: c, "fill-opacity": 0.4, stroke: c, "stroke-width": 1.5 })), series);
      const d = stats.describe(values);
      ctx.svg.appendChild(el("line", { x1: cx - w / 4, y1: yScale(d.median), x2: cx + w / 4, y2: yScale(d.median), stroke: "#111", "stroke-width": 2 }));
    },

    // ---- Significance brackets/stars -------------------------------------
    // Brackets sit ABOVE the data by default and can be dragged vertically
    // (each remembers a manual `y`). Rendered as draggable groups (.op-bracket).
    renderStars(ctx, graph, xAt, yScale, yMax) {
      if (!graph.stars || !graph.stars.length) return;
      const base = (ctx.dataTopY != null ? ctx.dataTopY : ctx.m.top + ctx.plotH * 0.1) - 22;
      graph.stars.forEach((s, idx) => {
        // Grouped within-group brackets carry endpoints as [category, series]
        // and resolve to individual bar centers; column brackets use xAt(i/j).
        let x1, x2;
        if (s.a && s.b && ctx.barX) { x1 = ctx.barX(s.a[0], s.a[1]); x2 = ctx.barX(s.b[0], s.b[1]); }
        else { x1 = xAt(s.i); x2 = xAt(s.j); }
        // Auto placement never escapes the plot area (manual drags may).
        const drawnY = s.y != null ? s.y : Math.max(base - idx * 28, ctx.m.top + 12);
        const g = el("g", { class: "op-bracket", "data-idx": idx, "data-basey": drawnY });
        const line = { stroke: "#111", "stroke-width": 1.3, fill: "none" };
        g.appendChild(el("line", { x1, y1: drawnY, x2: x1, y2: drawnY + 6, ...line }));
        g.appendChild(el("line", { x1, y1: drawnY, x2: x2, y2: drawnY, ...line }));
        g.appendChild(el("line", { x1: x2, y1: drawnY, x2: x2, y2: drawnY + 6, ...line }));
        g.appendChild(el("text", { x: (x1 + x2) / 2, y: drawnY - 4, "text-anchor": "middle", "font-size": 15, "font-weight": "bold", fill: "#111" }, s.label));
        // transparent hit area for easy grabbing
        g.appendChild(el("rect", { x: Math.min(x1, x2), y: drawnY - 18, width: Math.abs(x2 - x1) || 10, height: 26, fill: "transparent" }));
        ctx.svg.appendChild(g);
      });
    },

    // ---- XY ---------------------------------------------------------------
    renderXY(ctx) {
      const { o, graph, table } = ctx;
      const raw = M.xySeries(table);
      const x = raw.x;
      // Only plot series (Y datasets) that actually contain data.
      const series = raw.series.filter((s) => s.y.some((v) => v !== null && !isNaN(v)));
      const xn = x.map((v) => (v === "" ? null : Number(v)));
      const allX = xn.filter((v) => v !== null && !isNaN(v));
      // Y extent must include error-bar whiskers (mean ± error) so they aren't clipped.
      const allY = [];
      series.forEach((s) => s.y.forEach((yv, ri) => {
        if (yv === null || isNaN(yv)) return;
        allY.push(yv);
        const reps = s.yRep && s.yRep[ri];
        if (o.errorBar !== "none" && reps && reps.length >= 2) {
          const d = stats.describe(reps);
          const e = o.errorBar === "sem" ? d.sem : o.errorBar === "ci" ? (d.ci95hi - d.mean) : d.sd;
          if (e > 0) { allY.push(yv + e, yv - e); }
        }
      }));
      if (!allX.length || !allY.length) throw new Error("no data");
      const { svg, m, plotW, plotH } = ctx;
      const y0 = m.top + plotH;
      const tickLen = o.tickLen != null ? o.tickLen : 6;

      // ---- X scale (linear or log10) ----
      let xs, xScale, xSample;
      if (o.xLog) {
        let dmin = Math.min(...allX.filter((v) => v > 0));
        const dmaxRaw = Math.max(...allX);
        if (!isFinite(dmin) || dmin <= 0) dmin = dmaxRaw > 0 ? dmaxRaw / 1000 : 1;
        const lo = Math.floor(Math.log10(dmin)), hi = Math.ceil(Math.log10(dmaxRaw));
        xs = { min: Math.pow(10, lo), max: Math.pow(10, hi) };
        const l0 = Math.log10(xs.min), l1 = Math.log10(xs.max) || 1;
        xScale = (v) => m.left + ((Math.log10(Math.max(v, xs.min)) - l0) / (l1 - l0)) * plotW;
        xSample = (t) => Math.pow(10, l0 + (l1 - l0) * t);
      } else {
        xs = o.xAuto ? this.niceScale(Math.min(...allX), Math.max(...allX)) : { min: o.xMin, max: o.xMax };
        xScale = (v) => m.left + ((v - xs.min) / (xs.max - xs.min)) * plotW;
        xSample = (t) => xs.min + (xs.max - xs.min) * t;
      }

      // ---- Y scale ----
      let ys;
      if (o.yLog) { let dmin = Math.min(...allY.filter((v) => v > 0)); if (!isFinite(dmin)) dmin = 1; ys = { min: dmin, max: Math.max(...allY) }; }
      else ys = o.yAuto ? this.niceScale(Math.min(...allY), Math.max(...allY)) : { min: o.yMin, max: o.yMax };
      const yScale = this.drawYAxis(ctx, ys.min, ys.max);

      // ---- X axis line + ticks (at the chosen baseline: bottom or y=0) ----
      const axisY = (o.baseline === "zero" && ys.min < 0 && ys.max > 0) ? yScale(0) : y0;
      svg.appendChild(el("line", { x1: m.left, y1: axisY, x2: m.left + plotW, y2: axisY, stroke: "#111", "stroke-width": o.axisWidth }));
      const xTickG = this.tickGroup(svg, o, "x");
      const xTkAttr = this.tickTextAttrs(o, "x");
      const xTick = (px, label, minor) => {
        svg.appendChild(el("line", { x1: px, y1: axisY, x2: px, y2: axisY + (minor ? tickLen * 0.6 : tickLen), stroke: "#111", "stroke-width": o.axisWidth }));
        if (o.gridX && !minor) svg.appendChild(el("line", { x1: px, y1: m.top, x2: px, y2: y0, stroke: "#e5e5e5", "stroke-width": 1 }));
        if (label != null) xTickG.appendChild(el("text", { x: px, y: axisY + tickLen + 16, "text-anchor": "middle", ...xTkAttr }, label));
      };
      if (o.xLog) {
        const lo = Math.round(Math.log10(xs.min)), hi = Math.round(Math.log10(xs.max));
        for (let k = lo; k <= hi; k++) {
          const base = Math.pow(10, k);
          xTick(xScale(base), this.fmtTick(base, o, o.xDecimals));
          for (let mmn = 2; mmn <= 9 && k < hi; mmn++) xTick(xScale(base * mmn), null, true);
        }
      } else {
        const xStep = o.xTickStep > 0 ? o.xTickStep : xs.step;
        for (let v = xs.min; v <= xs.max + 1e-9; v += xStep) xTick(xScale(v), this.fmtTick(v, o, o.xDecimals));
      }
      this.xAxisTitle(ctx);

      series.forEach((s, si) => {
        const st = this.seriesStyle(o, si);
        const c = st.color;
        const pts = [];
        s.y.forEach((yv, ri) => {
          if (yv === null || isNaN(yv) || xn[ri] === null || isNaN(xn[ri])) return;
          pts.push([xScale(xn[ri]), yScale(yv)]);
        });
        // Error bars from replicate subcolumns (mean ± SD/SEM/CI) when present.
        if (o.errorBar !== "none" && s.yRep) {
          s.y.forEach((yv, ri) => {
            const reps = s.yRep[ri];
            if (yv === null || isNaN(yv) || xn[ri] === null || isNaN(xn[ri]) || !reps || reps.length < 2) return;
            const d = stats.describe(reps);
            const e = o.errorBar === "sem" ? d.sem : o.errorBar === "ci" ? (d.ci95hi - d.mean) : d.sd;
            if (e > 0) this.errorBar(ctx, xScale(xn[ri]), yScale(yv), yScale(yv - e), yScale(yv + e), o.errorDir || "both", true);
          });
        }
        if (st.connectLine && pts.length > 1) {
          const dPath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
          tagData(svg.appendChild(el("path", { d: dPath, fill: "none", stroke: c, "stroke-width": st.lineWidth, "stroke-dasharray": dash(st.lineStyle) })), si);
        }
        pts.forEach((p) => tagData(this.symbol(svg, p[0], p[1], c, st.symbol, st.symbolSize, st), si));
        const xv = [], yv = [];
        s.y.forEach((yy, ri) => { if (yy !== null && !isNaN(yy) && xn[ri] !== null) { xv.push(xn[ri]); yv.push(yy); } });
        if (o.showRegression && xv.length > 2) {
          const reg = stats.linearRegression(xv, yv);
          const N = 60; let d = "";
          for (let t = 0; t <= N; t++) { const xx = xSample(t / N); d += (t === 0 ? "M" : "L") + xScale(xx) + "," + yScale(reg.intercept + reg.slope * xx) + " "; }
          svg.appendChild(el("path", { d, fill: "none", stroke: c, "stroke-width": st.lineWidth, "stroke-dasharray": "6 3" }));
        }
        if (o.nonlinearModel && o.nonlinearModel !== "none" && xv.length > 2) {
          const fit = stats.nonlinearFit(xv, yv, o.nonlinearModel);
          if (fit) {
            const N = 100; let d = "";
            for (let t = 0; t <= N; t++) {
              const xx = xSample(t / N), yy = fit.predict(xx);
              if (!isFinite(yy)) continue;
              d += (d === "" ? "M" : "L") + xScale(xx) + "," + yScale(yy) + " ";
            }
            svg.appendChild(el("path", { d, fill: "none", stroke: c, "stroke-width": st.lineWidth, "stroke-dasharray": dash(st.lineStyle) }));
          }
        }
      });
      this.legend(ctx, series.map((s, i) => {
        const st = this.seriesStyle(o, i);
        return { label: s.title, color: st.color, kind: st.connectLine ? "lineSymbol" : "symbol", symbol: st.symbol, filled: st.symbolFilled, border: st.symbolBorder, symbolSize: st.symbolSize, lineStyle: st.lineStyle, lineWidth: st.lineWidth };
      }));
    },

    // ---- Grouped ----------------------------------------------------------
    // Styles: "bar" (interleaved bars, optional point overlay), "scatter"
    // (points + mean line per cell) and "stacked" (series stacked per category).
    // Colors follow the series by default, or the X category (groupColorBy).
    renderGrouped(ctx) {
      const { o, table, graph } = ctx;
      const cells = M.groupedCells(table);
      const rows = cells.rowFactors, colsF = cells.colFactors;
      const gstyle = o.groupedStyle || "bar";
      const cellStat = (reps) => {
        if (!reps || !reps.length) return null;
        const mean = reps.reduce((s, v) => s + v, 0) / reps.length;
        let err = 0;
        if (reps.length >= 2 && o.errorBar !== "none") {
          const d = stats.describe(reps);
          err = o.errorBar === "sem" ? d.sem : o.errorBar === "ci" ? (d.ci95hi - d.mean) : d.sd;
        }
        return { reps, mean, err };
      };
      const statRC = rows.map((_, ri) => colsF.map((_, ci) => cellStat(cells.data[ri][ci])));
      // Orientation: byRow → rows on X, columns grouped as series (the default).
      // byColumn → columns on X, rows as series (transposed).
      const byCol = o.groupOrientation === "byColumn";
      const xCats = byCol ? colsF : rows;
      const sNames = byCol ? rows : colsF;
      const statAt = (xi, si) => (byCol ? statRC[si][xi] : statRC[xi][si]);
      const colorByCat = o.groupColorBy === "category";
      const styleFor = (xi, si) => this.seriesStyle(o, colorByCat ? xi : si);
      const showPts = gstyle === "scatter" || (gstyle === "bar" && o.showPoints);

      // ---- Y range ----
      const allStats = statRC.flat().filter(Boolean);
      let dataMax = 0, dataMin = 0;
      if (gstyle === "stacked") {
        xCats.forEach((_, xi) => {
          let pos = 0, neg = 0;
          sNames.forEach((_, si) => { const st = statAt(xi, si); if (!st) return; if (st.mean >= 0) pos += st.mean; else neg += st.mean; });
          dataMax = Math.max(dataMax, pos); dataMin = Math.min(dataMin, neg);
        });
      } else {
        allStats.forEach((st) => {
          dataMax = Math.max(dataMax, st.mean + st.err, ...(showPts ? st.reps : []));
          dataMin = Math.min(dataMin, st.mean - st.err, ...(showPts ? st.reps : []));
        });
      }
      let yMin, yMax;
      if (o.yAuto) {
        let top = dataMax;
        const nStars = (graph.stars || []).length;
        if (nStars) {
          // Pixel-space headroom for the fixed-height bracket stack (see renderColumn).
          const f = Math.min(0.55, (12 + 28 * nStars) / ctx.plotH);
          top = (top - f * dataMin) / (1 - f);
        }
        const sc = this.niceScale(dataMin, top); yMin = sc.min; yMax = sc.max;
      } else { yMin = o.yMin; yMax = o.yMax; }
      const yScale = this.drawYAxis(ctx, yMin, yMax);
      const zeroY = yScale(Math.max(yMin, Math.min(yMax, 0))); // y=0 baseline
      ctx.baselineY = (o.baseline === "zero" && yMin < 0 && yMax > 0) ? zeroY : (ctx.m.top + ctx.plotH);
      const xAt = this.drawXCategoryAxis(ctx, xCats);
      const band = ctx.plotW / xCats.length;
      const nc = Math.max(1, sNames.length);
      const groupW = band * (1 - (o.barGap != null ? o.barGap : 0.28));
      const slotW = groupW / nc;
      const innerFrac = 1 - Math.min(0.9, o.groupGap != null ? o.groupGap : 0.1);
      // Pixel center of one bar/point, so significance brackets can pin to it.
      // Stacked stacks share the group center.
      ctx.barX = (catIdx, serIdx) => {
        const cx = xAt(catIdx);
        if (gstyle === "stacked") return cx;
        return cx - groupW / 2 + serIdx * slotW + slotW / 2;
      };
      let dataTop = Infinity;

      xCats.forEach((_, xi) => {
        const cx = xAt(xi);
        if (gstyle === "stacked") {
          let posBase = 0, negBase = 0;
          const w = groupW * innerFrac;
          sNames.forEach((_, si) => {
            const stat = statAt(xi, si);
            if (!stat || !stat.mean) return;
            const st = styleFor(xi, si);
            const from = stat.mean >= 0 ? posBase : negBase;
            const to = from + stat.mean;
            if (stat.mean >= 0) posBase = to; else negBase = to;
            const y1 = yScale(from), y2 = yScale(to);
            tagData(ctx.svg.appendChild(el("rect", {
              x: cx - w / 2, y: Math.min(y1, y2), width: w, height: Math.abs(y1 - y2),
              fill: st.color, "fill-opacity": st.barFillOpacity,
              stroke: st.barBorderColor, "stroke-width": st.barBorderWidth,
            })), colorByCat ? xi : si);
            dataTop = Math.min(dataTop, Math.min(y1, y2));
          });
          return;
        }
        sNames.forEach((_, si) => {
          const stat = statAt(xi, si);
          if (!stat) return;
          const st = styleFor(xi, si);
          const bx = cx - groupW / 2 + si * slotW;      // slot left edge
          const bcx = bx + slotW / 2;                    // slot center
          const barW = slotW * innerFrac;
          const my = yScale(stat.mean);
          const sIdx = colorByCat ? xi : si;
          if (gstyle === "bar") {
            tagData(ctx.svg.appendChild(el("rect", {
              x: bcx - barW / 2, y: Math.min(my, zeroY), width: barW, height: Math.abs(my - zeroY),
              fill: st.color, "fill-opacity": st.barFillOpacity,
              stroke: st.barBorderColor, "stroke-width": st.barBorderWidth,
            })), sIdx);
          } else {
            // scatter: mean line per cell
            ctx.svg.appendChild(el("line", { x1: bcx - barW / 2, y1: my, x2: bcx + barW / 2, y2: my, stroke: "#111", "stroke-width": 1.5 }));
          }
          if (stat.err > 0) this.errorBar(ctx, bcx, my, yScale(stat.mean - stat.err), yScale(stat.mean + stat.err), o.errorDir, stat.mean >= 0);
          if (showPts) stat.reps.forEach((v, k) => {
            const jitter = stat.reps.length > 1 ? (((k % 5) - 2) / 2) * Math.min(barW * 0.3, 5) : 0;
            tagData(this.symbol(ctx.svg, bcx + jitter, yScale(v), st.color, st.symbol, st.symbolSize, st), sIdx);
          });
          dataTop = Math.min(dataTop, yScale(stat.mean + stat.err), ...(showPts ? stat.reps.map((v) => yScale(v)) : []));
        });
      });
      ctx.dataTopY = isFinite(dataTop) ? dataTop : ctx.m.top + ctx.plotH * 0.1;
      this.renderStars(ctx, graph, xAt, yScale, yMax);
      const legendNames = colorByCat ? xCats : sNames;
      this.legend(ctx, legendNames.map((f, i) => {
        const st = this.seriesStyle(o, i);
        return gstyle === "scatter"
          ? { label: f, color: st.color, kind: "symbol", symbol: st.symbol, filled: st.symbolFilled, border: st.symbolBorder, symbolSize: st.symbolSize }
          : { label: f, color: st.color };
      }));
    },

    // ---- Survival ---------------------------------------------------------
    renderSurvival(ctx) {
      const { o, table, svg, m, plotW, plotH } = ctx;
      const groups = M.survivalGroups(table);
      const km = stats.kaplanMeier(groups);
      const maxT = Math.max(...km.curves.flatMap((c) => c.points.map((p) => p.time)));
      const xs = this.niceScale(0, maxT);
      const yScale = this.drawYAxis(ctx, 0, 100);
      const y0 = m.top + plotH;
      const xScale = (v) => m.left + ((v - 0) / (xs.max)) * plotW;
      svg.appendChild(el("line", { x1: m.left, y1: y0, x2: m.left + plotW, y2: y0, stroke: "#111", "stroke-width": o.axisWidth }));
      const xStepS = o.xTickStep > 0 ? o.xTickStep : xs.step;
      const sTickG = this.tickGroup(svg, o, "x");
      const sTkAttr = this.tickTextAttrs(o, "x");
      for (let v = 0; v <= xs.max + 1e-9; v += xStepS) {
        const px = xScale(v);
        svg.appendChild(el("line", { x1: px, y1: y0, x2: px, y2: y0 + 6, stroke: "#111", "stroke-width": o.axisWidth }));
        sTickG.appendChild(el("text", { x: px, y: y0 + 22, "text-anchor": "middle", ...sTkAttr }, this.fmtTick(v, o, o.xDecimals)));
      }
      this.xAxisTitle(ctx, "Time");
      km.curves.forEach((curve, ci) => {
        const c = this.color(o, ci);
        let d = `M ${xScale(0)} ${yScale(100)}`;
        let prev = 100;
        curve.points.forEach((p) => {
          const survPct = p.surv * 100;
          d += ` L ${xScale(p.time)} ${yScale(prev)} L ${xScale(p.time)} ${yScale(survPct)}`;
          prev = survPct;
        });
        svg.appendChild(el("path", { d, fill: "none", stroke: c, "stroke-width": o.lineWidth, "stroke-dasharray": dash(o.lineStyle) }));
      });
      this.legend(ctx, km.curves.map((c, i) => ({ label: c.name, color: this.color(o, i), kind: "line", lineWidth: o.lineWidth, lineStyle: o.lineStyle })));
    },

    // ---- Pie --------------------------------------------------------------
    renderPie(ctx) {
      const { o, table, svg } = ctx;
      const groups = M.columnGroups(table).filter((g) => g.values.length);
      const values = groups.map((g) => g.values.reduce((s, v) => s + v, 0));
      const total = values.reduce((s, v) => s + v, 0);
      const cx = ctx.m.left + ctx.plotW / 2, cy = ctx.m.top + ctx.plotH / 2;
      const r = Math.min(ctx.plotW, ctx.plotH) / 2 - 10;
      let a0 = -Math.PI / 2;
      values.forEach((v, i) => {
        const frac = v / total;
        const a1 = a0 + frac * 2 * Math.PI;
        const large = frac > 0.5 ? 1 : 0;
        const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
        const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
        tagData(svg.appendChild(el("path", { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, fill: this.color(o, i), stroke: "#fff", "stroke-width": 2 })), i);
        const am = (a0 + a1) / 2;
        svg.appendChild(el("text", { x: cx + (r * 0.65) * Math.cos(am), y: cy + (r * 0.65) * Math.sin(am), "text-anchor": "middle", "font-size": o.tickSize, fill: "#fff", "font-weight": "bold" }, `${Math.round(frac * 100)}%`));
        a0 = a1;
      });
      this.legend(ctx, groups.map((g, i) => ({ label: g.name, color: this.color(o, i) })));
    },

    // Each item: {label, color, kind}. kind = "bar" (color swatch, default),
    // "symbol" (marker shape), "lineSymbol" (line + marker), or "line".
    legend(ctx, items) {
      if (!ctx.o.showLegend) return;
      const { svg, o } = ctx;
      const baseX = o.width - ctx.m.right + 16;
      const baseY = ctx.m.top + 6;
      const x = o.legendX != null ? o.legendX : baseX;
      const y = o.legendY != null ? o.legendY : baseY;
      const g = el("g", { class: "op-legend", "data-legend": "1", transform: `translate(${x},${y})` });
      g.appendChild(el("rect", { x: -4, y: -14, width: 132, height: items.length * 22 + 6, fill: "transparent" }));
      let yy = 0;
      items.forEach((it) => {
        const cy = yy - 3;
        if (it.kind === "symbol" || it.kind === "lineSymbol") {
          if (it.kind === "lineSymbol") g.appendChild(el("line", { x1: -2, y1: cy, x2: 14, y2: cy, stroke: it.color, "stroke-width": it.lineWidth || 2, "stroke-dasharray": dash(it.lineStyle) }));
          this.symbol(g, 6, cy, it.color, it.symbol || "circle", Math.min(it.symbolSize || 10, 12), { symbolFilled: it.filled !== false, symbolBorder: it.border != null ? it.border : 0.75 });
        } else if (it.kind === "line") {
          g.appendChild(el("line", { x1: -2, y1: cy, x2: 14, y2: cy, stroke: it.color, "stroke-width": it.lineWidth || 2, "stroke-dasharray": dash(it.lineStyle) }));
        } else {
          g.appendChild(el("rect", { x: 0, y: yy - 9, width: 12, height: 12, fill: it.color, stroke: "#333", "stroke-width": 0.5 }));
        }
        g.appendChild(el("text", {
          x: 20, y: yy + 1, "font-size": o.legendSize,
          fill: o.legendColor || "#111",
          "font-weight": o.legendBold ? "bold" : null,
          "font-style": o.legendItalic ? "italic" : null,
        }, it.label));
        yy += 22;
      });
      svg.appendChild(g);
    },

    // ---- Annotations ------------------------------------------------------
    // Every annotation is a <g> containing the visible element (.op-shape) plus
    // a wide transparent "hit" element so it stays easy to click/drag even when
    // the visible stroke is very thin. Supports opacity, rounded corners,
    // arrowheads at either end, and text rotation.
    renderAnnotation(svg, a) {
      const g = el("g", { class: "op-annotation", "data-annid": a.id });
      if (a.opacity != null && a.opacity < 1) g.setAttribute("opacity", Math.max(0.05, a.opacity));
      const strokeW = a.strokeWidth || 2;
      const hitW = Math.max(strokeW + 12, 14);
      if (a.type === "text") {
        const t = el("text", { class: "op-shape", x: a.x, y: a.y, "font-size": a.size || 16, fill: a.color || "#111", "font-weight": a.bold ? "bold" : "normal", "font-style": a.italic ? "italic" : "normal", "font-family": a.font || null, "text-anchor": a.anchor || "start" }, a.text || "Text");
        if (a.rotate) t.setAttribute("transform", `rotate(${a.rotate} ${a.x} ${a.y})`);
        g.appendChild(t);
      } else if (a.type === "rect") {
        g.appendChild(el("rect", { class: "op-shape", x: a.x, y: a.y, width: a.w, height: a.h, rx: a.rx || null, fill: a.fill || "none", stroke: a.color || "#111", "stroke-width": strokeW, "stroke-dasharray": dash(a.dash) }));
        g.appendChild(el("rect", { class: "op-hit", x: a.x, y: a.y, width: a.w, height: a.h, fill: "none", stroke: "transparent", "stroke-width": hitW }));
      } else if (a.type === "ellipse") {
        g.appendChild(el("ellipse", { class: "op-shape", cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: Math.abs(a.w / 2), ry: Math.abs(a.h / 2), fill: a.fill || "none", stroke: a.color || "#111", "stroke-width": strokeW, "stroke-dasharray": dash(a.dash) }));
        g.appendChild(el("ellipse", { class: "op-hit", cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: Math.abs(a.w / 2), ry: Math.abs(a.h / 2), fill: "none", stroke: "transparent", "stroke-width": hitW }));
      } else if (a.type === "line" || a.type === "arrow") {
        const endArrow = a.type === "arrow" ? a.arrowEnd !== false : !!a.arrowEnd;
        g.appendChild(el("line", {
          class: "op-shape", x1: a.x, y1: a.y, x2: a.x2, y2: a.y2,
          stroke: a.color || "#111", "stroke-width": strokeW, "stroke-dasharray": dash(a.dash),
          "marker-end": endArrow ? "url(#op-arrow)" : null,
          "marker-start": a.arrowStart ? "url(#op-arrow)" : null,
        }));
        g.appendChild(el("line", { class: "op-hit", x1: a.x, y1: a.y, x2: a.x2, y2: a.y2, stroke: "transparent", "stroke-width": hitW }));
      } else {
        return;
      }
      svg.appendChild(g);
    },
  };
})();
