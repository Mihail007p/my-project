#!/usr/bin/env python3
"""Сборка одного файла игры из исходников в src/.

  python3 tools/build.py

Порядок файлов задан в PARTS — он важен: сначала математика и шейдеры,
потом генератор мира, затем рендерер и приложение.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
OUT = ROOT / 'index.html'

PARTS = [
    'index.head.html',
    '00-math.js',
    '01-shaders.js',
    '02-mesh.js',
    '03-path.js',
    '04-world.js',
    '05-render.js',
    '06-app.js',
    'index.tail.html',
]

def main():
    chunks = []
    for name in PARTS:
        path = SRC / name
        if not path.exists():
            print(f'нет файла: {path}', file=sys.stderr)
            return 1
        chunks.append(path.read_text(encoding='utf-8'))
    html = '\n'.join(chunks)
    OUT.write_text(html, encoding='utf-8')
    lines = html.count('\n') + 1
    print(f'собрано: {OUT.relative_to(ROOT)} — {lines} строк, {len(html) / 1024:.0f} КБ')
    return 0

if __name__ == '__main__':
    sys.exit(main())
