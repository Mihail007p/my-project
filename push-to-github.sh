#!/usr/bin/env bash
# Скрипт создаёт репозиторий на GitHub и заливает туда текущую папку.
# Запускать ИЗ КОРНЯ проекта (там, где лежит .git).
#
# Использование:
#   ./push-to-github.sh                # имя репозитория = имя папки
#   ./push-to-github.sh my-project     # своё имя
#   GH_VISIBILITY=private ./push-to-github.sh
#
# Требуется либо установленный и авторизованный GitHub CLI (`gh auth login`),
# либо переменная окружения GITHUB_TOKEN (fine-grained token с правом
# "Administration: Read and write" на ваш аккаунт).

set -euo pipefail

REPO_NAME="${1:-$(basename "$PWD")}"
VISIBILITY="${GH_VISIBILITY:-public}"
BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo main)"

if [ ! -d .git ]; then
  echo "Ошибка: запустите скрипт из корня git-репозитория." >&2
  exit 1
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "==> Использую GitHub CLI"
  gh repo create "$REPO_NAME" "--$VISIBILITY" --source=. --remote=origin --push
else
  : "${GITHUB_TOKEN:?Установите GITHUB_TOKEN или авторизуйте gh (gh auth login)}"
  echo "==> Создаю репозиторий $REPO_NAME через GitHub API"
  curl -sS -X POST https://api.github.com/user/repos \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"$REPO_NAME\",\"private\":$([ "$VISIBILITY" = "private" ] && echo true || echo false)}" \
    >/dev/null

  USER_LOGIN="$(curl -sS https://api.github.com/user \
    -H "Authorization: Bearer $GITHUB_TOKEN" | sed -n 's/.*"login": *"\([^"]*\)".*/\1/p' | head -1)"

  git remote remove origin 2>/dev/null || true
  git remote add origin "https://${GITHUB_TOKEN}@github.com/${USER_LOGIN}/${REPO_NAME}.git"
  git push -u origin "$BRANCH"
  # убираем токен из URL, чтобы он не остался в .git/config
  git remote set-url origin "https://github.com/${USER_LOGIN}/${REPO_NAME}.git"
fi

echo "Готово: репозиторий $REPO_NAME опубликован."
