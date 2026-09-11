// Быстрая проверка геометрии мира без браузера:
//   node tools/world-stats.js
// Загружает математику, меш, трассу и сборку мира, печатает счётчики по этапам.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const vm = require('vm');
const load = (f) => {
  const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  vm.runInThisContext(src.replace(/^const /gm, 'globalThis.'), { filename: f });
};
for (const f of ['00-math.js', '02-mesh.js', '03-path.js', '04-world.js']) load(f);

const t0 = Date.now();
buildPath();
const hf = buildHeightField(200);
const solid = new Mesh(), glow = new Mesh();
const stages = [['рельеф', () => {}]].concat(worldStageList(solid, glow, hf));
let prev = 0;
for (const [name, fn] of stages) {
  fn();
  const t = solid.tris;
  console.log(name.padEnd(14), String(t).padStart(7), '+' + (t - prev));
  prev = t;
}
console.log('---');
console.log('треугольников:', solid.tris, '| вершин:', solid.count,
            '| свечение:', glow.tris, '| зданий:', WORLD.buildings, '| деревьев:', WORLD.trees);
console.log('время сборки:', Date.now() - t0, 'мс');
