/*
 * Figulate — GitHub star button. window.FG.githubStar
 *
 * Turns the toolbar's "Star on GitHub" anchor into a live like/metric:
 * fetches the repo's star count from the public GitHub API (no auth, no
 * cookies, nothing about the visitor is sent) and shows it next to the star.
 * If the request fails or is rate-limited, the button still works as a plain
 * link to the repo — it just omits the count.
 */
(function () {
  const FG = (window.FG = window.FG || {});

  const REPO = "jeewonyang/Figulate";
  const API = `https://api.github.com/repos/${REPO}`;

  // Compact display: 1234 -> "1.2k".
  function fmt(n) {
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "") + "k";
  }

  function init() {
    const btn = document.getElementById("github-star");
    if (!btn) return;
    const countEl = btn.querySelector(".gh-count");
    if (!countEl) return;

    fetch(API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        const stars = data.stargazers_count;
        if (typeof stars !== "number") return;
        countEl.textContent = fmt(stars);
        countEl.hidden = false;
        btn.title = `${stars} ${stars === 1 ? "star" : "stars"} on GitHub — click to star the repo`;
      })
      .catch(() => {
        // Leave the count hidden; the anchor still links to the repo.
      });
  }

  FG.githubStar = { init, _fmt: fmt };
  document.addEventListener("DOMContentLoaded", init);
})();
