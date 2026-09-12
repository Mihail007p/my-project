#!/usr/bin/env python3
"""Зеркалирует гонку в docs/ — это то, что показывает GitHub Pages.

  python3 tools/sync-docs.py

Копируются только те файлы, на которые реально ссылается index.html, и в конце
скрипт проверяет, что ВСЕ ссылки в собранной странице существуют. Раньше страница
уезжала в Pages со ссылкой на модель, которой рядом не было, — теперь это не пройдёт.
"""
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'new-project')
DST = os.path.join(ROOT, 'docs')

# файлы, которые больше не используются игрой (тяжёлые дубли)
OBSOLETE = [
    'assets/ferrari-plain.glb',   # 8.2 МБ без сжатия — заменён на Draco-версию 1.7 МБ
]


def referenced(html):
    """Все локальные зависимости страницы: <script src>, url('...'), 'assets/...'.

    Путь к декодеру Draco ('assets/draco/') раскрывается в конкретные файлы:
    какие именно — зависит от setDecoderConfig({type:...}) в коде игры.
    """
    refs = set()
    for m in re.finditer(r'<script[^>]+src="([^"]+)"', html):
        refs.add(m.group(1))
    for m in re.finditer(r"url\('([^')]+)'\)", html):
        refs.add(m.group(1))
    for m in re.finditer(r"'((?:assets|lib)/[^']+)'", html):
        refs.add(m.group(1))
    out = set()
    for r in refs:
        if r.startswith(('http://', 'https://', 'data:', '//')):
            continue
        if r.endswith('/'):
            # каталог декодеров Draco: берём то, что реально попросит DRACOLoader
            use_js = "setDecoderConfig({type:'js'})" in html
            names = ['draco_decoder.js'] if use_js else ['draco_wasm_wrapper.js', 'draco_decoder.wasm']
            for n in names:
                out.add(r + n)
            continue
        out.add(r)
    return sorted(out)


def main():
    html_path = os.path.join(SRC, 'index.html')
    if not os.path.exists(html_path):
        sys.exit(f'нет {html_path}')
    html = open(html_path, encoding='utf-8').read()

    os.makedirs(os.path.join(DST, 'lib'), exist_ok=True)
    os.makedirs(os.path.join(DST, 'assets', 'draco'), exist_ok=True)

    shutil.copyfile(html_path, os.path.join(DST, 'index.html'))
    copied = ['index.html']
    for ref in referenced(html):
        src = os.path.join(SRC, ref)
        dst = os.path.join(DST, ref)
        if not os.path.exists(src):
            sys.exit(f'игра ссылается на {ref}, но в new-project/ такого файла нет')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        copied.append(ref)

    removed = []
    for rel in OBSOLETE:
        for base in (DST, SRC):
            victim = os.path.join(base, rel)
            if os.path.exists(victim):
                os.remove(victim)
                removed.append(os.path.relpath(victim, ROOT))

    # самопроверка: ни одной битой ссылки в docs/index.html
    docs_html = open(os.path.join(DST, 'index.html'), encoding='utf-8').read()
    missing = [r for r in referenced(docs_html) if not os.path.exists(os.path.join(DST, r))]
    if missing:
        sys.exit('в docs/ не хватает файлов: ' + ', '.join(missing))

    total = sum(os.path.getsize(os.path.join(DST, r)) for r in copied)
    print(f'docs/: скопировано {len(copied)} файлов, {total / 1048576:.2f} МБ, битых ссылок нет')
    for r in copied:
        print('  +', r)
    for r in removed:
        print('  -', r)
    return 0


if __name__ == '__main__':
    sys.exit(main())
