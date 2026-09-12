'use strict';
/* ================================================================
   tools/car-model-test.js — проверка МАШИНЫ без браузера.

   Что проверяется (регрессия бага «старая машина вернулась»):
     1. Ferrari 458 грузится из Draco-GLB (1.7 МБ) штатным конвейером
        three.js: GLTFLoader + DRACOLoader + декодер из assets/draco/.
     2. Кнопка «ПОЕХАЛИ» заблокирована, пока модель не приехала,
        показывает прогресс и сама открывается после загрузки.
     3. В гонке используется настоящая модель: 51 меш, ~359 тыс.
        треугольников, 4 колеса, горящие стоп-сигналы, свой цвет кузова
        у каждой машины (материалы шаблона не перекрашивают соседей).
     4. play.html самодостаточен: модель и декодер внутри файла,
        декодирование идёт в основном потоке (без Worker и без сети).
     5. Если модель не загрузилась — старт не запирается навсегда:
        включается запасной автомобиль и гонка начинается.

   Запуск:  node tools/car-model-test.js
   ================================================================ */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const NP=path.join(ROOT,'new-project');

let checks=0,fails=0;
function ok(cond,msg){
  checks++;
  if(cond)console.log('  ok –',msg);
  else{fails++;console.error('  ✗ FAIL –',msg);}
}
function section(t){console.log('\n== '+t);}

/* ---------------- стабы браузера ---------------- */
function makeCtx2d(){
  return new Proxy({},{
    get(t,p){
      if(p==='canvas')return{};
      return()=>{
        if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern')
          return{addColorStop(){}};
        if(p==='getImageData')return{data:new Uint8ClampedArray(4)};
        if(p==='measureText')return{width:10};
        return undefined;
      };
    },
    set(){return true;}
  });
}
const ctx2d=makeCtx2d();

function makeEl(id){
  const el={
    id:id||'',tagName:'DIV',style:{},dataset:{},children:[],
    textContent:'',innerHTML:'',disabled:false,width:300,height:150,
    classList:{
      _s:new Set(),
      add(...c){c.forEach(x=>this._s.add(x));},
      remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,on){if(on===undefined)on=!this._s.has(c);on?this._s.add(c):this._s.delete(c);return on;},
      contains(c){return this._s.has(c);}
    },
    _ev:{},
    addEventListener(t,f){(this._ev[t]=this._ev[t]||[]).push(f);},
    removeEventListener(){},
    dispatch(t,ev){(this._ev[t]||[]).forEach(f=>f(Object.assign({preventDefault(){},stopPropagation(){}},ev)));},
    appendChild(c){this.children.push(c);return c;},
    removeChild(){},setAttribute(){},getAttribute(){return null;},remove(){},
    closest(){return null;},
    querySelector(){return makeEl('q');},
    querySelectorAll(){return[];},
    getBoundingClientRect(){return{left:0,top:0,width:100,height:100};},
    getContext(){return ctx2d;},
    toDataURL(){return'';},
    focus(){},click(){this.dispatch('click');}
  };
  return el;
}

/* FileLoader: 'disk' — читает файлы, 'dataonly' — только data-URI (офлайн),
   'fail' — любая загрузка падает. 'slow' добавляет задержку и дробит прогресс. */
function patchFileLoader(THREE,mode,base){
  THREE.FileLoader.prototype.load=function(url,onLoad,onProgress,onError){
    const full=(this.path||'')+url;
    const rt=this.responseType;
    const finish=()=>{
      try{
        if(mode==='fail'){const e=new Error('HTTP 404: '+full);e.statusText='Not Found';throw e;}
        let data;
        if(/^data:/.test(full)){
          const i=full.indexOf('base64,');
          if(i<0)throw new Error('data-URI без base64: '+full.slice(0,60));
          data=Buffer.from(full.slice(i+7),'base64');
        }else{
          if(mode==='dataonly')throw new Error('офлайн-файл полез в сеть: '+full);
          data=fs.readFileSync(path.resolve(base,full));
        }
        const out=rt==='text'?data.toString('utf8')
          :data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
        if(onProgress&&mode==='slow'){
          let sent=0;
          const step=()=>{
            sent=Math.min(1,sent+0.34);
            onProgress({lengthComputable:true,loaded:Math.round(data.length*sent),total:data.length});
            if(sent<1)setTimeout(step,25);else setTimeout(()=>onLoad(out),25);
          };
          step();
        }else{
          if(onProgress)onProgress({lengthComputable:true,loaded:data.length,total:data.length});
          onLoad(out);
        }
      }catch(e){if(onError)setTimeout(()=>onError(e),0);else throw e;}
    };
    setTimeout(finish,mode==='slow'?120:2);
    return this;
  };
}

