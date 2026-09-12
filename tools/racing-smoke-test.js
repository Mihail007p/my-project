/* Смоук-тест гонки: стабы DOM/WebGL + прогон игрового цикла в Node */
'use strict';
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','new-project','index.html'),'utf8');
const m=html.match(/<script>\n([\s\S]*?)<\/script>/);
if(!m){console.error('FAIL: inline script not found');process.exit(1);}
const src=m[1];

/* --- стабы браузера --- */
const ctx2d=new Proxy({},{
  get(t,p){
    if(p==='canvas')return{};
    return(...a)=>{
      if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern')
        return{addColorStop(){}};
      if(p==='getImageData')return{data:new Uint8ClampedArray(4)};
      if(p==='measureText')return{width:10};
      return undefined;
    };
  },
  set(){return true;}
});
function fakeCanvas(){return{width:300,height:150,style:{},addEventListener(){},
  getContext:()=>ctx2d,toDataURL:()=>''};}
function fakeEl(){return new Proxy({_s:{}},{
  get(t,p){
    if(p==='style')return t._s;
    if(p==='classList')return{add(){},remove(){},toggle(){},contains:()=>false};
    if(p==='getContext')return()=>ctx2d;
    if(p==='addEventListener'||p==='appendChild'||p==='removeChild'||p==='setAttribute'||p==='remove'||p==='closest')return()=>{};
    if(p==='querySelector')return()=>fakeEl();
    if(p==='querySelectorAll')return()=>[];
    if(p==='getBoundingClientRect')return()=>({left:0,top:0,width:100,height:100});
    return t[p];
  },
  set(t,p,v){t[p]=v;return true;}
});}
let rafCb=null;
global.window=global;
global.innerWidth=1280;global.innerHeight=720;global.devicePixelRatio=1;
global.requestAnimationFrame=cb=>{rafCb=cb;return 1;};
global.matchMedia=()=>({matches:false});
global.addEventListener=()=>{};
Object.defineProperty(global,'navigator',{value:{userAgent:'node',maxTouchPoints:0},configurable:true});
global.document={
  createElement:t=>t==='canvas'?fakeCanvas():fakeEl(),
  getElementById:()=>fakeEl(),
  querySelector:()=>fakeEl(),
  querySelectorAll:()=>[],
  addEventListener(){},
  body:fakeEl(),
  documentElement:fakeEl(),
  hidden:false,visibilityState:'visible'
};
global.performance={now:()=>Date.now()};
global.Path2D=class{moveTo(){}lineTo(){}closePath(){}arc(){};}

/* --- three.js + стаб WebGLRenderer --- */
const THREE=require(path.join(__dirname,'..','new-project','lib','three.min.js'));
class FakeRenderer{
  constructor(){this.domElement=fakeCanvas();this.shadowMap={};}
  setPixelRatio(){}setSize(){}render(){}dispose(){}
}
THREE.WebGLRenderer=FakeRenderer;
global.THREE=THREE;

/* --- запуск игры --- */
eval(src);
const G=global.window.__game;
const assert=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1);}else console.log('ok –',msg);};

assert(G&&G.track&&G.track.L>2500,'трасса построена, длина '+Math.round(G.track.L)+' м');
assert(G.cars.length===6,'6 машин на старте');
assert(G.game.state==='menu','стартовое меню');

// конечные числа в данных трассы
let finite=true;
for(const p of G.track.pts)if(!isFinite(p.x)||!isFinite(p.z))finite=false;
assert(finite,'точки трассы конечны');

// старт гонки + 90 секунд симуляции (без ввода — едут ИИ, игрок стоит)
G.start();
assert(G.game.state==='countdown','обратный отсчёт');
let t=performance.now();
for(let i=0;i<60*95&&rafCb;i++){t+=16.7;rafCb(t);}
assert(G.game.state==='racing'||G.game.state==='finished','гонка идёт: '+G.game.state);
finite=true;
for(const c of G.cars){
  if(!isFinite(c.pos.x)||!isFinite(c.pos.z)||!isFinite(c.vf)||!isFinite(c.heading))finite=false;
  if(Math.abs(c.vf)>90)finite=false;
}
assert(finite,'физика стабильна (нет NaN/разгона)');

const maxAI=Math.max(...G.cars.filter(c=>c.isAI).map(c=>c.totalProg()));
assert(maxAI>G.track.L*0.35,'ИИ проехал '+Math.round(maxAI)+' м за ~95 с');

// симуляция ввода игрока: газ + руль на 40 с
const P=G.player;
let crashes=0;
t=performance.now();
for(let i=0;i<60*40&&rafCb;i++){
  if(i%600===0)console.log('  t+'+Math.round(i/60)+'s pos='+P.pos.x.toFixed(1)+','+P.pos.z.toFixed(1)+
    ' v='+(P.vf*3.6).toFixed(0)+'km/h lap='+P.lap+' s='+Math.round(P.s));
  // pure-pursuit: цель — точка на трассе впереди по центру
  const wrapA=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
  const look=Math.max(4,Math.round((8+Math.abs(P.vf)*0.6)/G.track.segLen));
  const ti=(P.idx+look)%G.track.N;
  const tp=G.track.pts[ti];
  const des=Math.atan2(tp.x-P.pos.x,tp.z-P.pos.z);
  const err=wrapA(des-P.heading);
  G.input.left=err>0.02;G.input.right=err<-0.02;
  // целевая скорость по кривизне впереди
  let vt=80;
  for(let k=2;k<120;k+=4){
    const j=(P.idx+k)%G.track.N;
    const vc=Math.sqrt(9.5/Math.max(G.track.curs[j],1e-4));
    vt=Math.min(vt,Math.sqrt(vc*vc+2*12*Math.max(0,k*G.track.segLen-6)));
  }
  G.input.up=P.vf<vt-1;G.input.down=P.vf>vt+1.5;
  t+=16.7;rafCb(t);
}
assert(isFinite(P.pos.x)&&isFinite(P.vf),'игроковая физика стабильна при полном газе');
assert(P.lap>=1,'игрок проехал минимум 1 круг (круг: '+P.lap+')');
assert(G.game.wrongWayT<30,'детектор разворота не сошёл с ума');

// --- регрессия: отбойник. Врезаемся влево, затем возвращаемся на дорогу ---
G.input.up=false;G.input.down=true;G.input.left=false;G.input.right=false;
for(let i=0;i<60*2;i++)G.tick(1/60);          // тормозим до ~50-60 км/ч
G.input.down=false;G.input.left=true;G.input.up=true;
let hitWall=false;
for(let i=0;i<60*8;i++){G.tick(1/60);if(Math.abs(P.lat)>6.9)hitWall=true;}
const vAtWall=Math.round(P.vf*3.6);
G.input.left=false;G.input.right=true;
let recovered=false;
for(let i=0;i<60*20;i++){G.tick(1/60);
  if(Math.abs(P.lat)<3.5&&P.vf>10){recovered=true;break;}}
assert(hitWall,'машина достигла отбойника');
assert(vAtWall>10,'скорость у стены не умирает в ноль ('+vAtWall+' км/ч)');
assert(recovered,'выход из отбойника за <20 с (lat='+P.lat.toFixed(1)+', v='+Math.round(P.vf*3.6)+' км/ч)');

console.log('\nALL TESTS PASSED ✅');
