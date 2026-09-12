# Инструкция для будущих ИИ-агентов (AI-HANDBOOK)

Коротко: как устроен проект, что где лежит, какие команды гонять, какие грабли
уже собраны и какие правила нельзя нарушать. История работ — в
`docs/AI-JOURNAL.md` (читай последнюю запись перед началом: там открытый
бэклог). Человеческая история изменений — `CHANGELOG.md`.

## 0. Правила поведения (коротко и жёстко)

1. **Ветка.** Серия сессий закреплена за `arena/01a095ab-my-project`. Коммиты
   и push — только в неё (`git push origin arena/01a095ab-my-project`), PR
   открывать из неё. Не переключаться, не создавать и не пушить другие ветки.
   Ветка пользователя `arena/01a09448-my-project` НЕ обновляется агентом.
2. **`.github/workflows/*` не коммитить**: GitHub App отклоняет push
   (нет права `workflows`). Готовые изменения CI клади в
   `docs/ci-workflow-proposed.yml` и пиши пользователю «скопируй вручную».
3. **Пользователь говорит по-русски** и ждёт отчётов по-русски, без
   англоязычных простыней. Комментарии в коде — по-русски (так исторически).
4. **Тяжёлые бинарники в git — только существующие исключения**
   (`new-project/assets/ferrari.glb` 1.7 МБ, `new-project/play.html` ~4 МБ —
   это и есть продукт). Новые датасеты/рендеры-простыни в git не тащить.
5. **После блока работ**: допиши запись в `docs/AI-JOURNAL.md` (формат в конце
   журнала), обнови `CHANGELOG.md` (keep-a-changelog), если менялось поведение.
6. Пользователь играет с телефона по ссылкам raw.githack — после каждого пуша
   давай ссылку с новым кэш-бастером `?v=N` (githack кэширует веточные URL).

## 1. Что за проект

`new-project/index.html` — гонка STREET APEX (WebGL, three.js r1xx из
`new-project/lib/three.min.js`): замкнутая трасса 8.83 км с туннелем и городом,
6 машин (игрок + 5 ИИ), 3 круга, дрифт, нитро, меню/пауза/финиш, сенсорное
управление. Один большой inline-`<script>` в конце файла (~66 КБ JS).

