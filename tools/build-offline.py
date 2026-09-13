#!/usr/bin/env python3
"""Собирает new-project/play.html — ОДИН самодостаточный файл игры (~4 МБ).

Внутрь встраиваются: three.js, GLTFLoader, DRACOLoader, модель Ferrari (Draco-GLB),
JS-декодер Draco и арт главного меню. AI-соперники в runtime строятся как
лёгкие 3D-варианты без тяжёлых дополнительных моделей. Файл можно открыть двойным щелчком
(file://) или отправить кому угодно — сеть и папка assets/ не нужны.

  python3 tools/build-offline.py

Важно: в офлайн-режиме декодер Draco выполняется В ОСНОВНОМ ПОТОКЕ.
Воркер из blob-URL на file:// заводится не во всех браузерах, а подтянуть
декодер по сети нельзя — поэтому подменяются _loadLibrary/_initDecoder/_getWorker.
Код «воркера» берётся тот же самый, что и в DRACOLoader (функция DRACOWorker).
"""
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NP = os.path.join(ROOT, 'new-project')
OUT = os.path.join(NP, 'play.html')


def read(rel, binary=False):
    path = os.path.join(NP, rel)
    if not os.path.exists(path):
        sys.exit(f'нет файла: {path}')
    return open(path, 'rb' if binary else 'r', encoding=None if binary else 'utf-8').read()


def js_string(text):
    """Строковый литерал JS из произвольного текста."""
    lit = json.dumps(text)
    for bad, esc in (('\u2028', '\\u2028'), ('\u2029', '\\u2029')):
        lit = lit.replace(bad, esc)
    return lit


def extract_worker_body(draco_src):
    """Тело функции DRACOWorker() — ровно то, что three.js отправляет в воркер."""
    i = draco_src.index('function DRACOWorker()')
    start = draco_src.index('{', i)
    depth = 0
    for k in range(start, len(draco_src)):
        c = draco_src[k]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return draco_src[start + 1:k]
    sys.exit('не найдена закрывающая скобка DRACOWorker')


def sub_once(src, old, new, what):
    """Обязательная замена: молча собрать битый файл больше не получится."""
    if old not in src:
        sys.exit(f'сборка сломалась: не найден якорь «{what}»')
    return src.replace(old, new, 1)


def inline_script(src, tag, code, what):
    return sub_once(src, tag, '<script>\n' + code + '\n</script>', what)


