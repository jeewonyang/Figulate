/*
 * Figulate — statistical tests.
 * All functions operate on plain arrays of numbers and return structured
 * result objects consumed by the Results sheets. Attached to window.FG.stats.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const dist = FG.dist;
  const S = {};

  // ---- Basic helpers ------------------------------------------------------
  const clean = (arr) => arr.filter((x) => x !== null && x !== undefined && x !== "" && !isNaN(x)).map(Number);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  function variance(a, m) {
    if (a.length < 2) return NaN;
    m = m === undefined ? mean(a) : m;
    return a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  }
  const sd = (a) => Math.sqrt(variance(a));
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined)
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    return sorted[base];
  }
  S.clean = clean;
  S.mean = mean;
  S.sd = sd;
  S.sum = sum;
  S.variance = variance;

  const fmtP = (p) => {
    if (p === null || p === undefined || isNaN(p)) return "—";
    if (p < 0.0001) return "<0.0001";
    return p.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "");
  };
  S.fmtP = fmtP;
  S.pStars = (p) => (p < 0.0001 ? "****" : p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "ns");

  // ---- Descriptive statistics --------------------------------------------
  S.describe = function (raw) {
    const a = clean(raw);
    const n = a.length;
    const m = mean(a);
    const v = variance(a, m);
    const s = Math.sqrt(v);
    const sorted = [...a].sort((x, y) => x - y);
    const sem = s / Math.sqrt(n);
    const tcrit = n > 1 ? dist.tInv(0.975, n - 1) : NaN;
    const skewNum = a.reduce((acc, x) => acc + Math.pow(x - m, 3), 0) / n;
    const skew = skewNum / Math.pow(v * ((n - 1) / n), 1.5);
    const kurtNum = a.reduce((acc, x) => acc + Math.pow(x - m, 4), 0) / n;
    const kurt = kurtNum / Math.pow(v * ((n - 1) / n), 2) - 3;
    const allPos = a.every((x) => x > 0);
    const geoMean = allPos ? Math.exp(mean(a.map((x) => Math.log(x)))) : NaN;
    return {
      n,
      mean: m,
      median: quantile(sorted, 0.5),
      sd: s,
      sem,
      variance: v,
      min: sorted[0],
      max: sorted[n - 1],
      range: sorted[n - 1] - sorted[0],
      q1: quantile(sorted, 0.25),
      q3: quantile(sorted, 0.75),
      ci95lo: m - tcrit * sem,
      ci95hi: m + tcrit * sem,
      sum: sum(a),
      cv: (s / m) * 100,
      skewness: skew,
      kurtosis: kurt,
      geoMean,
      sortedValues: sorted,
    };
  };

  // ---- One-sample t test --------------------------------------------------
  S.oneSampleT = function (raw, mu0) {
    const a = clean(raw);
    const n = a.length;
    const m = mean(a);
    const s = sd(a);
    const sem = s / Math.sqrt(n);
    const t = (m - mu0) / sem;
    const df = n - 1;
    const p = dist.tTwoTail(t, df);
    return { test: "One-sample t test", n, mean: m, mu0, t, df, p, sd: s, sem };
  };

  // ---- Unpaired t test (Student & Welch) ---------------------------------
  S.unpairedT = function (raw1, raw2, opts = {}) {
    const a = clean(raw1),
      b = clean(raw2);
    const n1 = a.length,
      n2 = b.length;
    const m1 = mean(a),
      m2 = mean(b);
    const v1 = variance(a),
      v2 = variance(b);
    const diff = m1 - m2;
    let t, df, se;
    if (opts.welch) {
      se = Math.sqrt(v1 / n1 + v2 / n2);
      t = diff / se;
      df =
        Math.pow(v1 / n1 + v2 / n2, 2) /
        (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
    } else {
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
      se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
      t = diff / se;
      df = n1 + n2 - 2;
    }
    const p = dist.tTwoTail(t, df);
    const tcrit = dist.tInv(0.975, df);
    return {
      test: opts.welch ? "Welch's unpaired t test" : "Unpaired t test",
      n1, n2, mean1: m1, mean2: m2, diff, se, t, df, p,
      ci95lo: diff - tcrit * se, ci95hi: diff + tcrit * se,
      sd1: Math.sqrt(v1), sd2: Math.sqrt(v2),
    };
  };

  // ---- Paired t test ------------------------------------------------------
  S.pairedT = function (raw1, raw2) {
    const pairs = [];
    for (let i = 0; i < Math.min(raw1.length, raw2.length); i++) {
      const x = Number(raw1[i]),
        y = Number(raw2[i]);
      if (![raw1[i], raw2[i]].some((v) => v === null || v === "" || v === undefined || isNaN(v)))
        pairs.push([x, y]);
    }
    const diffs = pairs.map((p) => p[0] - p[1]);
    const n = diffs.length;
    const md = mean(diffs);
    const sdd = sd(diffs);
    const sem = sdd / Math.sqrt(n);
    const t = md / sem;
    const df = n - 1;
    const p = dist.tTwoTail(t, df);
    const tcrit = dist.tInv(0.975, df);
    return {
      test: "Paired t test", n, meanDiff: md, sdDiff: sdd, sem, t, df, p,
      ci95lo: md - tcrit * sem, ci95hi: md + tcrit * sem,
    };
  };

  // ---- Mann-Whitney U -----------------------------------------------------
  function rankData(values) {
    // values: [{v, key}] -> assign average ranks for ties
    const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  }
  S.mannWhitney = function (raw1, raw2) {
    const a = clean(raw1),
      b = clean(raw2);
    const all = a.concat(b);
    const ranks = rankData(all);
    const n1 = a.length,
      n2 = b.length;
    const R1 = sum(ranks.slice(0, n1));
    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);
    const mU = (n1 * n2) / 2;
    // tie correction
    const tieGroups = {};
    all.forEach((v, i) => (tieGroups[ranks[i]] = (tieGroups[ranks[i]] || 0) + 1));
    const N = n1 + n2;
    const tieSum = Object.values(tieGroups).reduce((s, t) => s + (t * t * t - t), 0);
    const sigU = Math.sqrt((n1 * n2 / (N * (N - 1))) * ((N * N * N - N) / 12 - tieSum / 12));
    const z = (U - mU) / sigU;
    const p = 2 * (1 - dist.normalCDF(Math.abs(z)));
    return { test: "Mann-Whitney test", n1, n2, U: U1, U2, sumRank1: R1, medianDiff: null, z, p };
  };

  // ---- Wilcoxon matched-pairs signed rank --------------------------------
  S.wilcoxon = function (raw1, raw2) {
    const diffs = [];
    for (let i = 0; i < Math.min(raw1.length, raw2.length); i++) {
      const d = Number(raw1[i]) - Number(raw2[i]);
      if (!isNaN(d) && d !== 0) diffs.push(d);
    }
    const n = diffs.length;
    const ranks = rankData(diffs.map((d) => Math.abs(d)));
    let Wpos = 0,
      Wneg = 0;
    diffs.forEach((d, i) => (d > 0 ? (Wpos += ranks[i]) : (Wneg += ranks[i])));
    const W = Math.min(Wpos, Wneg);
    const mW = (n * (n + 1)) / 4;
    const sigW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
    const z = (W - mW) / sigW;
    const p = 2 * (1 - dist.normalCDF(Math.abs(z)));
    return { test: "Wilcoxon matched-pairs signed rank test", n, Wpos, Wneg, W, z, p };
  };

  // ---- One-way ANOVA + post-hoc ------------------------------------------
  S.oneWayANOVA = function (groups, opts = {}) {
    // groups: [{name, values:[]}]
    const g = groups.map((grp) => ({ name: grp.name, a: clean(grp.values) })).filter((grp) => grp.a.length);
    const k = g.length;
    const N = g.reduce((s, grp) => s + grp.a.length, 0);
    const grandMean = sum(g.flatMap((grp) => grp.a)) / N;
    let ssBetween = 0,
      ssWithin = 0;
    g.forEach((grp) => {
      const m = mean(grp.a);
      ssBetween += grp.a.length * (m - grandMean) ** 2;
      ssWithin += grp.a.reduce((s, x) => s + (x - m) ** 2, 0);
    });
    const dfB = k - 1,
      dfW = N - k;
    const msB = ssBetween / dfB,
      msW = ssWithin / dfW;
    const F = msB / msW;
    const p = dist.fPvalue(F, dfB, dfW);
    const result = {
      test: "Ordinary one-way ANOVA", k, N, ssBetween, ssWithin,
      dfB, dfW, msB, msW, F, p,
      groups: g.map((grp) => ({ name: grp.name, n: grp.a.length, mean: mean(grp.a), sd: sd(grp.a) })),
      rSquared: ssBetween / (ssBetween + ssWithin),
    };
    // Multiple comparisons
    if (opts.posthoc && opts.posthoc !== "none") {
      result.comparisons = S.postHoc(g, msW, dfW, opts.posthoc);
      result.posthocName = opts.posthoc;
    }
    return result;
  };

  S.postHoc = function (g, msW, dfW, method) {
    const k = g.length;
    const pairs = [];
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) pairs.push([i, j]);
    const nComp = pairs.length;
    const comps = pairs.map(([i, j]) => {
      const gi = g[i],
        gj = g[j];
      const mi = mean(gi.a),
        mj = mean(gj.a);
      const diff = mi - mj;
      const ni = gi.a.length,
        nj = gj.a.length;
      let p, ciHalf, statLabel, stat;
      if (method === "tukey") {
        const se = Math.sqrt(msW * (1 / ni + 1 / nj) / 2);
        const q = Math.abs(diff) / se;
        p = dist.tukeyPvalue(q, k, dfW);
        const qcrit = dist.qtukey(0.95, k, dfW);
        ciHalf = qcrit * se;
        stat = q;
        statLabel = "q";
      } else {
        // t-based families: Bonferroni, Sidak, Holm-Sidak
        const se = Math.sqrt(msW * (1 / ni + 1 / nj));
        const t = Math.abs(diff) / se;
        const praw = dist.tTwoTail(t, dfW);
        stat = t;
        statLabel = "t";
        if (method === "bonferroni") {
          p = Math.min(1, praw * nComp);
          const tcrit = dist.tInv(1 - 0.05 / (2 * nComp), dfW);
          ciHalf = tcrit * se;
        } else if (method === "sidak") {
          p = 1 - Math.pow(1 - praw, nComp);
          const tcrit = dist.tInv(1 - (1 - Math.pow(0.95, 1 / nComp)) / 2, dfW);
          ciHalf = tcrit * se;
        } else {
          // holm-sidak: adjust after sorting (below)
          p = praw;
          ciHalf = null;
        }
      }
      return {
        pair: `${gi.name} vs ${gj.name}`, groupA: gi.name, groupB: gj.name,
        diff, stat, statLabel, p, ci95lo: ciHalf != null ? diff - ciHalf : null,
        ci95hi: ciHalf != null ? diff + ciHalf : null,
      };
    });
    if (method === "holm-sidak") {
      const order = comps.map((c, i) => i).sort((a, b) => comps[a].p - comps[b].p);
      order.forEach((idx, rank) => {
        const m = nComp - rank;
        comps[idx].pAdj = Math.min(1, 1 - Math.pow(1 - comps[idx].p, m));
      });
      // enforce monotonicity
      let running = 0;
      order.forEach((idx) => {
        running = Math.max(running, comps[idx].pAdj);
        comps[idx].p = running;
      });
    }
    comps.forEach((c) => (c.sig = c.p < 0.05));
    return comps;
  };

  // ---- Welch ANOVA --------------------------------------------------------
  S.welchANOVA = function (groups) {
    const g = groups.map((grp) => ({ name: grp.name, a: clean(grp.values) })).filter((grp) => grp.a.length > 1);
    const k = g.length;
    const w = g.map((grp) => grp.a.length / variance(grp.a));
    const sumW = sum(w);
    const xw = sum(g.map((grp, i) => w[i] * mean(grp.a))) / sumW;
    let num = 0;
    g.forEach((grp, i) => (num += w[i] * (mean(grp.a) - xw) ** 2));
    num /= k - 1;
    let denomSum = 0;
    g.forEach((grp, i) => {
      denomSum += ((1 - w[i] / sumW) ** 2) / (grp.a.length - 1);
    });
    const denom = 1 + (2 * (k - 2)) / (k * k - 1) * denomSum;
    const F = num / denom;
    const df1 = k - 1;
    const df2 = (k * k - 1) / (3 * denomSum);
    const p = dist.fPvalue(F, df1, df2);
    return { test: "Welch's ANOVA", k, F, df1, df2, p };
  };

  // ---- Kruskal-Wallis + Dunn's -------------------------------------------
  S.kruskalWallis = function (groups) {
    const g = groups.map((grp) => ({ name: grp.name, a: clean(grp.values) })).filter((grp) => grp.a.length);
    const k = g.length;
    const all = g.flatMap((grp) => grp.a);
    const N = all.length;
    const ranks = rankData(all);
    // rank sums per group
    let offset = 0;
    const rankSums = g.map((grp) => {
      const rs = sum(ranks.slice(offset, offset + grp.a.length));
      offset += grp.a.length;
      return rs;
    });
    let H = 0;
    g.forEach((grp, i) => (H += (rankSums[i] ** 2) / grp.a.length));
    H = (12 / (N * (N + 1))) * H - 3 * (N + 1);
    // tie correction
    const tieGroups = {};
    all.forEach((v, i) => (tieGroups[ranks[i]] = (tieGroups[ranks[i]] || 0) + 1));
    const tieSum = Object.values(tieGroups).reduce((s, t) => s + (t ** 3 - t), 0);
    const C = 1 - tieSum / (N ** 3 - N);
    H = H / C;
    const df = k - 1;
    const p = dist.chi2Pvalue(H, df);
    // Dunn's test
    const meanRanks = g.map((grp, i) => rankSums[i] / grp.a.length);
    const pairs = [];
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) {
        const se = Math.sqrt(((N * (N + 1)) / 12 - tieSum / (12 * (N - 1))) * (1 / g[i].a.length + 1 / g[j].a.length));
        const z = (meanRanks[i] - meanRanks[j]) / se;
        const praw = 2 * (1 - dist.normalCDF(Math.abs(z)));
        pairs.push({
          pair: `${g[i].name} vs ${g[j].name}`, groupA: g[i].name, groupB: g[j].name,
          z, p: Math.min(1, praw * ((k * (k - 1)) / 2)),
        });
      }
    pairs.forEach((c) => (c.sig = c.p < 0.05));
    return { test: "Kruskal-Wallis test", k, N, H, df, p, comparisons: pairs, meanRanks, groups: g.map((grp) => grp.name) };
  };

  // ---- Two-way ANOVA (equal replication, with interaction) ---------------
  S.twoWayANOVA = function (cells) {
    // cells: { rowFactors:[], colFactors:[], data: matrix[r][c] = [replicates] }
    const rows = cells.rowFactors,
      cols = cells.colFactors;
    const R = rows.length,
      C = cols.length;
    const data = cells.data;
    let n = Infinity;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) n = Math.min(n, clean(data[i][j]).length);
    const all = [];
    const cellMeans = [];
    for (let i = 0; i < R; i++) {
      cellMeans[i] = [];
      for (let j = 0; j < C; j++) {
        const c = clean(data[i][j]);
        cellMeans[i][j] = mean(c);
        all.push(...c);
      }
    }
    const N = all.length;
    const grand = mean(all);
    // marginal means
    const rowMeans = rows.map((_, i) => {
      const vals = [];
      for (let j = 0; j < C; j++) vals.push(...clean(data[i][j]));
      return mean(vals);
    });
    const colMeans = cols.map((_, j) => {
      const vals = [];
      for (let i = 0; i < R; i++) vals.push(...clean(data[i][j]));
      return mean(vals);
    });
    let ssRow = 0,
      ssCol = 0,
      ssInter = 0,
      ssWithin = 0;
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        const c = clean(data[i][j]);
        c.forEach((x) => (ssWithin += (x - cellMeans[i][j]) ** 2));
        ssInter += c.length * (cellMeans[i][j] - rowMeans[i] - colMeans[j] + grand) ** 2;
      }
    }
    rows.forEach((_, i) => {
      let ni = 0;
      for (let j = 0; j < C; j++) ni += clean(data[i][j]).length;
      ssRow += ni * (rowMeans[i] - grand) ** 2;
    });
    cols.forEach((_, j) => {
      let nj = 0;
      for (let i = 0; i < R; i++) nj += clean(data[i][j]).length;
      ssCol += nj * (colMeans[j] - grand) ** 2;
    });
    const dfRow = R - 1,
      dfCol = C - 1,
      dfInter = (R - 1) * (C - 1),
      dfWithin = N - R * C;
    const msRow = ssRow / dfRow,
      msCol = ssCol / dfCol,
      msInter = ssInter / dfInter,
      msWithin = ssWithin / dfWithin;
    const mk = (ss, df, ms) => {
      const F = ms / msWithin;
      return { ss, df, ms, F, p: dist.fPvalue(F, df, dfWithin) };
    };
    return {
      test: "Two-way ANOVA",
      rowFactor: cells.rowName || "Row factor",
      colFactor: cells.colName || "Column factor",
      row: mk(ssRow, dfRow, msRow),
      col: mk(ssCol, dfCol, msCol),
      interaction: mk(ssInter, dfInter, msInter),
      residual: { ss: ssWithin, df: dfWithin, ms: msWithin },
      N,
    };
  };

  // ---- Multiple t tests (one comparison per row) -------------------------
  // Compares two columns (conditions) within each row of a Grouped table, then
  // corrects the family of per-row P values for multiplicity
  // ("multiple t tests — one per row").
  //   cells: from M.groupedCells → { rowFactors, colFactors, data[r][c]=[reps] }
  //   opts:  { colA, colB (positions in colFactors), paired, welch, correction }
  //   correction: "holm-sidak" | "bonferroni" | "fdr-bh" | "fdr-bky" | "none"
  S.multipleTTests = function (cells, opts = {}) {
    const ca = opts.colA != null ? opts.colA : 0;
    const cb = opts.colB != null ? opts.colB : 1;
    const method = opts.correction || "holm-sidak";
    const paired = !!opts.paired, welch = !!opts.welch;
    const Q = 0.05;
    const nameA = cells.colFactors[ca] || "Column A";
    const nameB = cells.colFactors[cb] || "Column B";
    const tests = cells.rowFactors.map((rf, ri) => {
      const rawA = (cells.data[ri] && cells.data[ri][ca]) || [];
      const rawB = (cells.data[ri] && cells.data[ri][cb]) || [];
      const A = clean(rawA), B = clean(rawB);
      let res = null;
      if (paired) { if (Math.min(rawA.length, rawB.length) >= 2) res = S.pairedT(rawA, rawB); }
      else if (A.length >= 2 && B.length >= 2) res = S.unpairedT(A, B, { welch });
      const diff = res ? (res.diff != null ? res.diff : res.meanDiff) : (mean(A) - mean(B));
      return {
        row: rf, rowIndex: ri, meanA: mean(A), meanB: mean(B), nA: A.length, nB: B.length,
        diff, t: res ? res.t : null, df: res ? res.df : null, p: res ? res.p : null,
        tested: !!res, padj: null, sig: false,
      };
    });
    const tested = tests.filter((t) => t.tested && isFinite(t.p));
    applyCorrection(tested, method, Q);
    return {
      test: "Multiple t tests — one per row",
      colA: ca, colB: cb, nameA, nameB, paired, welch, correction: method, Q,
      m: tested.length, nSig: tests.filter((t) => t.sig).length, tests,
    };
  };

  // Adjust a family of P values in place. Each item gets `.padj` (adjusted P or
  // FDR q value) and `.sig` (rejected / declared a discovery). `tested` are the
  // items that actually produced a P value; corrections use m = tested.length.
  function applyCorrection(tested, method, Q) {
    const m = tested.length;
    if (!m) return;
    if (method === "bonferroni") {
      tested.forEach((t) => { t.padj = Math.min(1, t.p * m); t.sig = t.padj < 0.05; });
      return;
    }
    if (method === "none") {
      tested.forEach((t) => { t.padj = t.p; t.sig = t.p < 0.05; });
      return;
    }
    const order = tested.map((_, i) => i).sort((a, b) => tested[a].p - tested[b].p);
    if (method === "holm-sidak") {
      let running = 0;
      order.forEach((idx, rank) => {
        const k = m - rank;                                  // # still being tested
        running = Math.max(running, 1 - Math.pow(1 - tested[idx].p, k));
        tested[idx].padj = Math.min(1, running);
        tested[idx].sig = tested[idx].padj < 0.05;
      });
      return;
    }
    // FDR families: compute Benjamini-Hochberg step-up q values for display.
    let prev = 1;
    for (let rank = m - 1; rank >= 0; rank--) {
      const idx = order[rank];
      prev = Math.min(prev, (tested[idx].p * m) / (rank + 1));
      tested[idx].padj = Math.min(1, prev);
    }
    if (method === "fdr-bky") {
      // Two-stage step-up of Benjamini, Krieger & Yekutieli (2006).
      const threshRejections = (level) => {
        let R = 0;
        for (let rank = 0; rank < m; rank++) if (tested[order[rank]].p <= ((rank + 1) / m) * level) R = rank + 1;
        return R;
      };
      const q1 = Q / (1 + Q);
      const R1 = threshRejections(q1);
      let discoveries;
      if (R1 === 0) discoveries = 0;
      else if (R1 === m) discoveries = m;
      else discoveries = threshRejections(q1 * m / (m - R1));
      tested.forEach((t) => (t.sig = false));
      for (let rank = 0; rank < discoveries; rank++) tested[order[rank]].sig = true;
    } else {
      // Benjamini-Hochberg: reject where the q value ≤ Q.
      tested.forEach((t) => (t.sig = t.padj < Q));
    }
  }

  // ---- Correlation --------------------------------------------------------
  S.pearson = function (rawX, rawY) {
    const pairs = pairUp(rawX, rawY);
    const x = pairs.map((p) => p[0]),
      y = pairs.map((p) => p[1]);
    const n = x.length;
    const mx = mean(x),
      my = mean(y);
    let sxy = 0,
      sxx = 0,
      syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    const r = sxy / Math.sqrt(sxx * syy);
    const df = n - 2;
    const t = r * Math.sqrt(df / (1 - r * r));
    const p = dist.tTwoTail(t, df);
    // Fisher z CI
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const sez = 1 / Math.sqrt(n - 3);
    const zc = 1.959964;
    const lo = Math.tanh(z - zc * sez),
      hi = Math.tanh(z + zc * sez);
    return { test: "Pearson correlation", n, r, r2: r * r, p, ci95lo: lo, ci95hi: hi, df };
  };
  S.spearman = function (rawX, rawY) {
    const pairs = pairUp(rawX, rawY);
    const rx = rankData(pairs.map((p) => p[0]));
    const ry = rankData(pairs.map((p) => p[1]));
    const res = S.pearson(rx, ry);
    const n = pairs.length;
    const t = res.r * Math.sqrt((n - 2) / (1 - res.r * res.r));
    return { test: "Spearman correlation", n, rs: res.r, p: dist.tTwoTail(t, n - 2) };
  };
  function pairUp(rawX, rawY) {
    const out = [];
    for (let i = 0; i < Math.min(rawX.length, rawY.length); i++) {
      const x = Number(rawX[i]),
        y = Number(rawY[i]);
      if (![rawX[i], rawY[i]].some((v) => v === "" || v === null || v === undefined || isNaN(v)))
        out.push([x, y]);
    }
    return out;
  }
  S.pairUp = pairUp;

  // ---- Simple linear regression ------------------------------------------
  S.linearRegression = function (rawX, rawY) {
    const pairs = pairUp(rawX, rawY);
    const x = pairs.map((p) => p[0]),
      y = pairs.map((p) => p[1]);
    const n = x.length;
    const mx = mean(x),
      my = mean(y);
    let sxy = 0,
      sxx = 0,
      syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const ssReg = slope * sxy;
    const ssRes = syy - ssReg;
    const df = n - 2;
    const mse = ssRes / df;
    const seSlope = Math.sqrt(mse / sxx);
    const seInt = Math.sqrt(mse * (1 / n + (mx * mx) / sxx));
    const r2 = ssReg / syy;
    const tSlope = slope / seSlope;
    const pSlope = dist.tTwoTail(tSlope, df);
    const tcrit = dist.tInv(0.975, df);
    const F = ssReg / mse;
    return {
      test: "Simple linear regression", n, slope, intercept, r2,
      seSlope, seInt, df, pSlope, sy_x: Math.sqrt(mse),
      slopeCI: [slope - tcrit * seSlope, slope + tcrit * seSlope],
      interceptCI: [intercept - tcrit * seInt, intercept + tcrit * seInt],
      F, xMean: mx, xMin: Math.min(...x), xMax: Math.max(...x),
    };
  };

  // ---- Normality tests ----------------------------------------------------
  S.dagostino = function (raw) {
    const a = clean(raw);
    const n = a.length;
    const m = mean(a);
    const s2 = a.reduce((acc, x) => acc + (x - m) ** 2, 0) / n;
    const m3 = a.reduce((acc, x) => acc + (x - m) ** 3, 0) / n;
    const m4 = a.reduce((acc, x) => acc + (x - m) ** 4, 0) / n;
    const b1 = m3 / Math.pow(s2, 1.5);
    const b2 = m4 / (s2 * s2);
    // Skewness test (D'Agostino)
    const Y = b1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
    const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
    const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
    const delta = 1 / Math.sqrt(Math.log(Math.sqrt(W2)));
    const alpha = Math.sqrt(2 / (W2 - 1));
    const Zskew = delta * Math.log(Y / alpha + Math.sqrt((Y / alpha) ** 2 + 1));
    // Kurtosis test (Anscombe-Glynn)
    const meanB2 = (3 * (n - 1)) / (n + 1);
    const varB2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5));
    const x = (b2 - meanB2) / Math.sqrt(varB2);
    const sqrtBeta1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) * Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
    const A = 6 + (8 / sqrtBeta1) * (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 * sqrtBeta1)));
    const term = (1 - 2 / A) / (1 + x * Math.sqrt(2 / (A - 4)));
    const Zkurt = ((1 - 2 / (9 * A)) - Math.cbrt(term)) / Math.sqrt(2 / (9 * A));
    const K2 = Zskew * Zskew + Zkurt * Zkurt;
    const p = dist.chi2Pvalue(K2, 2);
    return { test: "D'Agostino-Pearson omnibus normality test", n, skewness: b1, kurtosis: b2 - 3, K2, p, passed: p > 0.05 };
  };

  // ---- Contingency: chi-square & Fisher exact (2x2) ----------------------
  S.chiSquare = function (table) {
    const R = table.length,
      C = table[0].length;
    const rowSums = table.map((r) => sum(r));
    const colSums = table[0].map((_, j) => sum(table.map((r) => r[j])));
    const total = sum(rowSums);
    let chi2 = 0;
    let expOk = true;
    for (let i = 0; i < R; i++)
      for (let j = 0; j < C; j++) {
        const e = (rowSums[i] * colSums[j]) / total;
        if (e < 5) expOk = false;
        chi2 += (table[i][j] - e) ** 2 / e;
      }
    const df = (R - 1) * (C - 1);
    const p = dist.chi2Pvalue(chi2, df);
    const res = { test: "Chi-square test", chi2, df, p, total, expectedWarning: !expOk };
    // Yates & Fisher for 2x2
    if (R === 2 && C === 2) {
      const [a, b] = table[0],
        [c, d] = table[1];
      const yates = (total * (Math.abs(a * d - b * c) - total / 2) ** 2) /
        (rowSums[0] * rowSums[1] * colSums[0] * colSums[1]);
      res.yatesChi2 = yates;
      res.yatesP = dist.chi2Pvalue(yates, 1);
      res.fisherP = fisherExact2x2(a, b, c, d);
      res.oddsRatio = (a * d) / (b * c);
      res.relativeRisk = (a / (a + b)) / (c / (c + d));
    }
    return res;
  };
  function logFact(n) {
    return dist.lgamma(n + 1);
  }
  function fisherExact2x2(a, b, c, d) {
    const n = a + b + c + d;
    const r1 = a + b,
      r2 = c + d,
      c1 = a + c,
      c2 = b + d;
    const logP = (x) => {
      const A = x,
        B = r1 - x,
        C = c1 - x,
        Dd = r2 - c1 + x;
      if (A < 0 || B < 0 || C < 0 || Dd < 0) return -Infinity;
      return (
        logFact(r1) + logFact(r2) + logFact(c1) + logFact(c2) -
        logFact(n) - logFact(A) - logFact(B) - logFact(C) - logFact(Dd)
      );
    };
    const pObs = logP(a);
    const xmin = Math.max(0, c1 - r2);
    const xmax = Math.min(r1, c1);
    let p = 0;
    for (let x = xmin; x <= xmax; x++) {
      const lp = logP(x);
      if (lp <= pObs + 1e-9) p += Math.exp(lp);
    }
    return Math.min(1, p);
  }
  S.fisherExact2x2 = fisherExact2x2;

  // ---- Survival: Kaplan-Meier & log-rank ---------------------------------
  S.kaplanMeier = function (groups) {
    // groups: [{name, subjects:[{time, event}]}]  event: 1=death, 0=censored
    const curves = groups.map((grp) => {
      const subs = grp.subjects.slice().sort((a, b) => a.time - b.time);
      let atRisk = subs.length;
      let surv = 1;
      const points = [{ time: 0, surv: 1, atRisk, events: 0 }];
      const times = [...new Set(subs.map((s) => s.time))].sort((a, b) => a - b);
      let median = null;
      times.forEach((t) => {
        const atThis = subs.filter((s) => s.time === t);
        const deaths = atThis.filter((s) => s.event === 1).length;
        const nRisk = subs.filter((s) => s.time >= t).length;
        if (deaths > 0) surv *= 1 - deaths / nRisk;
        points.push({ time: t, surv, atRisk: nRisk, events: deaths });
        if (median === null && surv <= 0.5) median = t;
      });
      return { name: grp.name, points, median, n: subs.length, events: subs.filter((s) => s.event === 1).length };
    });
    const res = { test: "Kaplan-Meier survival analysis", curves };
    if (groups.length === 2) res.logRank = logRank(groups);
    return res;
  };
  function logRank(groups) {
    const all = [];
    groups.forEach((g, gi) => g.subjects.forEach((s) => all.push({ ...s, group: gi })));
    const times = [...new Set(all.filter((s) => s.event === 1).map((s) => s.time))].sort((a, b) => a - b);
    let O1 = 0,
      E1 = 0,
      V = 0;
    times.forEach((t) => {
      const atRisk = all.filter((s) => s.time >= t);
      const n = atRisk.length;
      const d = all.filter((s) => s.time === t && s.event === 1).length;
      const n1 = atRisk.filter((s) => s.group === 0).length;
      const d1 = all.filter((s) => s.time === t && s.event === 1 && s.group === 0).length;
      O1 += d1;
      E1 += (d * n1) / n;
      if (n > 1) V += (d * (n1 / n) * (1 - n1 / n) * (n - d)) / (n - 1);
    });
    const chi2 = (O1 - E1) ** 2 / V;
    return { chi2, df: 1, p: dist.chi2Pvalue(chi2, 1), O1, E1 };
  }

  // ---- Nonlinear regression (Levenberg-Marquardt) -----------------------
  // Built-in models cover the equations most common in lab work. X for the
  // 4PL dose-response model is expected to be log(concentration).
  const NLMODELS = {
    exp_growth: {
      name: "Exponential growth", params: ["Y0", "k"],
      f: (p, x) => p[0] * Math.exp(p[1] * x),
      init: (x, y) => [Math.abs(y[0]) || 1, guessRate(x, y)],
      eq: (p) => `Y = ${g(p[0])} · e^(${g(p[1])}·X)`,
    },
    exp_decay: {
      name: "Exponential decay (one-phase)", params: ["Plateau", "Span", "k"],
      f: (p, x) => p[0] + p[1] * Math.exp(-p[2] * x),
      init: (x, y) => { const yl = Math.min(...y), yh = Math.max(...y); return [yl, yh - yl, Math.abs(guessRate(x, y)) || 0.5]; },
      eq: (p) => `Y = ${g(p[0])} + ${g(p[1])}·e^(−${g(p[2])}·X)`,
    },
    mm: {
      name: "Michaelis-Menten", params: ["Vmax", "Km"],
      f: (p, x) => (p[0] * x) / (p[1] + x),
      init: (x, y) => [Math.max(...y) * 1.2, (Math.max(...x) || 1) / 2],
      eq: (p) => `Y = ${g(p[0])}·X / (${g(p[1])} + X)`,
    },
    logistic4: {
      name: "Sigmoidal dose-response (4PL)", params: ["Bottom", "Top", "LogIC50", "HillSlope"],
      f: (p, x) => p[0] + (p[1] - p[0]) / (1 + Math.pow(10, (p[2] - x) * p[3])),
      init: (x, y) => [Math.min(...y), Math.max(...y), (Math.min(...x) + Math.max(...x)) / 2, 1],
      eq: (p) => `Bottom=${g(p[0])}, Top=${g(p[1])}, LogIC50=${g(p[2])}, Hill=${g(p[3])}`,
    },
    gaussian: {
      name: "Gaussian", params: ["Amplitude", "Mean", "SD"],
      f: (p, x) => p[0] * Math.exp(-0.5 * Math.pow((x - p[1]) / p[2], 2)),
      init: (x, y) => [Math.max(...y), x[y.indexOf(Math.max(...y))] || mean(x), (Math.max(...x) - Math.min(...x)) / 4 || 1],
      eq: (p) => `Amp=${g(p[0])}, Mean=${g(p[1])}, SD=${g(p[2])}`,
    },
    poly2: {
      name: "Second-order polynomial", params: ["B0", "B1", "B2"],
      f: (p, x) => p[0] + p[1] * x + p[2] * x * x,
      init: () => [1, 1, 0],
      eq: (p) => `Y = ${g(p[2])}·X² + ${g(p[1])}·X + ${g(p[0])}`,
    },
  };
  S.NLMODELS = NLMODELS;
  const g = (v) => (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e6 ? v.toExponential(3) : parseFloat(v.toFixed(4)).toString());
  function guessRate(x, y) {
    const n = x.length;
    if (n < 2) return 0.1;
    const span = (x[n - 1] - x[0]) || 1;
    return (y[n - 1] > y[0] ? 1 : -1) * (1 / span);
  }

  function solveLinear(A, b) {
    const n = b.length;
    const M2 = A.map((row, i) => row.concat(b[i]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M2[r][col]) > Math.abs(M2[piv][col])) piv = r;
      if (Math.abs(M2[piv][col]) < 1e-14) return null;
      [M2[col], M2[piv]] = [M2[piv], M2[col]];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M2[r][col] / M2[col][col];
        for (let c = col; c <= n; c++) M2[r][c] -= factor * M2[col][c];
      }
    }
    return M2.map((row, i) => row[n] / row[i]);
  }

  function fitLM(x, y, f, p0, maxIter = 200) {
    let p = p0.slice();
    let lambda = 1e-2;
    const m = p.length, n = x.length;
    const sse = (pp) => { let s = 0; for (let i = 0; i < n; i++) { const e = y[i] - f(pp, x[i]); s += e * e; } return s; };
    let chi = sse(p);
    for (let it = 0; it < maxIter; it++) {
      const JtJ = Array.from({ length: m }, () => new Array(m).fill(0));
      const Jtr = new Array(m).fill(0);
      for (let i = 0; i < n; i++) {
        const fi = f(p, x[i]);
        const e = y[i] - fi;
        const Ji = new Array(m);
        for (let k = 0; k < m; k++) {
          const dp = (Math.abs(p[k]) || 1) * 1e-6 + 1e-9;
          const pk = p.slice(); pk[k] += dp;
          Ji[k] = (f(pk, x[i]) - fi) / dp;
        }
        for (let a = 0; a < m; a++) { Jtr[a] += Ji[a] * e; for (let bcol = 0; bcol < m; bcol++) JtJ[a][bcol] += Ji[a] * Ji[bcol]; }
      }
      let improved = false;
      for (let tries = 0; tries < 14; tries++) {
        const A = JtJ.map((rowv, a) => rowv.map((v, bcol) => (a === bcol ? v * (1 + lambda) : v)));
        const dp = solveLinear(A, Jtr);
        if (!dp || dp.some((d) => !isFinite(d))) { lambda *= 10; continue; }
        const pnew = p.map((v, k) => v + dp[k]);
        const chinew = sse(pnew);
        if (chinew < chi) { p = pnew; chi = chinew; lambda = Math.max(lambda / 10, 1e-12); improved = true; break; }
        lambda *= 10;
      }
      if (!improved) break;
    }
    return { p, sse: chi };
  }

  S.nonlinearFit = function (rawX, rawY, modelKey) {
    const model = NLMODELS[modelKey];
    if (!model) return null;
    const pairs = pairUp(rawX, rawY);
    if (pairs.length < model.params.length + 1) return null;
    const x = pairs.map((pp) => pp[0]), y = pairs.map((pp) => pp[1]);
    const { p, sse: ss } = fitLM(x, y, model.f, model.init(x, y));
    const my = mean(y);
    const sstot = y.reduce((s, v) => s + (v - my) ** 2, 0);
    const r2 = sstot > 0 ? 1 - ss / sstot : NaN;
    const dfE = x.length - p.length;
    return {
      test: "Nonlinear regression",
      modelKey, modelName: model.name,
      paramNames: model.params, params: p,
      r2, sse: ss, sy_x: Math.sqrt(ss / Math.max(1, dfE)), n: x.length, df: dfE,
      equation: model.eq(p),
      predict: (xv) => model.f(p, xv),
      xMin: Math.min(...x), xMax: Math.max(...x),
    };
  };

  FG.stats = S;
})();