Два режима доставки:
- `new-project/index.html` + `new-project/assets/*` + `lib/*` — разработка
  (нужен сервер: `make serve` → http://localhost:8000);
- `new-project/play.html` — САМОДОСТАТОЧНЫЙ файл ~4 МБ (three.js, GLTFLoader,
  DRACOLoader, Draco-декодер, GLB-модель и арт меню зашиты внутрь). Именно он
  открывается по ссылке raw.githack и двойным щелчком без сети.
- `docs/` — зеркало для GitHub Pages (`make docs`).

## 2. Карта репозитория

| Путь | Зачем |
|---|---|
| `new-project/index.html` | вся игра: мир, физика, ИИ, машина, HUD, перф |
| `new-project/play.html` | офлайн-сборка (генерируется, не править руками!) |
| `new-project/assets/ferrari.glb` | Draco-модель Ferrari 458 (1.7 МБ) |
| `new-project/assets/draco/*` | декодер Draco (wasm + wrapper) |
| `new-project/assets/hero-car-v2.jpg` | арт меню и референс вида машины |
| `new-project/lib/three.min.js`, `assets/GLTFLoader.js`, `assets/DRACOLoader.js` | рантайм |
| `tools/build-offline.py` | сборка play.html (`make play`) |
| `tools/sync-docs.py` | зеркало в docs/ (`make docs`) |
| `tools/car-model-test.js` | 94 проверки: модель, гейт старта, офлайн, телефон |
| `tools/racing-smoke-test.js` | 16 проверок: трасса, физика, ИИ, отбойник |
| `tools/soft-render.js` | PNG-рендеры машины БЕЗ браузера (`make render`) |
| `tools/screenshots/` | референсы и рендеры: `q-*.png` (GLTF-виды), `fallback-*.png`, `gltf-rear34.png`; `car-*.png` — ИСТОРИЯ (старый «кирпич»), не референс! |
| `tools/world-stats.js`, `tests/world-test.js` | геометрия мира / снимки (нужен puppeteer, его нет) |
| `docs/AI-JOURNAL.md`, `docs/AI-HANDBOOK.md` | этот журнал и эта инструкция |
| `docs/ci-workflow-proposed.yml` | предлагаемый CI (копируется вручную) |
| `Makefile` | все команды (`make help`) |

## 3. Команды

```
make help      список
make play      собрать play.html (ОБЯЗАТЕЛЬНО после правок index.html)
make docs      зеркалить в docs/ (после make play)
make car       тест машины/модели/офлайна/телефона (Node-vm)
make racing    смоук гонки
make test      build+stats+play+racing+car (+снимки, если есть puppeteer)
make render    софтверные PNG машины в tools/soft-render-out/
make serve     сервер разработки :8000
```

Порядок релиза после правок игры:
`правка index.html` → `node --check` на извлечённом inline-скрипте →
`make play` → `make docs` → `make test` → CHANGELOG + журнал →
commit → push в ветку сессии → ссылка пользователю с `?v=N`:
`https://raw.githack.com/Mihail007p/my-project/arena/01a095ab-my-project/new-project/play.html?v=N`

Извлечение JS для `node --check`: последний блок `<script>` без `src`:
`python3 -c "s=open('new-project/index.html').read();i=s.rindex('<script>');j=s.rindex('</script>');open('/tmp/g.js','w').write(s[i+8:j])" && node --check /tmp/g.js`

## 4. Как устроена игра (точки, которые чаще всего трогают)

Всё в одном inline-скрипте `new-project/index.html`:
- `CFG`, `DIFFS`, `AI_META` — настройки, сложности, имена/цвета соперников.
- Трасса: `track` (pts/dirs/rights/sums/N/L), генерация мира — функции выше.
- `class Car` — физика+визуал машины; `placeOnGrid`, `syncMesh`.
- **Машина:** `buildCarMesh(colorHex,isPlayer)` — процедурная запасная
  (loft-кузов `loftHull(stations)` + кокпит + свет + колёса, ~1.9 тыс. треуг.);
  `buildGltfCar(colorHex,isPlayer)` — клон нормализованного шаблона
  `assets.carTemplate` со СВОИМИ материалами (кузов/стёкла/фонари), иначе
  перекраска одной машины красит все.
- **Контракт меша машины** (пологаются Car и тесты):
  `{grp, wheels:[{wg,spin,front}], bodyMat, tailLights, casters, gltf}`.
  Стоп-сигналы: материал с `emissive===0xff1e1e` (у запасной ищется traverse-ом).
  Колёса крутятся через `spin.rotation.x`, поворот через `wg.rotation.y`.
- **Модель:** загрузка в блоке ассетов: `MODEL_URL='assets/ferrari.glb'`,
  DRACOLoader из `assets/draco/`; `normalize(src)` — нос в +Z, длина 4.55 м,
  колёса на y=0; успех → `assets.ready=true` + `modelApplied()`
  (разблокировка старта, пересборка меню); ошибка/таймаут 20 с →
  `modelFailed(reason)` (старт с запасной машиной, подпись в меню).
  Гейт: `setStart(bool)`, `tryStart()`; кнопка `btnStart`, статус `modelStatus`,
  полоса `modelBarFill`.
- **Производительность:** `TOUCH` (maxTouchPoints/pointer:coarse), `PERF`
  {lightAI,lvl,dprScale,...}, `DPR_CAP` (touch 1.0 / десктоп 2), `perfTick(dt)`
  в `tick()` — губернер FPS (ступени: ×0.75 DPR → ×0.6 DPR + тени off;
  вверх при стабильных >55 FPS). На touch соперники строятся через
  `buildCarMesh` (`PERF.lightAI`), игрок — GLTF. Тени ИИ: `updateCarShadows`
  (включаются в радиусе 90 м от якоря).
- **Хуки тестов:** `window.__game` = {start, update, cars, track, game, input,
  assets, tryStart, carInfo(), perfInfo(), _perfTick, get player, tick(dt)}.

## 5. Тесты и как добавлять свои

`tools/car-model-test.js`: сценарии 1–4 (гейт загрузки, успешная загрузка,
play.html без сети и воркеров, отказ модели → запасная) + 5 (телефон: лёгкие
соперники, DPR, губернер). Скелет: `boot(file,{loaderMode:'slow'|'ok'|'fail',
touch:bool})` поднимает игру в `vm`-песочнице, `env.tick(ms)` крутит кадры,
`ok(cond,'текст')` считает проверки, `section('имя')` группирует.

Грабли песочницы (уже наступили, не повторяй):
- Стаб `Path2D` обязан иметь moveTo/lineTo/closePath/arc — иначе упадёт
  миникарта (`mmPath.moveTo is not a function`).
- `navigator.maxTouchPoints` в стабе включает touch-режим (сценарий 5).
- Стаб `WebGLRenderer.setPixelRatio` должен запоминать значение, иначе
  `getPixelRatio()` врёт и проверки DPR падают.
- Габариты машины мерить, обнулив `mesh.position/rotation` и вызвав
  `updateMatrixWorld(true)`: в Node никто не крутит рендер-цикл, дети держат
  несвежие `matrixWorld` → бокс врёт (было 5.00×2.83 вместо 4.68×1.92).
- `make test` без puppeteer пропускает снимки мира — это НОРМА, не чини.
- Headless-браузера в песочнице НЕТ совсем: визуальные проверки только через
  `make render` (софтверный растр) или глазами пользователя.

Пропорции запасной машины закрыты проверками: L 4.3–4.9, W 1.7–2.1,
H 0.9–1.25, min.y≈0, ≥25 мешей, стоп-сигналы подключены. Ломаешь силуэт —
увидишь красным.

## 6. Визуальная проверка машины без браузера

```
make render            # → tools/soft-render-out/*.png
```
Рисует запасную машину (режим отказа модели) в 3 ракурсах и GLTF-модель для
сравнения. Сравнивай с `tools/screenshots/q-rear34.png`, `q-side.png` и
`new-project/assets/hero-car-v2.jpg` (низкий открытый Spider: клин-нос,
наклонное стекло, кабина с сиденьями, круглые фонари, пятилучевые диски с
жёлтыми суппортами, БЕЗ антикрыла). После правок кузова прогони `make car`.

## 7. Известные мертвые концовки и внешние ограничения

- `curl` на `raw.githack.com` / `raw.githubusercontent.com` из песочницы
  падает (SSL_ERROR_SYSCALL). Проверять ссылки только инструментом
  fetch_page или просить пользователя.
- githack кэширует веточные URL: после пуша пользователь должен открыть ссылку
  с новым `?v=N`, иначе увидит старую сборку и решит, что «не починили».
- puppeteer/Chrome в песочнице нет и не ставь — время уйдёт впустую.
- Push с `.github/workflows/*` отклоняется сервером (право `workflows`).
- Draco в офлайн-сборке работает в основном потоке с эмуляцией воркер-окружения
  (иначе emscripten подменяет `console.log` на `window.print`); не «упрощай».
- `tools/build-offline.py` обязан падать громко, если подстановка не прошла —
  не возвращай молчаливые assert'ы.

## 8. Бэклог (из последней записи журнала)

- CI скопировать вручную: `cp docs/ci-workflow-proposed.yml .github/workflows/ci.yml`
  (может только пользователь).
- Если Pova neo 3 всё ещё лагает: лёгкая машина игрока на touch / лок 30 FPS /
  тени только у игрока.
- `tools/screenshots/car-*.png` — исторические рендеры старого «кирпича».
- Fast-forward ветки пользователя 01a09448 — только руками пользователя.
