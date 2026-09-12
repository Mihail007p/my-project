'use strict';
/* Софтверный рендерер машины: смотрим на неё БЕЗ браузера и WebGL.
   В песочнице нет Chrome/puppeteer, поэтому этот скрипт поднимает игру в
   Node-vm (как tools/car-model-test.js), но вместо прогонов физики рисует
   меш своим z-буферным растром и пишет PNG.

   Использование:  node tools/soft-render.js [каталог-вывода]
   По умолчанию:   tools/soft-render-out/
   Рисует: запасную машину (режим fail) в 3 ракурсах и настоящую GLTF-модель
   сзади-сверху-сбоку для сравнения. Подробности — docs/AI-HANDBOOK.md. */
const fs=require('fs'),path=require('path'),vm=require('vm'),zlib=require('zlib');
const NP=path.join(__dirname,'..','new-project');
const OUT=process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'soft-render-out');
fs.mkdirSync(OUT,{recursive:true});

/* ---------- PNG encoder ---------- */
function crc32(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}
  let crc=0xFFFFFFFF;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&255]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len,td,crc]);}
function writePng(file,w,h,rgb){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const raw=Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);}
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

/* ---------- стабы ---------- */
const ctx2d=new Proxy({},{get(t,p){if(p==='canvas')return{};return()=>{
  if(p==='createLinearGradient'||p==='createRadialGradient')return{addColorStop(){}};
  if(p==='getImageData')return{data:new Uint8ClampedArray(4)};
  if(p==='measureText')return{width:10};return undefined;};},set(){return true;}});
function makeEl(id){return{id:id||'',style:{},dataset:{},children:[],textContent:'',innerHTML:'',disabled:false,
  classList:{_s:new Set(),add(){},remove(){},toggle(){return true;},contains(){return false;}},
  addEventListener(){},appendChild(c){return c;},removeChild(){},setAttribute(){},remove(){},closest(){return null;},
  querySelector(){return makeEl('q');},querySelectorAll(){return[];},getBoundingClientRect(){return{left:0,top:0,width:100,height:100};},
  getContext(){return ctx2d;},toDataURL(){return'';},width:300,height:150};}
