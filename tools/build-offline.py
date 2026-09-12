#!/usr/bin/env python3
"""Собирает street-apex-offline.html: three.js и hero-арт встраиваются в файл."""
import base64, os, re
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src=os.path.join(root,'new-project','index.html')
dst=os.path.join(root,'new-project','street-apex-offline.html')
s=open(src).read()
three=open(os.path.join(root,'new-project','lib','three.min.js')).read()
assert '</script' not in three.lower()
s=s.replace('<script src="lib/three.min.js"></script>','<script>\n'+three+'\n</script>')
img=open(os.path.join(root,'new-project','assets','hero-car.jpg'),'rb').read()
b64=base64.b64encode(img).decode()
s=s.replace("url('assets/hero-car.jpg')","url('data:image/jpeg;base64,"+b64+"')")
open(dst,'w').write(s)
print('offline build:',round(os.path.getsize(dst)/1024),'КБ')
