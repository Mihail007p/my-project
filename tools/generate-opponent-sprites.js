#!/usr/bin/env node
'use strict';

/*
 * Собирает десять AI-рендеров (5 машин × 2 ракурса) в один прозрачный атлас.
 *
 * Исходники от image-модели лежат в new-project/assets/opponents/raw/ и имеют
 * однотонный magenta-фон. Здесь нет npm-зависимостей: небольшой PNG-декодер
 * понимает обычные 8-bit RGB/RGBA PNG, убирает chroma-key, обрезает пустые поля,
 * масштабирует машины в одинаковые ячейки и пишет настоящий RGBA PNG.
 *
 * Запуск: node tools/generate-opponent-sprites.js
 * Результат: new-project/assets/opponents/opponent-sprites.png
 *           new-project/assets/opponents/sprite-data.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'new-project', 'assets', 'opponents');
const RAW = path.join(DIR, 'raw');
const ATLAS = path.join(DIR, 'opponent-sprites.png');
const DATA = path.join(DIR, 'sprite-data.js');
const names = ['falcon', 'vortex', 'baron', 'ghost', 'titan'];
const cell = 256;
const columns = names.length;
const rows = 2; // rear, front

function readPng(file) {
  const b = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!b.subarray(0, 8).equals(signature)) throw new Error(`${file}: это не PNG`);
  let p = 8, width, height, depth, type, interlace;
  const idat = [];
  while (p < b.length) {
    const size = b.readUInt32BE(p); p += 4;
    const kind = b.toString('ascii', p, p + 4); p += 4;
    const data = b.subarray(p, p + size); p += size;
    p += 4; // CRC: проверка не нужна для локальных AI-рендеров
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace !== 0) {
    throw new Error(`${file}: нужен PNG RGB/RGBA 8-bit без interlace (получен depth=${depth}, type=${type}, interlace=${interlace})`);
  }
  const channels = type === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let inPos = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[inPos++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let value = raw[inPos++];
      if (filter === 1) value = (value + a) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((a + up) / 2)) & 255;
      else if (filter === 4) {
        const q = a + up - upLeft;
        const pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - upLeft);
        value = (value + (pa <= pb && pa <= pc ? a : pb <= pc ? up : upLeft)) & 255;
      } else if (filter !== 0) throw new Error(`${file}: неизвестный PNG filter ${filter}`);
      row[x] = value;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels, di = (y * width + x) * 4;
      pixels[di] = row[si]; pixels[di + 1] = row[si + 1]; pixels[di + 2] = row[si + 2];
      pixels[di + 3] = channels === 4 ? row[si + 3] : 255;
    }
    previous = row;
  }
  return {width, height, pixels};
}

function removeMagenta(image) {
  const {width, height, pixels} = image;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const dr = r - 255, dg = g, db = b - 255;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    // У AI-рендеров фон бывает не идеально #ff00ff: JPEG-подобный
    // magenta (#f604dc) тоже должен уйти, иначе в игре появляется прямоугольник.
    const magentaBackground = r > 180 && b > 165 && g < 110;
    // Мягкий порог сохраняет сглаженный край, но делает сам фон прозрачным.
    const alpha = magentaBackground ? 0
      : Math.max(0, Math.min(255, Math.round((distance - 18) * 5.2)));
    pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    if (pixels[i + 3] > 18) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('после удаления magenta не осталось объекта');
  const pad = 3;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const out = Buffer.alloc((maxX - minX + 1) * (maxY - minY + 1) * 4);
  const ow = maxX - minX + 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const si = (y * width + x) * 4, di = ((y - minY) * ow + (x - minX)) * 4;
    pixels.copy(out, di, si, si + 4);
  }
  return {width: ow, height: maxY - minY + 1, pixels: out};
}

function resizeNearest(src, width, height) {
  const dst = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(src.width - 1, Math.floor(x * src.width / width));
    const sy = Math.min(src.height - 1, Math.floor(y * src.height / height));
    const si = (sy * src.width + sx) * 4, di = (y * width + x) * 4;
    src.pixels.copy(dst, di, si, si + 4);
  }
  return {width, height, pixels: dst};
}

function putInCell(sprite) {
  const maxW = cell - 18, maxH = cell - 18;
  const scale = Math.min(maxW / sprite.width, maxH / sprite.height);
  const w = Math.max(1, Math.round(sprite.width * scale));
  const h = Math.max(1, Math.round(sprite.height * scale));
  const scaled = resizeNearest(sprite, w, h);
  const cellPixels = Buffer.alloc(cell * cell * 4);
  const left = Math.floor((cell - w) / 2);
  const top = cell - h - 7; // все машины стоят на одной визуальной «земле»
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = ((top + y) * cell + left + x) * 4;
    scaled.pixels.copy(cellPixels, di, si, si + 4);
  }
  return {pixels: cellPixels, bottom: top + h - 1};
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}
function writePng(width, height, pixels) {
  const rowsData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4), src = y * width * 4;
    rowsData[row] = 0; pixels.copy(rowsData, row + 1, src, src + width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rowsData, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

function processSprite(name, angle) {
  const file = path.join(RAW, `${name}-${angle}.png`);
  return putInCell(removeMagenta(readPng(file)));
}

function main() {
  fs.mkdirSync(DIR, {recursive: true});
  const atlas = Buffer.alloc(columns * cell * rows * cell * 4);
  const bottoms = [];
  // Сначала ряд rear, затем front — это же соглашение использует рантайм.
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const angle = row === 0 ? 'rear' : 'front';
    const image = processSprite(names[col], angle);
    bottoms.push(image.bottom);
    for (let y = 0; y < cell; y++) {
      const src = y * cell * 4;
      const dst = ((row * cell + y) * columns * cell + col * cell) * 4;
      image.pixels.copy(atlas, dst, src, src + cell * 4);
    }
    console.log(`  ${angle.padEnd(5)} ${names[col].padEnd(7)} ← chroma-key, crop, ${cell}×${cell}`);
  }
  fs.writeFileSync(ATLAS, writePng(columns * cell, rows * cell, atlas));
  const data = `/* Сгенерировано tools/generate-opponent-sprites.js — не править вручную. */\n` +
`const OPPONENT_SPRITES = Object.freeze({\n` +
`  url: 'assets/opponents/opponent-sprites.png',\n` +
`  columns: ${columns}, rows: ${rows}, cellSize: ${cell},\n` +
`  rear: [${names.map((_, i) => i).join(', ')}],\n` +
`  front: [${names.map((_, i) => columns + i).join(', ')}],\n` +
`  bottoms: [${bottoms.join(', ')}],\n` +
`  names: ${JSON.stringify(names)}\n` +
`});\n`;
  fs.writeFileSync(DATA, data);
  console.log(`Атлас: ${path.relative(ROOT, ATLAS)} (${(fs.statSync(ATLAS).size / 1024).toFixed(0)} КБ)`);
  console.log(`Метаданные: ${path.relative(ROOT, DATA)}`);
}

try { main(); } catch (error) {
  console.error('Не удалось собрать спрайты соперников:', error.message);
  process.exitCode = 1;
}
