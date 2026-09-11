PY := python3

.PHONY: build test stats shots serve remote

build:            ## собрать index.html из src/
	$(PY) tools/build.py

stats:            ## счётчики геометрии мира без браузера
	node tools/world-stats.js

test: build stats  ## сборка + проверки (+ снимки, если есть puppeteer)
	@if [ -d /tmp/shot/node_modules/puppeteer ]; then node tests/world-test.js; \
	 else echo "puppeteer не найден — снимки пропущены (см. docs/WORLD.md)"; fi

shots:            ## только снимки мира
	node tests/world-test.js

serve:
	$(PY) -m http.server 8000

remote:
	git remote -v || git remote add origin https://github.com/Mihail007p/my-project.git
