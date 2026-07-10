/*
 * Figulate — statistical distribution functions.
 * Pure numerical implementations (no dependencies) of the special functions and
 * distributions needed for the analyses: Normal, Student's t, F, Chi-square,
 * and the Studentized range (for Tukey's test).
 *
 * Everything is attached to window.FG.dist.
 */
(function () {
  const FG = (window.FG = window.FG || {});
  const D = {};

  // ---- Log-gamma (Lanczos approximation) ---------------------------------
  const LANCZOS = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  function lgamma(x) {
    if (x < 0.5) {
      // Reflection formula
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    }
    x -= 1;
    let a = 0.99999999999980993;
    const t = x + 7.5;
    for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  D.lgamma = lgamma;
  D.gammaln = lgamma;

  function logBeta(a, b) {
    return lgamma(a) + lgamma(b) - lgamma(a + b);
  }

  // ---- Error function -----------------------------------------------------
  function erf(x) {
    // Abramowitz & Stegun 7.1.26, refined with sign handling.
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x);
    return sign * y;
  }
  D.erf = erf;
  D.erfc = (x) => 1 - erf(x);

  // ---- Regularized lower incomplete gamma P(a,x) --------------------------
  function gammap(a, x) {
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 0;
    if (x < a + 1) {
      // Series representation
      let ap = a;
      let sum = 1 / a;
      let del = sum;
      for (let n = 0; n < 500; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    } else {
      // Continued fraction for Q(a,x), then complement
      const FPMIN = 1e-300;
      let b = x + 1 - a;
      let c = 1 / FPMIN;
      let d = 1 / b;
      let h = d;
      for (let i = 1; i < 500; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = b + an / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-15) break;
      }
      const q = Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
      return 1 - q;
    }
  }
  D.gammap = gammap;
  D.gammaq = (a, x) => 1 - gammap(a, x);

  // ---- Regularized incomplete beta I_x(a,b) -------------------------------
  function betacf(a, b, x) {
    const FPMIN = 1e-300;
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  D.betai = betai;
  D.logBeta = logBeta;

  // ---- Normal -------------------------------------------------------------
  D.normalPDF = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  D.normalCDF = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  // Inverse normal CDF (Acklam's algorithm)
  D.normalInv = function (p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [
      -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
      1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
      6.680131188771972e1, -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
      -2.549732539343734, 4.374664141464968, 2.938163982698783,
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
      3.754408661907416,
    ];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    } else if (p <= phigh) {
      q = p - 0.5;
      r = q * q;
      return (
        ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
          q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
      );
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }
  };

  // ---- Student's t --------------------------------------------------------
  // CDF
  D.tCDF = function (t, df) {
    const x = df / (df + t * t);
    const ib = 0.5 * betai(df / 2, 0.5, x);
    return t > 0 ? 1 - ib : ib;
  };
  // Two-tailed p-value
  D.tTwoTail = function (t, df) {
    const x = df / (df + t * t);
    return betai(df / 2, 0.5, x);
  };
  // Inverse t (two-sided quantile) via bisection on |t|
  D.tInv = function (p, df) {
    // returns t such that P(T <= t) = p
    if (p === 0.5) return 0;
    let lo = -300,
      hi = 300;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (D.tCDF(mid, df) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  // ---- F ------------------------------------------------------------------
  D.fCDF = function (f, d1, d2) {
    if (f <= 0) return 0;
    const x = (d1 * f) / (d1 * f + d2);
    return betai(d1 / 2, d2 / 2, x);
  };
  // Upper-tail p-value P(F > f)
  D.fPvalue = function (f, d1, d2) {
    return 1 - D.fCDF(f, d1, d2);
  };
  D.fInv = function (p, d1, d2) {
    let lo = 1e-8,
      hi = 1e8;
    for (let i = 0; i < 200; i++) {
      const mid = Math.sqrt(lo * hi);
      if (D.fCDF(mid, d1, d2) < p) lo = mid;
      else hi = mid;
    }
    return Math.sqrt(lo * hi);
  };

  // ---- Chi-square ---------------------------------------------------------
  D.chi2CDF = (x, df) => gammap(df / 2, x / 2);
  D.chi2Pvalue = (x, df) => 1 - gammap(df / 2, x / 2);
  D.chi2Inv = function (p, df) {
    let lo = 0,
      hi = 1e6;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (D.chi2CDF(mid, df) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  // ---- Studentized range (Tukey) -----------------------------------------
  // ptukey(q, k, df): P(Q <= q) for k groups and df error degrees of freedom.
  // Implemented by numerical integration following the standard formulation.
  function prange(q, k) {
    // P(range of k standard normals <= q) = k * ∫ φ(z)[Φ(z)-Φ(z-q)]^(k-1) dz
    if (q <= 0) return 0;
    const nleg = 16;
    // Gauss-Legendre over a wide range for the inner variable
    const lo = -8,
      hi = 8;
    const nsteps = 60;
    const h = (hi - lo) / nsteps;
    let integral = 0;
    for (let s = 0; s < nsteps; s++) {
      const a = lo + s * h;
      const b = a + h;
      // Simpson on subinterval
      const mid = (a + b) / 2;
      const fa = rangeIntegrand(a, q, k);
      const fm = rangeIntegrand(mid, q, k);
      const fb = rangeIntegrand(b, q, k);
      integral += ((b - a) / 6) * (fa + 4 * fm + fb);
    }
    return Math.min(1, Math.max(0, k * integral));
  }
  function rangeIntegrand(z, q, k) {
    const phi = D.normalPDF(z);
    const diff = D.normalCDF(z) - D.normalCDF(z - q);
    if (diff <= 0) return 0;
    return phi * Math.pow(diff, k - 1);
  }
  D.ptukey = function (q, k, df) {
    if (q <= 0) return 0;
    if (df > 5000) return prange(q, k);
    // Integrate prange over the chi distribution of the scale factor s.
    // s^2 * df ~ chi-square(df); integrate prange(q*s, k) * f_s(s) ds
    const nsteps = 60;
    const sMax = 1 + 12 / Math.sqrt(df);
    const lo = Math.max(1e-4, 1 - 8 / Math.sqrt(df));
    const hi = sMax;
    const h = (hi - lo) / nsteps;
    let integral = 0;
    for (let i = 0; i < nsteps; i++) {
      const a = lo + i * h;
      const b = a + h;
      const mid = (a + b) / 2;
      const fa = prange(q * a, k) * chiScalePDF(a, df);
      const fm = prange(q * mid, k) * chiScalePDF(mid, df);
      const fb = prange(q * b, k) * chiScalePDF(b, df);
      integral += ((b - a) / 6) * (fa + 4 * fm + fb);
    }
    return Math.min(1, Math.max(0, integral));
  };
  // PDF of s where df*s^2 ~ chi-square(df)  (s = sqrt(chi2/df))
  function chiScalePDF(s, df) {
    if (s <= 0) return 0;
    const v = df;
    // density of s: 2 * (v/2)^(v/2) / Γ(v/2) * s^(v-1) * exp(-v s^2 / 2)
    const logc =
      Math.log(2) + (v / 2) * Math.log(v / 2) - lgamma(v / 2);
    return Math.exp(logc + (v - 1) * Math.log(s) - (v * s * s) / 2);
  }
  D.qtukey = function (p, k, df) {
    let lo = 0,
      hi = 100;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (D.ptukey(mid, k, df) < p) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // Tukey p-value (upper tail)
  D.tukeyPvalue = (q, k, df) => 1 - D.ptukey(q, k, df);

  FG.dist = D;
})();
