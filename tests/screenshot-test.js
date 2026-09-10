// Реальный прогон игры в headless Chrome: скриншоты ключевых механик + отлов ошибок консоли.
// Запуск: node tests/screenshot-test.js   (требуется puppeteer, ставится отдельно)
const puppeteer = require('/tmp/shot/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(__dirname, '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  await sleep(600);
  await page.screenshot({ path: OUT + '/1-menu.png' });

  // --- старт и отсчёт ---
  await page.click('#startBtn');
  await sleep(1400);
  await page.screenshot({ path: OUT + '/2-countdown.png' });
  await sleep(2400);                                    // отсчёт кончился, едем

  await page.keyboard.down('KeyW');
  await sleep(2500);
  await page.screenshot({ path: OUT + '/3-road.png' });

  // --- нитро ---
  await page.keyboard.down('ShiftLeft');
  await sleep(1600);
  await page.screenshot({ path: OUT + '/4-nitro.png' });
  await page.keyboard.up('ShiftLeft');

  // --- прыжок с трамплина ---
  await page.evaluate(() => {
    const N = window.__nitro;
    const ramp = N.api.segments.filter(s => s.ramp)[0];
    N.api.player.position = ramp.index * 200 - 1400;
    N.api.player.speed = 12000;
    N.api.player.x = -0.25;
  });
  let airborne = false;
  for (let i = 0; i < 60 && !airborne; i++) {
    await sleep(60);
    airborne = await page.evaluate(() => window.__nitro.api.player.air && window.__nitro.api.player.airY > 700);
  }
  await page.screenshot({ path: OUT + '/5-jump.png' });
  await sleep(900);

  // --- дрифт ---
  await page.keyboard.down('KeyX');
  await page.keyboard.down('ArrowRight');
  await sleep(1200);
  await page.screenshot({ path: OUT + '/6-drift.png' });
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyX');
  await sleep(400);

  // --- финиш ---
  await page.evaluate(() => {
    const N = window.__nitro;
    N.api.player.lap = N.api.CFG.raceLaps - 1;
    N.api.player.position = N.info().trackLength - 300;
    N.api.player.speed = 12000;
  });
  await sleep(900);
  await page.screenshot({ path: OUT + '/7-finish.png' });

  // --- мобильный вид ---
  await page.setViewport({ width: 430, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await sleep(700);
  await page.screenshot({ path: OUT + '/8-mobile.png' });

  const state = await page.evaluate(() => window.__nitro.info());
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const step = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(step); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
    requestAnimationFrame(step);
  }));

  await browser.close();

  console.log('состояние:', JSON.stringify(state));
  console.log('FPS в headless (swiftshader, без GPU):', fps);
  console.log('прыжок зафиксирован:', airborne, '| ошибки:', errors.length);
  if (errors.length) console.log(errors.join('\n'));
  process.exit(errors.length ? 1 : 0);
})();
