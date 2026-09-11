// Проверка мира: генерация, кадры, набор снимков.
// Запуск: node tests/world-test.js [папка-вывода]
// ВАЖНО: в headless нужен бэкенд --use-angle=swiftshader — с --use-gl=swiftshader
// контекст WebGL теряется и сцена выходит пустой.
const puppeteer = require('/tmp/shot/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] ? path.resolve(process.argv[2])
                           : path.resolve(__dirname, '../docs/screenshots/world');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
  await page.waitForFunction('window.__world && window.__world.ready === true', { timeout: 120000 });

  const info = await page.evaluate(() => window.__world.info());
  console.log('мир:', JSON.stringify(info));
  const km = info.trackKm * 1000;

  // [имя, подготовка] — камеру ставим вручную, затем рендерим фиксированные кадры
  const shots = [
    ['1-overview-dusk', (km) => { window.__world.setTime(0.42); window.__world.setMode('fly');
      const s = sampleAt(600); cam.fly.pos = [s.p[0] - s.heading[0] * 90, s.p[1] + 55, s.p[2] - s.heading[2] * 90];
      cam.fly.yaw = s.yaw; cam.fly.pitch = -0.24; }],
    ['2-drive-day', (km) => { window.__world.setTime(0.06); window.__world.teleport(km * 0.10, -4.6); }],
    ['3-drive-dusk', (km) => { window.__world.setTime(0.50); window.__world.teleport(km * 0.55, -4.6); }],
    ['4-night', (km) => { window.__world.setTime(1.0); window.__world.teleport(km * 0.46, -4.6); }],
    ['5-tunnel-approach', (km) => { window.__world.setTime(0.5);
      window.__world.teleport(window.__world.tunnelAt() - 120, -4.6); }],
    ['6-tunnel-inside', (km) => { window.__world.setTime(0.5);
      window.__world.teleport(window.__world.tunnelAt() + 150, -4.6); }],
    ['7-overpass', (km) => { window.__world.setTime(0.35);
      window.__world.teleport(km * 0.085 - 150, -4.6); }],
    ['8-city-aerial', (km) => { window.__world.setTime(0.2); window.__world.setMode('fly');
      const s = sampleAt(km * 0.30);
      cam.fly.pos = [s.p[0] - s.heading[0] * 260 + s.right[0] * 210, s.p[1] + 140, s.p[2] - s.heading[2] * 260 + s.right[2] * 210];
      cam.fly.yaw = Math.atan2(s.p[0] + s.right[0] * 60 - cam.fly.pos[0], s.p[2] + s.right[2] * 60 - cam.fly.pos[2]);
      cam.fly.pitch = -0.42; }],
    ['9-orbit', (km) => { window.__world.setTime(0.62); window.__world.setMode('orbit'); }]
  ];
  for (const [name, prep] of shots) {
    await page.evaluate(prep, km);
    const st = await page.evaluate(() => window.__world.step(4, 1 / 30));
    await page.screenshot({ path: OUT + '/' + name + '.png' });
    console.log(name.padEnd(20), JSON.stringify(st));
  }
  const lost = await page.evaluate(() => GL.ctx.isContextLost());
  await browser.close();
  console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : '✓ ошибок нет');
  console.log(lost ? '✗ контекст потерян' : '✓ контекст жив');
  process.exit(errors.length || lost ? 1 : 0);
})();