function boot(file,mode){
  const html=fs.readFileSync(file,'utf8');
  const blocks=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(m=>({src:(m[1].match(/src="([^"]+)"/)||[])[1],code:m[2]}));
  const els={};const getEl=id=>(els[id]=els[id]||makeEl(id));
  const sb={console,setTimeout,clearTimeout,setInterval,clearInterval,performance:{now:()=>Date.now()},
    WebAssembly,TextDecoder,TextEncoder,requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    matchMedia:()=>({matches:false}),devicePixelRatio:1,innerWidth:1280,innerHeight:720,
    Path2D:class{moveTo(){}lineTo(){}closePath(){}arc(){}quadraticCurveTo(){}bezierCurveTo(){}},atob:s=>Buffer.from(s,'base64').toString('binary'),
    Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView,ArrayBuffer,
    Math,JSON,Date,Object,Array,String,Number,Boolean,Error,Promise,Symbol,Map,Set,WeakMap,Function,RegExp,isNaN,isFinite,parseInt,parseFloat};
  sb.window=sb;sb.globalThis=sb;sb.self=sb;
  sb.navigator={userAgent:'render',maxTouchPoints:0};
  sb.addEventListener=()=>{};
  sb.document={createElement:t=>makeEl(t),getElementById:getEl,querySelector:s=>getEl(s),querySelectorAll:()=>[],
    addEventListener(){},write(){},body:getEl('body'),documentElement:getEl('html'),hidden:false,visibilityState:'visible'};
  vm.createContext(sb);
  const base=path.dirname(file);
  for(const b of blocks){
    let code=b.code;
    if(b.src)code=fs.readFileSync(path.resolve(base,b.src),'utf8');
    vm.runInContext(code,sb,{filename:b.src||'inline'});
    if(sb.THREE&&!sb.THREE.__p){
      sb.THREE.__p=true;
      sb.THREE.WebGLRenderer=class{constructor(){this.domElement=getEl('gl');this.shadowMap={};}
        setPixelRatio(){}setSize(){}render(){}dispose(){}setClearColor(){}getPixelRatio(){return 1;}};
      sb.THREE.FileLoader.prototype.load=function(url,onLoad,onProgress,onError){
        setImmediate(()=>{
          try{
            if(mode==='fail')throw new Error('404 '+url);
            const full=(this.path||'')+url;let data;
            if(/^data:/.test(full))data=Buffer.from(full.slice(full.indexOf('base64,')+7),'base64');
            else data=fs.readFileSync(path.resolve(base,full));
            const out=this.responseType==='text'?data.toString('utf8'):data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
            onLoad(out);
          }catch(e){onError&&onError(e);}
        });
        return this;
      };
      // воркер для Draco
      const HOST={console,WebAssembly,setTimeout,clearTimeout,performance,TextDecoder,TextEncoder,Promise,Math,JSON,Date,
        Object,Array,String,Number,Boolean,Error,isNaN,isFinite,parseInt,parseFloat,Symbol,Map,Set,WeakMap,Function,
        Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView,ArrayBuffer};
      sb.Blob=class{constructor(p){this.parts=p;}};
      sb.URL={createObjectURL:b=>b.parts.join(''),revokeObjectURL(){}};
      sb.Worker=class{constructor(src){const c=Object.assign({},HOST);c.self=c;c.globalThis=c;
        c.importScripts=function(){};c.location={href:'blob:w'};
        c.postMessage=d=>{setImmediate(()=>{if(this.onmessage)this.onmessage({data:d});});};
        vm.createContext(c);vm.runInContext(src,c,{filename:'w.js'});this._ctx=c;this.onmessage=null;}
        postMessage(m){setImmediate(()=>{const f=this._ctx.onmessage;if(f)f({data:m});});}terminate(){}};
    }
  }
  return {sb,getEl};
}

/* ---------- софтверный растер ---------- */
function renderMesh(root,file,W,H,camPos,lookAt){
  const THREE=root.__THREE;
  root.mesh.updateMatrixWorld(true);
  const tris=[];
  root.mesh.traverse(o=>{
    if(!o.isMesh)return;
    const g=o.geometry;const pos=g.attributes.position;const idx=g.index;
    const col=o.material&&o.material.color?o.material.color:{r:.7,g:.7,b:.7};
    const em=o.material&&o.material.emissive?o.material.emissive:null;
    const ei=o.material?o.material.emissiveIntensity||0:0;
    const n=idx?idx.count:pos.count;
    for(let i=0;i<n;i+=3){
      const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;
      const va=new THREE.Vector3().fromBufferAttribute(pos,a).applyMatrix4(o.matrixWorld);
      const vb=new THREE.Vector3().fromBufferAttribute(pos,b).applyMatrix4(o.matrixWorld);
      const vc=new THREE.Vector3().fromBufferAttribute(pos,c).applyMatrix4(o.matrixWorld);
      tris.push([va,vb,vc,col,em,ei]);
    }
  });
  // камера
  const fwd=new THREE.Vector3().subVectors(lookAt,camPos).normalize();
  const up=new THREE.Vector3(0,1,0);
  const right=new THREE.Vector3().crossVectors(fwd,up).normalize();
  const upv=new THREE.Vector3().crossVectors(right,fwd).normalize();
  const fov=40*Math.PI/180,f=1/Math.tan(fov/2);
  const zbuf=new Float64Array(W*H).fill(Infinity);
  const img=Buffer.alloc(W*H*3);
  for(let i=0;i<img.length;i+=3){img[i]=168;img[i+1]=188;img[i+2]=208;}   // небо-подложка
  const L=new THREE.Vector3(.5,.8,.45).normalize();
  for(const[v0,v1,v2,col,em,ei]of tris){
    const pr=[v0,v1,v2].map(v=>{
      const d=new THREE.Vector3().subVectors(v,camPos);
      const z=d.dot(fwd);if(z<0.05)return null;
      const x=d.dot(right),y=d.dot(upv);
      return[W/2+(x/z)*f*(W/2)/(1),H/2-(y/z)*f*(W/2),z];
    });
    if(pr.some(p=>!p))continue;
    // нормали для света
    const e1=new THREE.Vector3().subVectors(v1,v0),e2=new THREE.Vector3().subVectors(v2,v0);
    const nrm=new THREE.Vector3().crossVectors(e1,e2).normalize();
    let li=Math.max(0,nrm.dot(L))*.85+.25;
    let r=Math.min(255,(col.r*li+(em?em.r*ei:0))*255)|0;
    let g=Math.min(255,(col.g*li+(em?em.g*ei:0))*255)|0;
    let b=Math.min(255,(col.b*li+(em?em.b*ei:0))*255)|0;
    const minX=Math.max(0,Math.floor(Math.min(pr[0][0],pr[1][0],pr[2][0])));
    const maxX=Math.min(W-1,Math.ceil(Math.max(pr[0][0],pr[1][0],pr[2][0])));
    const minY=Math.max(0,Math.floor(Math.min(pr[0][1],pr[1][1],pr[2][1])));
    const maxY=Math.min(H-1,Math.ceil(Math.max(pr[0][1],pr[1][1],pr[2][1])));
    const d=(a,b2,c2)=>(b2[0]-a[0])*(c2[1]-a[1])-(b2[1]-a[1])*(c2[0]-a[0]);
    const area=d(pr[0],pr[1],pr[2]);if(area===0)continue;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const p=[x+.5,y+.5];
      const w0=d(pr[1],pr[2],p)/area,w1=d(pr[2],pr[0],p)/area,w2=d(pr[0],pr[1],p)/area;
      if(w0<0||w1<0||w2<0)continue;
      const z=w0*pr[0][2]+w1*pr[1][2]+w2*pr[2][2];
      const o=y*W+x;
      if(z<zbuf[o]){zbuf[o]=z;img[o*3]=r;img[o*3+1]=g;img[o*3+2]=b;}
    }
  }
  writePng(file,W,H,img);
  return tris.length;
}

(async()=>{
  const views=[
    ['rear34',new (require('util').types?Object:Object)()],
  ];
  // 1) запасная машина
  const F=boot(path.join(NP,'index.html'),'fail');
  for(let i=0;i<60&&!F.sb.__game.assets.failed;i++)await new Promise(r=>setTimeout(r,25));
  const FG=F.sb.__game;
  FG.player.mesh.position.set(0,0,0);FG.player.mesh.rotation.set(0,0,0);FG.player.mesh.updateMatrixWorld(true);
  const THREE=F.sb.THREE;
  const box=new THREE.Box3().setFromObject(FG.player.mesh);
  const sz=box.getSize(new THREE.Vector3());
  console.log('fallback car size:',sz.x.toFixed(2),sz.y.toFixed(2),sz.z.toFixed(2),'min.y',box.min.y.toFixed(2));
  let t=0;
  t=renderMesh({mesh:FG.player.mesh,__THREE:THREE},path.join(OUT,'fallback-rear34.png'),760,500,
    new THREE.Vector3(-4.2,2.2,-4.6),new THREE.Vector3(0,.55,0));
  renderMesh({mesh:FG.player.mesh,__THREE:THREE},path.join(OUT,'fallback-side.png'),760,420,
    new THREE.Vector3(-6.4,1.1,0),new THREE.Vector3(0,.55,0));
  renderMesh({mesh:FG.player.mesh,__THREE:THREE},path.join(OUT,'fallback-front34.png'),760,500,
    new THREE.Vector3(4.4,2.0,4.8),new THREE.Vector3(0,.5,0));
  const THREEd=F.sb.THREE;
  const bb2=new THREEd.Box3();
  FG.player.mesh.updateMatrixWorld(true);
  const inv2=new THREEd.Matrix4().copy(FG.player.mesh.matrixWorld).invert();
  FG.player.mesh.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry.computeBoundingBox();
    const gb=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv2);
    bb2.union(gb);
    const sz=gb.getSize(new THREEd.Vector3());
    if(sz.x>1.6||sz.z>4.7||Math.abs(gb.min.x)>1.0||Math.abs(gb.max.x)>1.0)
      console.log('WIDE:',o.geometry.type,sz.x.toFixed(2),sz.y.toFixed(2),sz.z.toFixed(2),'x:',gb.min.x.toFixed(2),gb.max.x.toFixed(2),'z:',gb.min.z.toFixed(2),gb.max.z.toFixed(2));
  });
  const s2=bb2.getSize(new THREEd.Vector3());
  console.log('local bbox',s2.x.toFixed(2),s2.y.toFixed(2),s2.z.toFixed(2));
  console.log('fallback triangles:',t);

  // 2) настоящая модель для сравнения
  const G=boot(path.join(NP,'index.html'),'disk');
  for(let i=0;i<200&&!G.sb.__game.assets.ready;i++)await new Promise(r=>setTimeout(r,25));
  const GG=G.sb.__game;
  console.log('gltf ready:',GG.assets.ready);
  GG.player.mesh.position.set(0,0,0);GG.player.mesh.rotation.set(0,0,0);GG.player.mesh.updateMatrixWorld(true);
  const T2=G.sb.THREE;
  renderMesh({mesh:GG.player.mesh,__THREE:T2},path.join(OUT,'gltf-rear34.png'),760,500,
    new T2.Vector3(-4.2,2.2,-4.6),new T2.Vector3(0,.55,0));
  console.log('done');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
