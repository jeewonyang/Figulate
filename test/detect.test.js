/*
 * Verification of the offline column-type / table-type detector (js/ai/detect.js).
 * Loads the browser IIFE module under a fake `window`, like test/stats.test.js.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, console };
vm.createContext(sandbox);
["js/ai/detect.js"].forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  vm.runInContext(code, sandbox, { filename: f });
});
const detect = sandbox.window.FG.detect;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// ---- Column classification ----
eq("numeric column", detect.classifyColumn(["1.2", "3.4", "5"]), "numeric");
eq("integer column", detect.classifyColumn(["1", "2", "30"]), "integer");
eq("binary column", detect.classifyColumn(["0", "1", "1", "0"]), "binary");
eq("categorical column", detect.classifyColumn(["ctrl", "drug", "drug"]), "categorical");
eq("empty column", detect.classifyColumn(["", "", ""]), "empty");
eq("mostly numeric tolerates stray text", detect.classifyColumn(["1", "2", "3", "4", "5", "6", "7", "8", "9", "n/a"]), "integer");

// ---- Table type suggestions ----
const col = (title, values) => ({ title, values });

// Three numeric groups → column table
const groups = detect.suggestTableType([
  col("Control", ["23.1", "25.4", "22.8"]),
  col("Drug A", ["31.5", "33.2", "30.8"]),
  col("Drug B", ["28.3", "27.1", "29.5"]),
]);
eq("3 numeric groups → column", groups.tableType, "column");

// Ordered X + numeric Y → xy
const xy = detect.suggestTableType([
  col("Dose", ["0", "1", "2", "3", "4", "5", "6"]),
  col("Response", ["4.1", "6.2", "9.0", "11.5", "13.9", "16.2", "19.1"]),
]);
eq("ordered X + numeric Y → xy", xy.tableType, "xy");
eq("xy first column role is X", xy.columns[0].role, "X");

// Time + 0/1 events → survival
const surv = detect.suggestTableType([
  col("Days", ["5", "8", "12", "20", "31", "40"]),
  col("Group A", ["1", "1", "0", "1", "0", "1"]),
  col("Group B", ["1", "0", "1", "1", "1", "0"]),
]);
eq("time + 0/1 events → survival", surv.tableType, "survival");
eq("survival col0 role is time", surv.columns[0].role, "time");

// Small labelled integer counts → contingency
const cont = detect.suggestTableType(
  [col("Cured", ["12", "5"]), col("Not cured", ["3", "10"])],
  { rowLabels: ["Treated", "Placebo"] }
);
eq("labelled integer counts → contingency", cont.tableType, "contingency");

// Mixed text + numbers → multiple variables
const mixed = detect.suggestTableType([
  col("Subject", ["mouse-1", "mouse-2", "mouse-3"]),
  col("Weight", ["21.2", "23.9", "20.4"]),
]);
eq("mixed text + numbers → multiple", mixed.tableType, "multiple");

// ---- Plans ----
eq("3 groups → ANOVA", detect.suggestPlan("column", 3).analyses.some((a) => a.kind === "anova"), true);
eq("2 groups → t test", detect.suggestPlan("column", 2).analyses.some((a) => a.kind === "ttest"), true);
eq("xy → linear regression", detect.suggestPlan("xy", 1).analyses[0].kind, "linreg");
eq("survival → Kaplan-Meier", detect.suggestPlan("survival", 2).analyses[0].kind, "km");
eq("xy plan graph kind", detect.suggestPlan("xy", 1).graph.kind, "xy");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