/* Worker как в браузере: исходник выполняется в отдельном контексте */
function makeWorkerStub(ctx){
  const HOST={console,WebAssembly,setTimeout,clearTimeout,setInterval,clearInterval,performance,
    TextDecoder,TextEncoder,Promise,Math,JSON,Date,Object,Array,String,Number,Boolean,Error,
    isNaN,isFinite,parseInt,parseFloat,Symbol,Map,Set,WeakMap,Function,
    Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,
    DataView,ArrayBuffer};
  ctx.Blob=class{constructor(parts){this.parts=parts;}};
  ctx.URL={createObjectURL:b=>{
    if(!b||!b.parts)throw new Error('Blob без содержимого');
    return b.parts.join('');
  },revokeObjectURL(){}};
  ctx.Worker=class{
    constructor(src){
      if(typeof src!=='string'||src.indexOf('DracoDecoderModule')<0)
        throw new Error('Worker ожидает исходник, получен '+(typeof src));
      const c=Object.assign({},HOST);
      c.self=c;c.globalThis=c;
      /* окружение настоящего воркера — так же декодер видит его в браузере */
      c.importScripts=function(){};
      c.location={href:'blob:draco-worker'};
      c.postMessage=data=>{setTimeout(()=>{if(this.onmessage)this.onmessage({data});},0);};
      vm.createContext(c);
      vm.runInContext(src,c,{filename:'draco-worker.js'});
      this._ctx=c;this.onmessage=null;
    }
    postMessage(msg){
      setTimeout(()=>{
        const f=this._ctx.onmessage;
        if(f)f({data:msg});else throw new Error('воркер не принял onmessage');
      },0);
    }
    terminate(){}
  };
}
/* Worker запрещён — так проверяем офлайн-хук (декодирование в основном потоке) */
function forbidWorkers(ctx){
  const boom=()=>{throw new Error('Worker/Blob недоступны в этом сценарии');};
  ctx.Worker=class{constructor(){boom();}};
  ctx.Blob=class{constructor(){boom();}};
  ctx.URL={createObjectURL:boom,revokeObjectURL:boom};
}

/* ---------------- загрузка страницы в контекст ---------------- */
function scriptBlocks(html){
  const out=[];
  const re=/<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))){
    const src=(m[1].match(/src\s*=\s*"([^"]+)"/)||[])[1]||null;
    out.push({src,code:m[2]});
  }
  return out;
}

