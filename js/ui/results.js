/*
 * Figulate — results renderer. Turns an analysis result into HTML.
 * window.FG.results
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const stats = FG.stats;

  const fmt = (x, d = 4) => {
    if (x === null || x === undefined || (typeof x === "number" && isNaN(x))) return "—";
    if (typeof x !== "number") return x;
    if (x !== 0 && (Math.abs(x) < 1e-4 || Math.abs(x) >= 1e6)) return x.toExponential(3);
    return parseFloat(x.toFixed(d)).toString();
  };
  const P = (p) => stats.fmtP(p);
  const sigTag = (p) => `<span class="pval ${p < 0.05 ? "sig-yes" : "sig-no"}">${P(p)}</span> <span class="stars">${stats.pStars(p)}</span>`;

  function row(cells, header) {
    return "<tr>" + cells.map((c, i) => `<${header && i === 0 ? "th" : "td"} class="${i === 0 ? "lbl" : ""}">${c}</${header && i === 0 ? "th" : "td"}>`).join("") + "</tr>";
  }
  function kvTable(pairs) {
    return `<table class="res">${pairs.map(([k, v]) => `<tr><td class="lbl">${k}</td><td>${v}</td></tr>`).join("")}</table>`;
  }

  FG.results = {
    render(container, analysis, table) {
      container.innerHTML = "";
      const self = this;
      const b = document.createElement("div");
      b.className = "result-block";
      const renderBody = () => {
        b.innerHTML = `<h2>${analysis.name}</h2><p class="sub">Data: ${table ? table.name : ""}</p>` + self.body(analysis, analysis.result);
      };
      // Editable parameter panel (when the analysis has adjustable options).
      if (table && FG.analyze && FG.analyze.buildParamEditor) {
        const panel = document.createElement("div");
        panel.className = "result-block param-panel";
        const built = FG.analyze.buildParamEditor(panel, analysis, table, renderBody);
        if (built) container.appendChild(panel);
      }
      container.appendChild(b);
      renderBody();
    },

    body(analysis, r) {
      const k = analysis.kind;
      if (k === "describe") return this.describe(r);
      if (k === "normality") return this.normality(r);
      if (k === "ttest" || k === "pairedt" || k === "onesample") return this.tTest(r);
      if (k === "mannwhitney") return this.mannWhitney(r);
      if (k === "wilcoxon") return this.wilcoxon(r);
      if (k === "anova") return this.anova(r);
      if (k === "welchanova") return this.welchAnova(r);
      if (k === "kruskal") return this.kruskal(r);
      if (k === "twoway") return this.twoWay(r);
      if (k === "multiplet") return this.multipleT(r);
      if (k === "pearson") return this.pearson(r);
      if (k === "spearman") return this.spearman(r);
      if (k === "linreg") return this.linreg(r);
      if (k === "nonlinreg") return this.nonlinreg(r);
      if (k === "chisquare") return this.chi(r);
      if (k === "km") return this.km(r);
      return "<p>No renderer.</p>";
    },

    describe(r) {
      const keys = [["n", "n"], ["mean", "Mean"], ["sd", "Std. Deviation"], ["sem", "Std. Error"], ["ci95lo", "95% CI lower"], ["ci95hi", "95% CI upper"], ["median", "Median"], ["q1", "25% percentile"], ["q3", "75% percentile"], ["min", "Minimum"], ["max", "Maximum"], ["range", "Range"], ["cv", "CV %"], ["skewness", "Skewness"], ["kurtosis", "Kurtosis"], ["geoMean", "Geometric mean"], ["sum", "Sum"]];
      let h = `<table class="res"><tr><th class="lbl">Statistic</th>${r.multi.map((m) => `<th>${m.name}</th>`).join("")}</tr>`;
      keys.forEach(([key, lab]) => {
        h += `<tr><td class="lbl">${lab}</td>${r.multi.map((m) => `<td>${fmt(m.d[key])}</td>`).join("")}</tr>`;
      });
      h += "</table>";
      return h;
    },

    normality(r) {
      let h = `<table class="res"><tr><th class="lbl">Column</th><th>Skewness</th><th>Excess kurtosis</th><th>K² </th><th>P value</th><th>Normal?</th></tr>`;
      r.multi.forEach((m) => {
        h += row([m.name, fmt(m.r.skewness), fmt(m.r.kurtosis), fmt(m.r.K2), sigTag(m.r.p), m.r.passed ? "Yes (P>0.05)" : "No"]);
      });
      h += "</table>";
      return h;
    },

    tTest(r) {
      const pairs = [["Test", r.test]];
      if (r.mean1 !== undefined) { pairs.push(["Mean of group A", fmt(r.mean1)], ["Mean of group B", fmt(r.mean2)], ["Difference between means", fmt(r.diff)]); }
      if (r.meanDiff !== undefined) pairs.push(["Mean of differences", fmt(r.meanDiff)]);
      if (r.mean !== undefined && r.mu0 !== undefined) pairs.push(["Sample mean", fmt(r.mean)], ["Hypothetical mean", fmt(r.mu0)]);
      if (r.se !== undefined) pairs.push(["SE of difference", fmt(r.se)]);
      if (r.ci95lo !== undefined) pairs.push(["95% CI", `${fmt(r.ci95lo)} to ${fmt(r.ci95hi)}`]);
      pairs.push(["t", fmt(r.t)], ["df", fmt(r.df, 2)], ["P value (two-tailed)", sigTag(r.p)]);
      return kvTable(pairs) + concl(r.p);
    },

    mannWhitney(r) {
      return kvTable([["Test", r.test], ["Mann-Whitney U", fmt(r.U)], ["Sum of ranks (A)", fmt(r.sumRank1)], ["z", fmt(r.z)], ["P value (two-tailed)", sigTag(r.p)]]) + concl(r.p);
    },
    wilcoxon(r) {
      return kvTable([["Test", r.test], ["Sum of positive ranks", fmt(r.Wpos)], ["Sum of negative ranks", fmt(r.Wneg)], ["W", fmt(r.W)], ["z", fmt(r.z)], ["P value (two-tailed)", sigTag(r.p)]]) + concl(r.p);
    },

    anova(r) {
      let h = `<h3>ANOVA table</h3><table class="res">
        <tr><th class="lbl">Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>P value</th></tr>
        ${row(["Between groups (treatment)", fmt(r.ssBetween), r.dfB, fmt(r.msB), fmt(r.F), sigTag(r.p)])}
        ${row(["Within groups (residual)", fmt(r.ssWithin), r.dfW, fmt(r.msW), "", ""])}
        ${row(["Total", fmt(r.ssBetween + r.ssWithin), r.dfB + r.dfW, "", "", ""])}
      </table>`;
      h += `<div class="callout">R² = ${fmt(r.rSquared)}. F(${r.dfB}, ${r.dfW}) = ${fmt(r.F)}, ${P(r.p) === "<0.0001" ? "P < 0.0001" : "P = " + P(r.p)}.</div>`;
      h += `<h3>Group summary</h3><table class="res"><tr><th class="lbl">Group</th><th>n</th><th>Mean</th><th>SD</th></tr>${r.groups.map((g) => row([g.name, g.n, fmt(g.mean), fmt(g.sd)])).join("")}</table>`;
      if (r.comparisons) h += this.comparisons(r.comparisons, r.posthocName);
      return h;
    },

    comparisons(comps, name) {
      const label = { tukey: "Tukey's", "holm-sidak": "Holm-Šídák", sidak: "Šídák", bonferroni: "Bonferroni" }[name] || name;
      let h = `<h3>Multiple comparisons — ${label}</h3><table class="res"><tr><th class="lbl">Comparison</th><th>Mean diff.</th><th>95% CI</th><th>${comps[0].statLabel || ""}</th><th>Adj. P value</th><th>Summary</th></tr>`;
      comps.forEach((c) => {
        const ci = c.ci95lo != null ? `${fmt(c.ci95lo)} to ${fmt(c.ci95hi)}` : "—";
        h += row([c.pair, fmt(c.diff), ci, fmt(c.stat, 3), sigTag(c.p), stats.pStars(c.p)]);
      });
      h += "</table>";
      return h;
    },

    welchAnova(r) { return kvTable([["Test", r.test], ["F", fmt(r.F)], ["df numerator", fmt(r.df1)], ["df denominator", fmt(r.df2, 2)], ["P value", sigTag(r.p)]]) + concl(r.p); },

    kruskal(r) {
      let h = kvTable([["Test", r.test], ["Kruskal-Wallis H", fmt(r.H)], ["df", r.df], ["P value", sigTag(r.p)]]) + concl(r.p);
      if (r.comparisons && r.comparisons.length) {
        h += `<h3>Dunn's multiple comparisons</h3><table class="res"><tr><th class="lbl">Comparison</th><th>z</th><th>Adj. P value</th><th>Summary</th></tr>`;
        r.comparisons.forEach((c) => h += row([c.pair, fmt(c.z, 3), sigTag(c.p), stats.pStars(c.p)]));
        h += "</table>";
      }
      return h;
    },

    multipleT(r) {
      const corrName = { "holm-sidak": "Holm-Šídák", bonferroni: "Bonferroni", "fdr-bh": "Benjamini-Hochberg FDR", "fdr-bky": "Two-stage FDR (BKY)", none: "None" }[r.correction] || r.correction;
      const isFDR = r.correction === "fdr-bh" || r.correction === "fdr-bky";
      const adjCol = r.correction === "none" ? "P value" : isFDR ? "q value" : "Adjusted P";
      const kind = r.paired ? "Paired" : r.welch ? "Welch's unpaired" : "Unpaired";
      let h = `<p class="sub">${kind} t test of <b>${r.nameA}</b> vs <b>${r.nameB}</b> in each row. Correction: ${corrName}. ${r.m} row(s) tested, ${r.nSig} ${isFDR ? "discovery(ies)" : "significant"}.</p>`;
      h += `<table class="res"><tr><th class="lbl">Row</th><th>Mean ${r.nameA}</th><th>Mean ${r.nameB}</th><th>Difference</th><th>t</th><th>df</th><th>${adjCol}</th><th>Significant?</th></tr>`;
      r.tests.forEach((t) => {
        if (!t.tested) { h += row([t.row, fmt(t.meanA), fmt(t.meanB), fmt(t.diff), "—", "—", "not tested", "—"]); return; }
        const padj = t.padj != null ? t.padj : t.p;
        const pcell = `<span class="pval ${t.sig ? "sig-yes" : "sig-no"}">${P(padj)}</span>`;
        h += row([t.row, fmt(t.meanA), fmt(t.meanB), fmt(t.diff), fmt(t.t, 3), fmt(t.df, 2), pcell, t.sig ? `Yes <span class="stars">${starOrMark(padj)}</span>` : "No"]);
      });
      h += "</table>";
      h += `<div class="callout">${r.nSig} of ${r.m} comparison(s) ${isFDR ? `declared discoveries at Q = ${r.Q * 100}%` : "significant at α = 0.05"}. On a grouped graph of this table, use <b>Objects → Auto from multiple t-tests</b> to star the significant rows.</div>`;
      return h;
    },

    twoWay(r) {
      const src = (lab, s) => row([lab, fmt(s.ss), s.df, fmt(s.ms), fmt(s.F), sigTag(s.p)]);
      let h = `<table class="res"><tr><th class="lbl">Source of variation</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>P value</th></tr>
        ${src("Interaction", r.interaction)}
        ${src(r.rowFactor + " (rows)", r.row)}
        ${src(r.colFactor + " (columns)", r.col)}
        ${row(["Residual", fmt(r.residual.ss), r.residual.df, fmt(r.residual.ms), "", ""])}
      </table>`;
      h += `<div class="callout">Interaction: ${P(r.interaction.p)} ${stats.pStars(r.interaction.p)}. Row factor: ${P(r.row.p)}. Column factor: ${P(r.col.p)}.</div>`;
      return h;
    },

    pearson(r) { return kvTable([["Test", r.test], ["n (pairs)", r.n], ["Pearson r", fmt(r.r)], ["R²", fmt(r.r2)], ["95% CI for r", `${fmt(r.ci95lo)} to ${fmt(r.ci95hi)}`], ["P value (two-tailed)", sigTag(r.p)]]) + concl(r.p); },
    spearman(r) { return kvTable([["Test", r.test], ["n (pairs)", r.n], ["Spearman rₛ", fmt(r.rs)], ["P value (two-tailed)", sigTag(r.p)]]) + concl(r.p); },

    linreg(r) {
      let h = kvTable([
        ["Slope", `${fmt(r.slope)} ± ${fmt(r.seSlope)}`],
        ["Y-intercept", `${fmt(r.intercept)} ± ${fmt(r.seInt)}`],
        ["95% CI slope", `${fmt(r.slopeCI[0])} to ${fmt(r.slopeCI[1])}`],
        ["R²", fmt(r.r2)],
        ["Sy.x", fmt(r.sy_x)],
        ["n", r.n],
        ["P value (slope ≠ 0)", sigTag(r.pSlope)],
      ]);
      h += `<div class="callout">Best-fit line: Y = ${fmt(r.slope)}·X ${r.intercept >= 0 ? "+" : "−"} ${fmt(Math.abs(r.intercept))}</div>`;
      return h;
    },

    nonlinreg(r) {
      if (!r) return `<div class="warn">Could not fit — check that there are enough (X, Y) points for this model.</div>`;
      let h = `<h3>Model: ${r.modelName}</h3>`;
      h += `<table class="res"><tr><th class="lbl">Parameter</th><th>Best-fit value</th></tr>`;
      r.paramNames.forEach((name, i) => h += row([name, fmt(r.params[i])]));
      h += "</table>";
      h += kvTable([
        ["R²", fmt(r.r2)],
        ["Sy.x (RMSE)", fmt(r.sy_x)],
        ["Sum of squares", fmt(r.sse)],
        ["n (points)", r.n],
        ["df", r.df],
      ]);
      h += `<div class="callout">${r.equation}</div>`;
      h += `<div class="callout" style="background:#eef5fc">Turn on <b>Nonlinear fit</b> in the graph editor to overlay this curve on the XY graph.</div>`;
      return h;
    },

    chi(r) {
      let h = kvTable([["Test", "Pearson chi-square"], ["Chi-square", fmt(r.chi2)], ["df", r.df], ["P value", sigTag(r.p)]]);
      if (r.yatesP !== undefined) {
        h += `<h3>2×2 table</h3>` + kvTable([
          ["Chi-square (Yates' corrected)", `${fmt(r.yatesChi2)}, P = ${P(r.yatesP)}`],
          ["Fisher's exact test (two-tailed)", sigTag(r.fisherP)],
          ["Odds ratio", fmt(r.oddsRatio)],
          ["Relative risk", fmt(r.relativeRisk)],
        ]);
      }
      if (r.expectedWarning) h += `<div class="warn">Some expected counts are &lt; 5. Prefer Fisher's exact test.</div>`;
      return h + concl(r.p);
    },

    km(r) {
      let h = `<table class="res"><tr><th class="lbl">Group</th><th>n</th><th>Events</th><th>Median survival</th></tr>`;
      r.curves.forEach((c) => h += row([c.name, c.n, c.events, c.median === null ? "Undefined" : fmt(c.median)]));
      h += "</table>";
      if (r.logRank) h += `<h3>Log-rank (Mantel-Cox) test</h3>` + kvTable([["Chi-square", fmt(r.logRank.chi2)], ["df", r.logRank.df], ["P value", sigTag(r.logRank.p)]]) + concl(r.logRank.p);
      return h;
    },
  };

  // Stars for a significant result; falls back to "*" when the (FDR) adjusted
  // value rounds above 0.05 but the row was still declared a discovery.
  function starOrMark(p) { const s = stats.pStars(p); return s === "ns" ? "*" : s; }

  function concl(p) {
    const sig = p < 0.05;
    return `<div class="callout">The difference/association is <b>${sig ? "statistically significant" : "not statistically significant"}</b> at α = 0.05 (P ${P(p) === "<0.0001" ? "< 0.0001" : "= " + P(p)}).</div>`;
  }
})();