def main():
    html = read('index.html')
    three = read('lib/three.min.js')
    gltf = read('assets/GLTFLoader.js')
    draco = read('assets/DRACOLoader.js')
    decoder = read('assets/draco/draco_decoder.js')
    for name, code in (('three.min.js', three), ('GLTFLoader.js', gltf),
                       ('DRACOLoader.js', draco), ('draco_decoder.js', decoder)):
        if '</script' in code.lower():
            sys.exit(f'{name}: содержит </script — встраивание небезопасно')

    # 1. движок и загрузчики — внутрь файла
    html = inline_script(html, '<script src="lib/three.min.js"></script>', three, 'three.js')
    html = inline_script(html, '<script src="assets/GLTFLoader.js"></script>', gltf, 'GLTFLoader')

    # 2. DRACOLoader + офлайн-хук декодера
    hook = """<script>
/* ---------------- ОФЛАЙН-РЕЖИМ ДЕКОДЕРА DRACO ----------------
   Декодер и код «воркера» встроены в этот файл, декодирование идёт в основном
   потоке: на file:// воркер из blob-URL заводится не везде, а сети нет. */
window.__DRACO_JS_B64='__DRACO_B64__';
window.__DRACO_WORKER_BODY=__WORKER_BODY__;
(function(){
  function wait(cb){
    if(window.THREE&&THREE.DRACOLoader){cb();return;}
    window.addEventListener('load',function(){cb();});
  }
  wait(function(){
    var proto=THREE.DRACOLoader.prototype, srcCache=null;

    /* «Воркер» в основном потоке: исходник тот же, что three.js отправляет в
       настоящий Worker, и окружение ему делаем воркерское. Это важно: emscripten
       внутри декодера определяет среду по window/importScripts/process. Если
       оставить window и не дать importScripts, он выберет ветку SHELL и подменит
       console.log на window.print — страница начнёт открывать диалог печати
       вместо логов. Поэтому: window/document — undefined, importScripts —
       функция, self.location — blob-URL, ровно как в настоящем воркере. */
    function makeInlineWorker(src){
      var host={}, dispatch;
      function toHost(data){setTimeout(function(){if(host.onmessage)host.onmessage({data:data});},0);}
      /* self у воркера — «глобальный объект»: из него декодер берёт
         конструкторы типов (self['Float32Array']) и postMessage. */
      var selfObj={
        postMessage:toHost,
        location:{href:'blob:draco-inline'},
        Int8Array:Int8Array,Uint8Array:Uint8Array,Int16Array:Int16Array,Uint16Array:Uint16Array,
        Int32Array:Int32Array,Uint32Array:Uint32Array,Float32Array:Float32Array,Float64Array:Float64Array,
        ArrayBuffer:ArrayBuffer,DataView:DataView,Math:Math,JSON:JSON,Object:Object,Array:Array,
        String:String,Number:Number,Boolean:Boolean,Error:Error,Promise:Promise,Date:Date,
        console:console,setTimeout:setTimeout,clearTimeout:clearTimeout,
        performance:typeof performance!=='undefined'?performance:undefined,
        WebAssembly:typeof WebAssembly!=='undefined'?WebAssembly:undefined,
        TextDecoder:typeof TextDecoder!=='undefined'?TextDecoder:undefined,
        atob:typeof atob!=='undefined'?atob:undefined
      };
      var factory=new Function('self','window','document','navigator','location','importScripts',
        'console','postMessage','setTimeout','clearTimeout','performance','TextDecoder',
        'var onmessage=null;\\n'+src+'\\nreturn function(msg){if(onmessage)onmessage({data:msg});};');
      dispatch=factory(selfObj,undefined,undefined,undefined,undefined,function(){},
        console,toHost,setTimeout,clearTimeout,
        typeof performance!=='undefined'?performance:undefined,
        typeof TextDecoder!=='undefined'?TextDecoder:undefined);
      host.postMessage=function(msg){setTimeout(function(){dispatch(msg);},0);};
      host.terminate=function(){};
      return host;
    }
    function workerSource(){
      if(srcCache===null){
        srcCache='/* draco decoder */\\n'+atob(window.__DRACO_JS_B64)+
                 '\\n\\n/* worker */\\n'+window.__DRACO_WORKER_BODY;
      }
      return srcCache;
    }

    proto._loadLibrary=function(url){
      if(url==='draco_decoder.js')return Promise.resolve(atob(window.__DRACO_JS_B64));
      return Promise.reject(new Error('офлайн-сборка: внешний файл декодера '+url+' недоступен'));
    };
    proto._initDecoder=function(){
      if(this.decoderPending)return this.decoderPending;
      this.decoderConfig.type='js';
      this.decoderPending=Promise.resolve().then(function(){workerSource();return null;});
      return this.decoderPending;
    };
    proto._getWorker=function(taskID,taskCost){
      var self=this;
      return this._initDecoder().then(function(){
        if(self.workerPool.length<self.workerLimit){
          var w=makeInlineWorker(workerSource());
          w._callbacks={};w._taskCosts={};w._taskLoad=0;
          w.onmessage=function(e){
            var m=e.data;
            if(m.type==='decode')w._callbacks[m.id].resolve(m);
            else if(m.type==='error')w._callbacks[m.id].reject(new Error(m.error||'Draco: ошибка декодирования'));
            else console.error('THREE.DRACOLoader: Unexpected message, "'+m.type+'"');
          };
          w.postMessage({type:'init',decoderConfig:self.decoderConfig});
          self.workerPool.push(w);
        }else{
          self.workerPool.sort(function(a,b){return a._taskLoad>b._taskLoad?-1:1;});
        }
        var worker=self.workerPool[self.workerPool.length-1];
        worker._taskCosts[taskID]=taskCost;
        worker._taskLoad+=taskCost;
        return worker;
      });
    };
  });
})();
</script>"""
    hook = hook.replace('__DRACO_B64__', base64.b64encode(decoder.encode('utf-8')).decode())
    hook = hook.replace('__WORKER_BODY__', js_string(extract_worker_body(draco)))
    html = sub_once(html, '<script src="assets/DRACOLoader.js"></script>',
                    '<script>\n' + draco + '\n</script>\n' + hook, 'DRACOLoader + хук')

    # 3. модель и арт — data-URI
    glb = read('assets/ferrari.glb', binary=True)
    html = sub_once(html, "const MODEL_URL='assets/ferrari.glb';",
                    "const MODEL_URL='data:model/gltf-binary;base64,"
                    + base64.b64encode(glb).decode() + "';", 'MODEL_URL')
    html = sub_once(html, "const MODEL_DECODER_PATH='assets/draco/';",
                    "const MODEL_DECODER_PATH='';   // офлайн: декодер встроен в файл",
                    'MODEL_DECODER_PATH')
    img = read('assets/hero-car-v2.jpg', binary=True)
    html = sub_once(html, "url('assets/hero-car-v2.jpg')",
                    "url('data:image/jpeg;base64," + base64.b64encode(img).decode() + "')",
                    'hero-арт')
    # 4. самопроверка: никаких внешних зависимостей не осталось
    problems = []
    for needle in ('<script src=', "url('assets/", "'assets/ferrari", "'assets/draco",
                   "'assets/opponents"):
        if needle in html:
            problems.append(needle)
    if problems:
        sys.exit('play.html не самодостаточен, остались ссылки: ' + ', '.join(problems))

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    mb = os.path.getsize(OUT) / 1048576
    print(f'play.html: {mb:.2f} МБ — three.js + GLTFLoader + DRACOLoader + '
          f'Draco-декодер + Ferrari + 3D-соперники ({len(glb) / 1048576:.2f} МБ GLB) внутри одного файла')
    if mb > 6:
        print('внимание: файл заметно тяжелее ожидаемых ~4 МБ', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