async function boot(file,opts){
  opts=opts||{};
  const html=fs.readFileSync(file,'utf8');
  const blocks=scriptBlocks(html);
  const rafQueue=[];
  const sandbox={
    console,
    setTimeout,clearTimeout,setInterval,clearInterval,
    performance:{now:()=>Date.now()},
    WebAssembly,TextDecoder,TextEncoder,
    requestAnimationFrame:cb=>{rafQueue.push(cb);return rafQueue.length;},
    cancelAnimationFrame(){},
    matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
    devicePixelRatio:1,innerWidth:1280,innerHeight:720,
    Path2D:class{moveTo(){}lineTo(){}closePath(){}arc(){}quadraticCurveTo(){}bezierCurveTo(){}},
    Image:class{constructor(){this.width=1;this.height=1;}},
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    btoa:s=>Buffer.from(s,'binary').toString('base64'),
    Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,
    Float32Array,Float64Array,DataView,ArrayBuffer,
    Math,JSON,Date,Object,Array,String,Number,Boolean,Error,Promise,Symbol,
    Map,Set,WeakMap,WeakSet,Function,RegExp,isNaN,isFinite,parseInt,parseFloat
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.self=sandbox;
  sandbox.navigator={userAgent:'node-car-test',maxTouchPoints:opts.touch?5:0};
  sandbox.addEventListener=()=>{};
  sandbox.removeEventListener=()=>{};
  const els={};
  const getEl=id=>(els[id]=els[id]||makeEl(id));
  sandbox.document={
    createElement:t=>t==='canvas'?Object.assign(makeEl('canvas'),{tagName:'CANVAS'}):makeEl(''),
    getElementById:getEl,
    querySelector:s=>getEl(s.replace(/^#/,'')),
    querySelectorAll:()=>[],
    addEventListener(){},removeEventListener(){},
    write(){},
    body:getEl('body'),documentElement:getEl('html'),
    hidden:false,visibilityState:'visible',
    currentScript:null
  };
  if(opts.workers===false)forbidWorkers(sandbox);
  else makeWorkerStub(sandbox);
  vm.createContext(sandbox);

  const base=path.dirname(file);
  for(const b of blocks){
    let code=b.code;
    if(b.src){
      if(opts.noExternal)throw new Error('в файле осталась внешняя зависимость: '+b.src);
      code=fs.readFileSync(path.resolve(base,b.src),'utf8');
    }
    vm.runInContext(code,sandbox,{filename:b.src||'inline'});
    /* three появился (из файла или из встроенного блока) — чиним FileLoader и WebGL */
    if(sandbox.THREE&&!sandbox.THREE.__patched){
      sandbox.THREE.__patched=true;
      class FakeRenderer{
        constructor(){this.domElement=getEl('gl');this.shadowMap={enabled:false,type:0};
          this.info={render:{calls:0,triangles:0}};}
        setPixelRatio(r){this._pr=r;}setSize(){}render(){}dispose(){}
        setClearColor(){}getPixelRatio(){return this._pr||1;}
      }
      sandbox.THREE.WebGLRenderer=FakeRenderer;
      patchFileLoader(sandbox.THREE,opts.loaderMode||'disk',base);
    }
  }
  const tick=async ms=>{const t0=Date.now();while(Date.now()-t0<ms)await new Promise(r=>setTimeout(r,10));};
  const G=sandbox.__game;
  const el=id=>sandbox.document.getElementById(id);
  return {sandbox,G,els,el,tick,rafQueue};
}

/* ---------------- общие проверки машины ---------------- */
function carAssertions(G,sandbox,label){
  const A=G.assets;
  ok(A.ready===true,label+': модель загружена (assets.ready)');
  ok(A.meshes===51,label+': 51 меш в модели, получено '+A.meshes);
  ok(A.triangles>300000&&A.triangles<500000,
    label+': ~359 тыс. треугольников, получено '+A.triangles);

  const info=G.carInfo();
  ok(info&&info.gltf===true,label+': игрок едет на 3D-модели, а не на запасной машине');
  ok(info.wheels===4,label+': 4 колеса найдены (передние — в держателях для руля)');
  ok(info.tailLights===true,label+': стоп-сигналы подключены (материал найден)');
  ok(info.tris>300000,label+': геометрия игрока полная: '+info.tris+' треугольников');

  /* габариты и ориентация шаблона: длина 4.55 м, колёса на земле, нос в +Z, левый борт в +X */
  const THREE=sandbox.THREE;
  const tpl=A.carTemplate;
  tpl.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(tpl);
  const size=box.getSize(new THREE.Vector3());
  ok(Math.abs(size.z-4.55)<0.05,label+': длина машины 4.55 м (есть '+size.z.toFixed(3)+')');
  ok(Math.abs(box.min.y)<0.02,label+': колёса стоят на земле (min.y='+box.min.y.toFixed(4)+')');
  const wp=o=>new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  const fl=wp(tpl.getObjectByName('wheel_fl')),fr=wp(tpl.getObjectByName('wheel_fr'));
  const rl=wp(tpl.getObjectByName('wheel_rl'));
  ok(fl.z>rl.z,label+': нос смотрит в +Z (переднее колесо z='+fl.z.toFixed(2)+' > заднее '+rl.z.toFixed(2)+')');
  ok(fl.x>fr.x,label+': левый борт в +X — машина не зеркальна');

  /* у каждой машины свой материал кузова: шаблон общий, перекрашивать соседей нельзя */
  const cars=G.cars;
  ok(new Set(cars.map(c=>c.bodyMat)).size===cars.length,
    label+': у всех 6 машин свои материалы кузова');
  ok(new Set(cars.map(c=>c.tailLights)).size===cars.length,
    label+': стоп-сигналы у каждой машины свои (общий шаблон не перекрашивается)');
  const colors=new Set(cars.map(c=>c.bodyMat.color.getHexString()));
  ok(colors.size>=5,label+': цвета машин различаются ('+colors.size+' из 6)');
  ok(G.player.bodyMat.color.getHexString()==='d41818',
    label+': цвет игрока = выбранному в меню ('+G.player.bodyMat.color.getHexString()+')');

  /* стоп-сигналы реагируют на тормоз (проверяется в гонке, где работает физика) */
  const p=G.player;
  G.input.down=true;G.tick(1/60);
  const hot=p.tailLights?p.tailLights.emissiveIntensity:0;
  G.input.down=false;G.tick(1/60);
  const cold=p.tailLights?p.tailLights.emissiveIntensity:1;
  ok(hot>cold,label+': стоп-сигналы горят ярче при торможении ('+cold+' → '+hot+')');

  /* тени: ИИ-машины далеко от игрока не идут в теневую карту */
  if(p.casters){
    const ai=cars.find(c=>c.isAI);
    const home=ai.pos.clone();
    ai.pos.copy(p.pos).add(new THREE.Vector3(600,0,600));
    for(let i=0;i<40;i++)G.tick(1/60);
    const far=ai.casters.every(m=>m.castShadow===false);
    ai.pos.copy(p.pos).add(new THREE.Vector3(6,0,0));
    for(let i=0;i<40;i++)G.tick(1/60);
    const near=ai.casters.every(m=>m.castShadow===true);
    ai.pos.copy(home);
    ok(far&&near,label+': тени ИИ включаются только рядом с игроком (минус ~359 тыс. треуг. на карту теней)');
  }
}

async function raceCheck(G,label){
  ok(G.tryStart()===true,label+': старт разрешён — машина готова');
  ok(G.game.state==='countdown',label+': гонка стартовала (обратный отсчёт)');
  for(let i=0;i<60*8;i++)G.tick(1/60);
  ok(G.game.state==='racing'||G.game.state==='finished',label+': после отсчёта едем ('+G.game.state+')');
  let finite=true;
  for(const c of G.cars){
    if(!isFinite(c.pos.x)||!isFinite(c.pos.z)||!isFinite(c.vf)||!isFinite(c.heading))finite=false;
    if(Math.abs(c.vf)>90)finite=false;
    for(const w of c.wheels){
      if(!isFinite(w.spin.rotation.x)||!isFinite(w.wg.rotation.y))finite=false;
    }
  }
  ok(finite,label+': физика и колёса стабильны на 3D-модели (8 с гонки)');
  const moved=G.cars.filter(c=>c.isAI).some(c=>c.totalProg()>50);
  ok(moved,label+': соперники поехали');
}

/* ================================================================
   СЦЕНАРИЙ 1 — обычная страница, модель ещё грузится
   ================================================================ */
(async()=>{
  section('1. new-project/index.html — блокировка старта до загрузки модели');
  const env=await boot(path.join(NP,'index.html'),{loaderMode:'slow'});
  const G=env.G;
  ok(!!G,'игра инициализирована (window.__game)');
  ok(G.game.state==='menu','стартовое меню');
  ok(G.cars.length===6,'6 машин на старте');
  ok(G.perfInfo().lightAI===false,'без touch (десктоп) соперники остаются с настоящей моделью');

  const btn=env.el('btnStart'),st=env.el('modelStatus'),fill=env.el('modelBarFill');
  ok(btn.disabled===true,'кнопка «ПОЕХАЛИ» заблокирована, пока модель грузится');
  ok(/ЗАГРУЗКА МАШИНЫ/.test(btn.innerHTML),'на кнопке видно загрузку: «'+btn.innerHTML+'»');
  ok(G.tryStart()===false,'tryStart() не пускает в гонку без машины');
  ok(G.game.state==='menu','гонка не началась мимо загрузки модели');

  await env.tick(300);
  const pct=/(\d+)%/.test(st.textContent)?RegExp.$1:null;
  ok(pct!==null,'показан прогресс загрузки: «'+st.textContent+'»');
  ok(fill&&/^\d+%$/.test(fill.style.width||''),'полоса прогресса заполнена: '+(fill&&fill.style.width));
  ok(G.assets.ready===false||G.assets.progress>0,'прогресс считается');

  section('2. модель приехала — машина настоящая');
  for(let i=0;i<120&&!G.assets.ready;i++)await env.tick(50);
  ok(G.assets.ready===true,'модель загрузилась');
  ok(btn.disabled===false,'кнопка «ПОЕХАЛИ» открылась сама');
  ok(/ПОЕХАЛИ/.test(btn.innerHTML),'на кнопке снова «ПОЕХАЛИ»: «'+btn.innerHTML+'»');
  ok(/^✓/.test(st.textContent),'статус сообщает об успехе: «'+st.textContent+'»');
  await raceCheck(G,'сеть');
  carAssertions(G,env.sandbox,'сеть');

  /* ================================================================
     СЦЕНАРИЙ 3 — play.html: один файл, без сети и без воркеров
     ================================================================ */
  section('3. new-project/play.html — самодостаточный офлайн-файл');
  const html=fs.readFileSync(path.join(NP,'play.html'),'utf8');
  ok(html.indexOf('<script src=')<0,'нет внешних скриптов');
  ok(html.indexOf("url('assets/")<0,'нет внешних картинок');
  ok(html.indexOf("'assets/ferrari")<0&&html.indexOf("'assets/draco")<0,'нет внешних ссылок на модель и декодер');
  ok(html.indexOf('data:model/gltf-binary;base64,')>0,'модель встроена как data-URI');
  ok(html.indexOf('__DRACO_JS_B64')>0,'декодер Draco встроен в файл');
  ok(Math.round(html.length/1048576*100)/100<6,'размер вменяемый: '+(html.length/1048576).toFixed(2)+' МБ');

  const off=await boot(path.join(NP,'play.html'),{loaderMode:'dataonly',workers:false,noExternal:true});
  const OG=off.G;
  ok(!!OG,'офлайн-файл запускается без папки assets/');
  for(let i=0;i<200&&!OG.assets.ready;i++)await off.tick(50);
  ok(OG.assets.ready===true,'модель декодирована в основном потоке (без Worker, без сети)');
  ok(OG.assets.failed===false,'без ошибок загрузки');
  ok(off.el('btnStart').disabled===false,'кнопка старта в офлайн-файле открыта');
  await raceCheck(OG,'офлайн');
  carAssertions(OG,off.sandbox,'офлайн');

  /* ================================================================
     СЦЕНАРИЙ 4 — модель недоступна: старт не должен запираться
     ================================================================ */
  section('4. модель не загрузилась — запасной автомобиль, старт не заперт');
  const bad=await boot(path.join(NP,'index.html'),{loaderMode:'fail'});
  const BG=bad.G;
  for(let i=0;i<100&&!BG.assets.failed;i++)await bad.tick(50);
  ok(BG.assets.failed===true,'ошибка загрузки замечена');
  ok(BG.assets.unlocked===true,'старт разблокирован — игрок не заперт в меню');
  ok(bad.el('btnStart').disabled===false,'кнопка «ПОЕХАЛИ» нажмётся');
  ok(/^⚠/.test(bad.el('modelStatus').textContent),
    'игроку объяснили, что машина запасная: «'+bad.el('modelStatus').textContent+'»');
  ok(BG.carInfo().gltf===false,'в гонке запасная (процедурная) машина');
  ok(BG.carInfo().wheels===4,'у запасной машины тоже 4 колеса');

  /* пропорции запасной машины — низкий суперкар по референсу, а не «кирпич».
     Меряем в локальных координатах: на время снимаем поворот/позицию со стартовой
     решётки, иначе бокс измеряет повёрнутую машину и врёт. */
  const TH=bad.sandbox.THREE;
  const pm=BG.player.mesh;
  const keepP=pm.position.clone(),keepR=pm.rotation.clone();
  pm.position.set(0,0,0);pm.rotation.set(0,0,0);
  pm.updateMatrixWorld(true);
  const bb=new TH.Box3().setFromObject(pm);
  pm.position.copy(keepP);pm.rotation.copy(keepR);pm.updateMatrixWorld(true);
  const bs=bb.getSize(new TH.Vector3());
  ok(bs.z>4.3&&bs.z<4.9,'запасная машина длиной как суперкар: '+bs.z.toFixed(2)+' м');
  ok(bs.x>1.7&&bs.x<2.1,'запасная машина шириной как суперкар: '+bs.x.toFixed(2)+' м');
  ok(bs.y>0.9&&bs.y<1.25,'запасная машина низкая, силуэт не «кирпич»: '+bs.y.toFixed(2)+' м');
  ok(Math.abs(bb.min.y)<0.02,'запасная машина стоит колёсами на земле');
  const gi=BG.carInfo();
  ok(gi.meshes>=25,'запасная машина детализирована: '+gi.meshes+' мешей (кокпит, стекло, фары, диски)');
  ok(gi.tailLights===true,'у запасной машины стоп-сигналы подключены');
  ok(BG.tryStart()===true,'гонка начинается и без 3D-модели');
  for(let i=0;i<60*6;i++)BG.tick(1/60);
  ok(BG.game.state==='racing'||BG.game.state==='finished','заезд идёт: '+BG.game.state);

  /* ================================================================
     СЦЕНАРИЙ 5 — слабый телефон: лёгкие соперники и губернер FPS
     ================================================================ */
  section('5. телефон (touch): лёгкие соперники, DPR и губернер FPS');
  const ph=await boot(path.join(NP,'index.html'),{touch:true});
  const PG=ph.G;
  for(let i=0;i<200&&!PG.assets.ready;i++)await ph.tick(50);
  ok(PG.assets.ready===true,'модель загрузилась и на телефоне');
  const pi0=PG.perfInfo();
  ok(pi0.touch===true,'телефон распознан как touch-устройство');
  ok(pi0.lightAI===true,'на телефоне соперники переводятся на лёгкие меши');
  ok(pi0.cars.filter(c=>c.ai).every(c=>!c.gltf),'все 5 соперников — лёгкие процедурные меши');
  ok(pi0.cars.find(c=>!c.ai).gltf===true,'машина игрока — настоящая Ferrari');
  ok(pi0.dpr<=1.0,'DPR телефона ограничен 1.0: '+pi0.dpr);
  ok(pi0.shadows===true,'тени на старте включены');

  PG.game.state='racing';
  for(let i=0;i<70;i++)PG._perfTick(1/30);        // ~2.3 с по 30 FPS
  const pi1=PG.perfInfo();
  ok(pi1.lvl>=1,'просадка до 30 FPS опустила качество: ступень '+pi1.lvl);
  ok(pi1.dpr<pi0.dpr,'разрешение уменьшено: dpr '+pi1.dpr);
  for(let i=0;i<70;i++)PG._perfTick(1/30);
  const pi2=PG.perfInfo();
  ok(pi2.lvl===2&&pi2.shadows===false,'далее ступень 2 — без теней: lvl '+pi2.lvl);
  for(let i=0;i<700;i++)PG._perfTick(1/60);       // ~11.7 с по 60 FPS
  const pi3=PG.perfInfo();
  ok(pi3.lvl===0&&pi3.shadows===true,'стабильные 60 FPS вернули качество: lvl '+pi3.lvl);
  await ph.close?ph.close():null;

  section('Итог');
  console.log('проверок: '+checks+', провалено: '+fails);
  if(fails){console.error('\nCAR MODEL TEST FAILED ❌');process.exit(1);}
  console.log('\nALL CAR TESTS PASSED ✅');
  process.exit(0);
})().catch(e=>{console.error('ОШИБКА ТЕСТА:',e);process.exit(1);});
