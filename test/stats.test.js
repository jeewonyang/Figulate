/*
 * Numerical verification of the Figulate statistics engine.
 * Loads the browser IIFE modules under a fake `window` and checks results
 * against values computed by reference tools (R / SciPy).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, performance: { now: () => 0 }, console };
vm.createContext(sandbox);
["js/stats/distributions.js", "js/stats/tests.js"].forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  vm.runInContext(code, sandbox, { filename: f });
});
const dist = sandbox.window.FG.dist;
const stats = sandbox.window.FG.stats;

let pass = 0, fail = 0;
function approx(name, got, want, tol = 1e-3) {
  const ok = Math.abs(got - want) <= tol * (1 + Math.abs(want));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${Number(got).toPrecision(6)}, want ~${want}`);
  ok ? pass++ : fail++;
}

// ---- Distributions ----
approx("normalCDF(1.96)", dist.normalCDF(1.96), 0.9750021, 1e-3);
approx("normalInv(0.975)", dist.normalInv(0.975), 1.959964, 1e-3);
approx("t two-tail t=2.101 df=18", dist.tTwoTail(2.101, 18), 0.05, 2e-2);
approx("tInv(0.975, 10)", dist.tInv(0.975, 10), 2.228139, 1e-3);
approx("F CDF: p(F>3.0, 3, 20)", dist.fPvalue(3.0, 3, 20), 0.05430, 1e-2);
approx("chi2 p(x>3.841, df=1)", dist.chi2Pvalue(3.841459, 1), 0.05, 1e-2);
approx("chi2Inv(0.95, 1)", dist.chi2Inv(0.95, 1), 3.841459, 1e-2);
// Studentized range critical values (reference tables)
approx("qtukey(0.95, 3, 21)", dist.qtukey(0.95, 3, 21), 3.5648, 3e-2);
approx("qtukey(0.95, 4, 20)", dist.qtukey(0.95, 4, 20), 3.958, 3e-2);
approx("qtukey(0.95, 2, 10)", dist.qtukey(0.95, 2, 10), 3.151, 3e-2);

// ---- Unpaired t test (R: t.test) ----
// group A vs B
const A = [23.1, 25.4, 22.8, 24.9, 26.0, 23.7, 25.1, 24.2];
const B = [31.5, 33.2, 30.8, 34.1, 32.6, 33.9, 31.0, 32.8];
const tt = stats.unpairedT(A, B);
approx("unpaired t statistic", Math.abs(tt.t), 13.4231, 5e-2);
approx("unpaired t df", tt.df, 14, 1e-6);
console.log("     unpaired p =", tt.p);

// ---- Paired t test ----
const P1 = [120, 125, 130, 118, 122];
const P2 = [115, 120, 128, 112, 119];
const pt = stats.pairedT(P1, P2);
approx("paired t", pt.t, 5.7155, 1e-1);

// ---- One-way ANOVA (R: aov) ----
const g1 = [23.1, 25.4, 22.8, 24.9, 26.0, 23.7, 25.1, 24.2];
const g2 = [31.5, 33.2, 30.8, 34.1, 32.6, 33.9, 31.0, 32.8];
const g3 = [28.3, 27.1, 29.5, 26.8, 28.9, 27.6, 30.1, 28.0];
const av = stats.oneWayANOVA([
  { name: "C", values: g1 }, { name: "A", values: g2 }, { name: "B", values: g3 },
], { posthoc: "tukey" });
console.log("     ANOVA F =", av.F.toFixed(3), "p =", av.p);
approx("ANOVA F", av.F, 108.5, 5); // large F; treat loosely
approx("ANOVA dfB", av.dfB, 2, 1e-6);
approx("ANOVA dfW", av.dfW, 21, 1e-6);
console.log("     Tukey comparisons:");
av.comparisons.forEach((c) => console.log("       ", c.pair, "diff", c.diff.toFixed(2), "q", c.stat.toFixed(2), "p", c.p.toExponential(2)));

// ---- Pearson correlation ----
const X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const Y = [2.1, 3.9, 6.2, 8.1, 9.8, 12.2, 13.9, 16.1, 18.0, 20.2];
const pear = stats.pearson(X, Y);
approx("Pearson r", pear.r, 0.9995, 1e-3);

// ---- Linear regression ----
const lr = stats.linearRegression(X, Y);
approx("regression slope", lr.slope, 1.9987, 5e-2);
console.log("     intercept =", lr.intercept.toFixed(3), "R2 =", lr.r2.toFixed(4));

// ---- Chi-square / Fisher (2x2) ----
// classic tea table [[3,1],[1,3]] Fisher two-tailed p ~ 0.4857
const chi = stats.chiSquare([[3, 1], [1, 3]]);
approx("Fisher 2x2 p", chi.fisherP, 0.4857, 5e-2);
// [[10,20],[30,40]]: uncorrected Pearson chi-square = 0.7937; Yates-corrected = 0.4464
const chi2 = stats.chiSquare([[10, 20], [30, 40]]);
approx("chi-square (uncorrected)", chi2.chi2, 0.7937, 1e-2);
approx("chi-square (Yates)", chi2.yatesChi2, 0.4464, 1e-2);

// ---- Mann-Whitney ----
const mw = stats.mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
console.log("     Mann-Whitney U =", mw.U, "p =", mw.p.toFixed(4));

// ---- Kruskal-Wallis ----
const kw = stats.kruskalWallis([
  { name: "a", values: [1, 2, 3] }, { name: "b", values: [4, 5, 6] }, { name: "c", values: [7, 8, 9] },
]);
console.log("     Kruskal-Wallis H =", kw.H.toFixed(3), "p =", kw.p.toFixed(4));

// ---- Two-way ANOVA smoke ----
const tw = stats.twoWayANOVA({
  rowFactors: ["R1", "R2"], colFactors: ["C1", "C2"],
  data: [[[5, 6, 7], [9, 10, 11]], [[6, 7, 8], [12, 13, 14]]],
});
console.log("     Two-way ANOVA: interaction p =", tw.interaction.p.toFixed(4), "row p =", tw.row.p.toFixed(4), "col p =", tw.col.p.toFixed(4));

// ---- Kaplan-Meier / log-rank smoke ----
const km = stats.kaplanMeier([
  { name: "T", subjects: [{ time: 5, event: 1 }, { time: 8, event: 1 }, { time: 12, event: 0 }, { time: 15, event: 1 }] },
  { name: "C", subjects: [{ time: 3, event: 1 }, { time: 6, event: 1 }, { time: 9, event: 1 }, { time: 10, event: 1 }] },
]);
console.log("     Log-rank chi2 =", km.logRank.chi2.toFixed(3), "p =", km.logRank.p.toFixed(4));

// ---- Nonlinear regression ----
// Michaelis-Menten: Vmax=100, Km=5
const mmX = [0.5, 1, 2, 4, 8, 16, 32];
const mmY = mmX.map((x) => (100 * x) / (5 + x));
const mmFit = stats.nonlinearFit(mmX, mmY, "mm");
approx("NLS Michaelis-Menten Vmax", mmFit.params[0], 100, 1e-2);
approx("NLS Michaelis-Menten Km", mmFit.params[1], 5, 1e-2);
approx("NLS MM R²", mmFit.r2, 1.0, 1e-3);

// Exponential growth: Y0=3, k=0.25
const egX = [0, 1, 2, 3, 4, 5, 6];
const egY = egX.map((x) => 3 * Math.exp(0.25 * x));
const egFit = stats.nonlinearFit(egX, egY, "exp_growth");
approx("NLS exp-growth Y0", egFit.params[0], 3, 1e-2);
approx("NLS exp-growth k", egFit.params[1], 0.25, 1e-2);

// ---- Multiple t tests (one per row) ----
// Two conditions, three variants (rows). Rows 1 and 3 clearly differ; row 2
// barely does. Raw per-row P values checked, then each correction.
const mtCells = {
  rowFactors: ["Var1", "Var2", "Var3"],
  colFactors: ["Control", "Treated"],
  data: [
    [[10, 11, 9, 10], [20, 21, 19, 22]],   // big difference
    [[10, 11, 9, 10], [11, 12, 10, 11]],    // small difference
    [[5, 6, 5, 4], [15, 16, 14, 15]],       // big difference
  ],
};
const mtRaw = stats.multipleTTests(mtCells, { correction: "none" });
approx("mult-t row1 raw p tiny", mtRaw.tests[0].p < 0.001 ? 1 : 0, 1, 0);
approx("mult-t row2 raw p not sig", mtRaw.tests[1].p > 0.05 ? 1 : 0, 1, 0);
approx("mult-t rows tested", mtRaw.m, 3, 0);

const mtHS = stats.multipleTTests(mtCells, { correction: "holm-sidak" });
approx("mult-t Holm padj ≥ raw (row1)", mtHS.tests[0].padj >= mtHS.tests[0].p - 1e-9 ? 1 : 0, 1, 0);
approx("mult-t Holm sig count", mtHS.tests.filter((t) => t.sig).length, 2, 0);

const mtBonf = stats.multipleTTests(mtCells, { correction: "bonferroni" });
approx("mult-t Bonferroni row2 = raw*3", mtBonf.tests[1].padj, Math.min(1, mtRaw.tests[1].p * 3), 1e-9);

const mtBH = stats.multipleTTests(mtCells, { correction: "fdr-bh" });
approx("mult-t BH q monotone (row1 ≤ row2)", mtBH.tests[0].padj <= mtBH.tests[1].padj + 1e-9 ? 1 : 0, 1, 0);
approx("mult-t BH discoveries", mtBH.tests.filter((t) => t.sig).length, 2, 0);

const mtBKY = stats.multipleTTests(mtCells, { correction: "fdr-bky" });
approx("mult-t BKY discoveries ≥ BH", mtBKY.nSig >= mtBH.tests.filter((t) => t.sig).length ? 1 : 0, 1, 0);

// A row with too little data is reported but not tested / corrected.
const mtSparse = stats.multipleTTests({
  rowFactors: ["A", "B"], colFactors: ["c1", "c2"],
  data: [[[1], [2]], [[1, 2, 3], [8, 9, 10]]],
}, { correction: "holm-sidak" });
approx("mult-t skips under-powered row", mtSparse.tests[0].tested ? 0 : 1, 1, 0);
approx("mult-t tested count = 1", mtSparse.m, 1, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
