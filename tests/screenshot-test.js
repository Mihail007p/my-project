// Реальный прогон игры в headless Chrome: скриншоты + отлов ошибок консоли.
// Запуск: node tests/screenshot-test.js
const puppeteer = require('/tmp/shot/node_modules/puppeteer');
const path = require('path');
const OUT = path.resolve(__dirname, '../docs/screenshots');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
           '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: OUT + '/1-menu.png' });

  // старт
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 900));
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: OUT + '/2-road.png' });

  // разгон + нитро
  await page.keyboard.down('ShiftLeft');
  await new Promise(r => setTimeout(r, 1600));
  await page.screenshot({ path: OUT + '/3-nitro.png' });
  await page.keyboard.up('ShiftLeft');

  // поворот налево на скорости
  await page.keyboard.down('ArrowLeft');
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: OUT + '/4-corner.png' });
  await page.keyboard.up('ArrowLeft');
  await new Promise(r => setTimeout(r, 400));

  // уходим в барьер, чтобы проверить эффекты удара
  await page.keyboard.down('ArrowRight');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: OUT + '/5-barrier.png' });
  await page.keyboard.up('ArrowRight');

  // смотрим в мобильном разрешении
  await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: OUT + '/6-mobile.png' });

  const state = await page.evaluate(() => window.__nitro.info());
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const step = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(step); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(step);
  }));

  await browser.close();

  console.log('состояние:', JSON.stringify(state));
  console.log('FPS в headless (swiftshader, без GPU):', fps);
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : '✓ ошибок в консоли нет');
  process.exit(errors.length ? 1 : 0);
})();
