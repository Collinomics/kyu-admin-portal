// Mobile-layout verification: launches headless Chrome at phone widths via
// CDP (Node's built-in WebSocket) and asserts there is no horizontal page
// overflow, the hamburger shows, grids collapse, and chart-scroll regions
// stay inside their cards. Run with the dev server up:
//   node scripts/mobile-check.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const WIDTH = 390;
const HEIGHT = 844;

const routes = ["/", "/audit", "/documents"];

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
]);

const json = async (url) => (await fetch(url)).json();

async function main() {
  // wait for the debug endpoint
  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await json(`http://127.0.0.1:${PORT}/json`);
      if (targets.length) break;
    } catch {}
    await sleep(300);
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let seq = 0;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === id) {
          ws.removeEventListener("message", onMsg);
          resolve(m.result);
        }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  // force a true phone viewport (--window-size floors at 500px)
  await send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: true,
  });

  const results = [];
  for (const route of routes) {
    await send("Page.navigate", { url: `http://localhost:5179${route}` });
    await sleep(4500); // let mock latency + live ticks settle

    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true });
      return r.result.value;
    };

    const checks = await evalJs(`(() => {
      const doc = document.documentElement;
      const burger = document.querySelector(".navbar-burger");
      const links = document.querySelector(".navbar-links");
      const grid = document.querySelector(".grid.cols-6, .grid.cols-4");
      const scrolls = document.querySelectorAll(".chart-scroll");
      let scrollOverflow = false;
      for (const s of scrolls) {
        const rect = s.getBoundingClientRect();
        const card = s.closest(".card")?.getBoundingClientRect();
        if (card && rect.right > card.right + 2) scrollOverflow = true;
      }
      // which elements stick out past the viewport? (scroll containers excluded)
      const bad = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > window.innerWidth + 2 || r.left < -2) {
          const insideScroll = el.closest(".chart-scroll, .table-wrap");
          if (insideScroll) continue;
          bad.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + " [l=" + Math.round(r.left) + ",r=" + Math.round(r.right) + "]");
        }
      }
      return {
        innerWidth: window.innerWidth,
        scrollWidth: doc.scrollWidth,
        pageOverflow: doc.scrollWidth > window.innerWidth + 1,
        burgerDisplay: burger ? getComputedStyle(burger).display : "missing",
        linksDisplayClosed: links && !links.classList.contains("open") ? getComputedStyle(links).display : "open?",
        gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
        scrollRegions: scrolls.length,
        scrollOverflow: scrollOverflow,
        offenders: bad.slice(0, 6),
      };
    })()`);

    // open the hamburger menu and re-check (await a frame so React renders)
    const menuEval = await send("Runtime.evaluate", {
      expression: `(async () => {
        document.querySelector(".navbar-burger").click();
        await new Promise((r) => setTimeout(r, 120));
        const links = document.querySelector(".navbar-links");
        return {
          display: getComputedStyle(links).display,
          linksVisible: links.getBoundingClientRect().height > 0,
          linksRight: Math.round(links.getBoundingClientRect().right),
          viewport: window.innerWidth,
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const menuOpen = menuEval.result.value;

    results.push({ route, ...checks, menuOpen });
  }

  console.table(
    results.map((r) => ({
      route: r.route,
      innerWidth: r.innerWidth,
      scrollWidth: r.scrollWidth,
      pageOverflow: r.pageOverflow ? "OVERFLOW ✗" : "ok",
      burger: r.burgerDisplay,
      linksClosed: r.linksDisplayClosed,
      menuOpens: r.menuOpen.display === "flex" && r.menuOpen.linksVisible ? "ok" : "FAIL ✗",
      gridCols: r.gridCols,
      scrollRegions: r.scrollRegions,
      regionsInsideCards: r.scrollOverflow ? "OVERFLOW ✗" : "ok",
      offenders: (r.offenders || []).join("  "),
    })),
  );

  ws.close();
  chrome.kill();
  const failed = results.some(
    (r) => r.pageOverflow || r.scrollOverflow || !(r.menuOpen.display === "flex" && r.menuOpen.linksVisible) || r.burgerDisplay !== "flex",
  );
  console.log(failed ? "\nFAILURES FOUND" : "\nALL MOBILE CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(1);
});
