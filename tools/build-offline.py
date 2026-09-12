#!/usr/bin/env python3
"""Собирает street-apex-offline.html: three.js, Ferrari (GLB), hero-арт и Draco-декодер встраиваются в файл."""
import base64, os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s=open(f'{root}/new-project/index.html').read()
three=open(f'{root}/new-project/lib/three.min.js').read()
assert '</script' not in three.lower()
s=s.replace('<script src="lib/three.min.js"></script>','<script>\n'+three+'\n</script>')
gltf=open(f'{root}/new-project/assets/ferrari.glb','rb').read()
s=s.replace("loader.load('assets/ferrari.glb'","loader.load('data:model/gltf-binary;base64,"+base64.b64encode(gltf).decode()+"'")
img=open(f'{root}/new-project/assets/hero-car.jpg','rb').read()
s=s.replace("url('assets/hero-car.jpg')","url('data:image/jpeg;base64,"+base64.b64encode(img).decode()+"')")
dec=open(f'{root}/new-project/assets/draco/draco_decoder.js').read()
assert '</script' not in dec.lower()
dec_b64=base64.b64encode(dec.encode()).decode()
hook=("window.__DRACO_JS_B64='"+dec_b64+"';\n"
      "(function(){const _ll=THREE.DRACOLoader.prototype._loadLibrary;\n"
      "THREE.DRACOLoader.prototype._loadLibrary=function(url,responseType){\n"
      "  if(url==='draco_decoder.js'){return Promise.resolve(atob(window.__DRACO_JS_B64));}\n"
      "  return _ll.call(this,url,responseType);};})();")
marker='<script src="assets/DRACOLoader.js"></script>'
assert marker in s
s=s.replace(marker,marker+'\n<script>\n'+hook+'\n</script>')
open(f'{root}/new-project/street-apex-offline.html','w').write(s)
print('offline build:',round(os.path.getsize(f'{root}/new-project/street-apex-offline.html')/1048576,2),'МБ')
