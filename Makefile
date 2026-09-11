# Всё нужное для работы с проектом: make serve / make test / make shots
SHELL := /bin/bash

.PHONY: help serve test test-fast shots syntax clean remote

REMOTE_URL ?= https://github.com/Mihail007p/my-project.git

help:                ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

serve:               ## Запустить игру на http://localhost:8000
	python3 -m http.server 8000

remote:              ## Восстановить origin (локальный .git/config может теряться)
	@git remote remove origin 2>/dev/null || true
	@git remote add origin $(REMOTE_URL)
	@git remote -v

syntax:              ## Проверить синтаксис тестов
	@for f in tests/*.js; do node --check $$f || exit 1; done; echo "syntax ok"

test: syntax         ## Прогнать все автотесты игры
	@echo "=== симуляция без DOM ==="
	@node tests/headless-test.js | tail -4
	@echo "=== сценарии ==="
	@node tests/scenario-test.js
	@echo "=== гонка ==="
	@node tests/race-test.js

test-fast:           ## Только имитация гонки (без DOM)
	@node tests/race-test.js

shots:               ## Скриншоты в headless Chrome (нужен puppeteer)
	@node tests/screenshot-test.js

clean:               ## Убрать временные скриншоты
	@rm -f /tmp/game.js
