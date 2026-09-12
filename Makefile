PY := python3

.PHONY: help build test stats shots serve remote play docs racing car render

help:               ## список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

build:              ## собрать index.html (мир «Городское шоссе») из src/
	$(PY) tools/build.py

stats:              ## счётчики геометрии мира без браузера
	node tools/world-stats.js

play:               ## собрать new-project/play.html — один самодостаточный файл гонки (~4 МБ)
	$(PY) tools/build-offline.py

docs:               ## зеркалить гонку в docs/ (то, что показывает GitHub Pages)
	$(PY) tools/sync-docs.py

racing:             ## смоук-тест гонки: трасса, ИИ, физика, отбойник (Node, без браузера)
	node tools/racing-smoke-test.js

car:                ## тест машины: Draco-модель, блокировка старта, офлайн-сборка (Node)
	node tools/car-model-test.js

render:             ## софтверные PNG-рендеры машины без браузера (tools/soft-render-out/)
	node tools/soft-render.js

test: build stats play racing car   ## всё, что проверяется без браузера
	@if [ -d /tmp/shot/node_modules/puppeteer ] && \
	   [ -n "$$(find $${HOME}/.cache/puppeteer -maxdepth 3 -type f -name chrome 2>/dev/null)" ]; then \
	   node tests/world-test.js; \
	 else echo "puppeteer/Chrome не найдены — снимки мира пропущены (см. docs/WORLD.md)"; fi

shots:              ## только снимки мира (нужен puppeteer в /tmp/shot)
	node tests/world-test.js

serve:              ## игра на http://localhost:8000
	$(PY) -m http.server 8000

remote:
	git remote -v || git remote add origin https://github.com/Mihail007p/my-project.git
