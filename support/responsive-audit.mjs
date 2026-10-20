const version = await fetch('http://127.0.0.1:9222/json/version').then((response) => response.json());
const socket = new WebSocket(version.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}, sessionId) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
await command('Page.enable', {}, sessionId);
await command('Runtime.enable', {}, sessionId);

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

const viewports = [
  { name: 'small-phone', width: 320, height: 568, mobile: true },
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'laptop', width: 1024, height: 768, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

const reports = [];
for (const viewport of viewports) {
  await command('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  }, sessionId);
  await command('Page.navigate', { url: 'http://127.0.0.1:5173/' }, sessionId);
  await waitFor("document.querySelectorAll('[aria-label]').length > 0 && document.body.innerText.includes('Bachelor of Architecture')");

  const catalogue = await evaluate(`(() => {
    const root = document.documentElement;
    const header = document.querySelector('.public-catalogue > header');
    const hero = document.querySelector('.catalogue-hero');
    const cards = [...document.querySelectorAll('article[aria-label]')];
    const footer = document.querySelector('footer[aria-label="Public catalogue footer"]');
    const rect = (element) => element ? ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }) : null;
    return {
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      header: rect(header), hero: rect(hero), footer: rect(footer),
      cardCount: cards.length,
      cardWidths: [...new Set(cards.slice(0, 4).map((card) => Math.round(card.getBoundingClientRect().width)))],
      mobileMenuVisible: getComputedStyle(document.querySelector('button[aria-label="Toggle navigation"]')).display !== 'none',
    };
  })()`);

  await evaluate(`(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.innerText.includes('Bachelor of Architecture'));
    target?.click();
    return Boolean(target);
  })()`);
  await waitFor("Boolean(document.getElementById('programme-detail'))");
  const detail = await evaluate(`(() => {
    const root = document.getElementById('programme-detail');
    const hero = root.querySelector('.programme-detail-hero');
    const article = root.querySelector('main article');
    const aside = root.querySelector('main aside');
    const title = root.querySelector('#programme-title');
    const sections = [...article.querySelectorAll(':scope > section')];
    const footer = root.querySelector('footer[aria-label="Public catalogue footer"]');
    const r = (element) => element.getBoundingClientRect();
    return {
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      heroHeight: Math.round(r(hero).height),
      titleFits: r(title).left >= -1 && r(title).right <= innerWidth + 1,
      sectionCount: sections.length,
      article: { left: Math.round(r(article).left), right: Math.round(r(article).right), bottom: Math.round(r(article).bottom) },
      aside: { left: Math.round(r(aside).left), right: Math.round(r(aside).right), top: Math.round(r(aside).top), height: Math.round(r(aside).height) },
      asideAfterContentOnMobile: innerWidth >= 1024 ? null : r(aside).top >= r(article).bottom - 1,
      asideBesideContentOnDesktop: innerWidth < 1024 ? null : r(aside).left >= r(article).right - 1,
      footerWidth: Math.round(r(footer).width),
    };
  })()`);
  let sticky = null;
  if (viewport.width >= 1024) {
    await evaluate("document.getElementById('programme-detail').scrollTo({ top: 1800, behavior: 'instant' }); true");
    await new Promise((resolve) => setTimeout(resolve, 150));
    sticky = await evaluate(`(() => {
      const root = document.getElementById('programme-detail');
      const aside = root.querySelector('main aside').getBoundingClientRect();
      return { scrollTop: Math.round(root.scrollTop), top: Math.round(aside.top), bottom: Math.round(aside.bottom), viewportHeight: innerHeight };
    })()`);
  }
  reports.push({ viewport, catalogue, detail, sticky });
}

console.log(JSON.stringify(reports, null, 2));
await command('Target.closeTarget', { targetId });
socket.close();
