# Figulate

A free, open-source scientific **graphing and statistics** application, built as
a dependency-free local web app with an optional Electron desktop shell.
The workflow: **Data Tables → Analyses → Results → Graphs**.

**v2.0** adds **AI-assisted auto-analysis** (bring your own API key — Claude,
ChatGPT or Gemini), offline column-type detection, and savable default graph
styles.

## Running it

**Get the code:**
```bash
git clone https://github.com/jeewonyang/Figulate.git
cd Figulate
```

**As a web app (no install, no dependencies):**
```bash
node dev-server.js      # serves http://localhost:5173
```
…or simply open `Figulate.html` in a browser.

**As a desktop app (Electron):**
```bash
npm install      # installs Electron (the only dependency, and only for this)
npm start
```

**Hosted (GitHub Pages):** the repo ships with a workflow
(`.github/workflows/pages.yml`) that publishes the site on every push to
`main` — enable it once under **Settings → Pages → Source: GitHub Actions**.
The app is fully client-side, so the hosted copy works exactly like a local one;
it can also be installed as a browser app (PWA) from the address bar.

**Run the test suite:**
```bash
npm test          # statistics checks vs. R/SciPy reference values + column-type detector checks
```

## What it does

### ✨ AI auto-analysis (v2.0)
Click **✨ AI Analyze** (or import a CSV/Excel/.pzfx file and accept the prompt)
and Figulate will, for any input dataframe:

1. **auto-detect each column's type** (numeric / integer / binary 0-1 /
   categorical / empty) and role (X, Y, time, event),
2. pick the right **table type** (Column, XY, Survival, Contingency, …)
   and convert the table,
3. run the statistics a scientist would reach for first (t test, one-way ANOVA
   + Tukey, linear regression, Kaplan–Meier + log-rank, chi-square, …), and
4. build a **publication-style graph** with sensible titles — including
   auto-placed significance brackets when comparisons are significant.

Everything it creates appears in the navigator and is fully undoable (Ctrl+Z).

- **Guide it instead of full auto-detect**: the AI Analyze dialog has an
  optional free-text box — tell it what you already know and it takes priority
  over auto-detection. Examples: *"fit a sigmoidal dose-response (4PL) curve"*,
  *"the two columns are paired before/after measurements"*, *"compare every
  group against Control"*, *"rows are time points, columns are treatments"*.
  (Free-text steering needs an AI key; the offline heuristics always auto-detect.)

- **Choose your AI** under **AI ⚙**: **Claude** (Opus 4.8, Sonnet 5, Haiku 4.5),
  **ChatGPT** (GPT-5.1, GPT-5, GPT-5 mini, GPT-4o) or **Gemini**
  (2.5 Pro / Flash / Flash-Lite) — plus a *custom model id* field for anything
  newer. You supply your own API key; it is stored only in your browser's
  localStorage and sent only to the provider you selected. A **Test connection**
  button verifies the key before you commit.
- **Works offline too**: with no API key configured, the same button falls back
  to built-in heuristics that detect column types and choose the table type,
  analysis and graph locally (nothing ever leaves your machine).
- Privacy note: when an AI provider is used, the column names and a small
  sample of cell values are sent to that provider to plan the analysis.

### 🧭 Resizable navigator (v2.0)
Drag the divider on the right edge of the left-hand navigator to widen it for
long table/analysis/graph names (double-click the divider to reset). The width
is remembered across sessions, and every item shows its full name on hover.

### 🎨 Default graph style (v2.0)
Style one graph the way you like it, then click **★ Set as default style** in
the inspector's Graph tab. The current fonts, text sizes, line widths, symbol
settings, error-bar style and colors are saved (in the browser) and applied to
every **new** graph. Companion buttons let you **apply the saved defaults to an
existing graph** or **reset to the built-in look**.

### Data tables
Column, Grouped, XY, Contingency, Survival, Parts of whole, and Multiple variables.
Each supports multiple datasets (columns), replicate **subcolumns**, editable row
labels, keyboard navigation, and add-row/add-column controls.

### Statistical analyses (all verified numerically)
The analysis menu adapts to the table type:

- **Descriptive statistics** — n, mean, SD, SEM, 95% CI, median, quartiles,
  min/max, range, CV%, skewness, kurtosis, geometric mean, sum.
- **Normality** — D'Agostino–Pearson omnibus test.
- **Two groups** — unpaired t test (Student & Welch), paired t test, one-sample
  t test, Mann–Whitney, Wilcoxon matched-pairs.
- **Three+ groups** — ordinary one-way ANOVA with multiple comparisons
  (**Tukey**, Holm–Šídák, Šídák, Bonferroni), Welch's ANOVA, Kruskal–Wallis with
  Dunn's test.
- **Two-way ANOVA** — row, column, and interaction effects.
- **Correlation** — Pearson (with 95% CI) and Spearman.
- **Regression** — simple linear regression (slope, intercept, R², CIs, P) and
  **nonlinear regression** (Levenberg–Marquardt curve fitting) with built-in
  models: exponential growth/decay, Michaelis–Menten, sigmoidal dose-response
  (4PL), Gaussian, and second-order polynomial. Fitted curves overlay the XY graph.
- **Contingency** — Pearson chi-square, Yates-corrected chi-square, Fisher's
  exact test (2×2), odds ratio, relative risk.
- **Survival** — Kaplan–Meier curves with median survival and the log-rank
  (Mantel–Cox) test.

Results are shown as formatted tables with P-values, significance
stars (`*/**/***/****`), and plain-language conclusions. Analyses re-run
automatically when the underlying data changes.

### Graphing
SVG-based engine rendering: scatter/column (mean ± SD/SEM, individual points),
bars, box-and-whisker, violin plots (KDE), XY (with connecting lines and linear
regression overlay), grouped bars, Kaplan–Meier step curves, and pie charts.

### Figure editor (right-hand inspector, tabbed)
The inspector is organized into **Graph / Axes / Data / Objects** tabs.
- **Axes** — Y (and, for XY, X) range, **log₁₀ scale**, tick interval, decimal
  places, number format (automatic / fixed / scientific / percentage), gridlines,
  axis line width, and tick length. Log axes draw proper decade ticks (with minor
  ticks) and clamp non-positive values.
- **Data → Per-series style** — each data series can override the global
  appearance: its own color, symbol shape/size, filled-vs-open, border width, and
  (XY) connect-line, line width, and line style. "Reset this series" restores the
  defaults.
- Shapes can be sent **behind or in front of the data** (Send to back /
  Bring to front, or a "Behind data points" toggle).

- **Fonts** — family plus independent, directly-typed point sizes for title,
  axis titles, ticks, and legend.
- **Figure size** — width/height and background color.
- **Data appearance** — plot style, error-bar type (SD/SEM/95% CI), symbol shape
  and size, **filled or open (unfilled) symbols with adjustable border width**,
  line width, connect-points, regression line, legend, gridlines.
- **Axis range** — auto or manual Y min/max.
- **Colors** — per-dataset color pickers.
- **Line styles** — solid, dashed, dotted, or dash-dot for plotted lines and shapes.
- **Movable everything** — the legend, **X/Y axis titles**, significance brackets,
  and shapes can all be selected and repositioned. Drag with the mouse, nudge with
  **arrow keys** (Shift = 10 px steps), and press **Delete** to remove.
- **Magnet snap** — a toggle (toolbar button or panel checkbox) that snaps a moving
  object's edges/centers to other objects, with pink alignment guides.
- **Shapes & text** — a vector-editor-style toolset:
  - **Draw** text, lines, arrows, rectangles, ellipses by picking a tool and
    dragging on the graph.
  - **Resize** by dragging square handles (endpoints for lines, corners for
    boxes) or by typing exact width/height/length/angle. Generous invisible hit
    areas keep even hairline-thin lines easy to select.
  - **Shift constraints:** Shift+drag moves purely horizontally/vertically;
    Shift+resize keeps aspect ratio (perfect squares/circles); Shift while drawing
    or resizing a line snaps it to 0/45/90°. Lines also have "Make horizontal /
    vertical" buttons.
  - **Multi-select** via Shift-click or a drag-box (marquee); **align**
    (left/right/center, top/bottom/middle), **distribute** evenly, and move the
    whole group together with the mouse or arrow keys.
  - **Arrange:** bring to front / send to back, **duplicate** (Ctrl+D), and
    copy/paste shapes (Ctrl+C / Ctrl+V).
  - **Properties:** color, opacity, fill, line width, line style, rounded-rectangle
    corner radius, arrowheads at either/both ends, and text rotation.
  - **Undo / redo** (Ctrl+Z / Ctrl+Y, plus toolbar buttons) across the whole project.
  - **Nudge** selected objects with arrow keys (Shift = 10 px), **Delete** to remove,
    **Esc** to cancel a draw / clear selection.
- **Significance brackets** — add stars manually or auto-generate them from the
  most recent ANOVA/t-test. Brackets are placed above the data automatically and
  can be dragged to any height.

### Data grid
Click a cell to edit; **click-drag to select a block** of cells and **Ctrl/Cmd+C**
to copy it as tab-separated text (pastes straight into Excel/Sheets). Pasting a
block from Excel fills cells starting at the focused one.

### Files & import/export
- Save/open projects as JSON. In Chrome/Edge (and the Electron app), **Save and
  the graph exports open a native "Save As" dialog** so you pick the folder and
  filename; other browsers fall back to a regular download.
- **Open… imports external data**: CSV/TSV/text, **Excel .xlsx** (read natively via
  the browser's built-in decompression — no libraries), and **.pzfx** (XML) files
  become new data tables.
- Export any graph as **SVG** (vector) or high-resolution **PNG** (3× scale).

## Architecture
```
Figulate.html         app shell + script load order
styles.css            UI styles
js/stats/
  distributions.js    normal, t, F, chi-square, incomplete beta/gamma, studentized range (Tukey)
  tests.js            all statistical tests
js/model.js           project + table model, data extraction per table type
js/ai/
  detect.js           offline column-type + table-type heuristics (AI fallback)
  ai.js               AI provider layer (Claude / OpenAI / Gemini) + settings dialog
  assistant.js        "AI Analyze": prompt building, plan validation, apply plan
js/graph/plot.js      SVG plotting engine + annotations + saved default styles
js/ui/
  grid.js             spreadsheet data editor
  analyze.js          analysis catalog + dispatch
  results.js          results renderer
  editor.js           graph inspector + annotation dragging
js/app.js             controller: navigator, views, modals, save/load, export
main.js               Electron desktop window
dev-server.js         zero-dependency static server
test/stats.test.js    numerical verification suite
test/detect.test.js   column-type / table-type detector suite
```

All statistical functions are pure numerical implementations with **no external
dependencies**; the test suite checks them against values from R/SciPy
(t-tests, ANOVA F, Tukey critical values from published tables, Fisher's exact,
chi-square, correlation, regression).

## License

MIT — see [LICENSE](LICENSE).
