'use strict';

import { REGION_STATUS, REGION_FIELDS, blankRegion, regionGet, regionSet } from './region.js';

import { deriveCables } from './cables.js';

let _host = null;
let _ctx  = null;

const LS='arrangeMockD2';
let S=null;
function defState(){return{uid:2,selPlan:null,zoom:1,panX:40,panY:20,
  dev:{expand:'replace',pips:false,nlabels:true,loopbox:false},plans:[]}}
function uid(){return 'k'+(S.uid++)}
function save(){try{localStorage.setItem(LS,JSON.stringify(S,(k,v)=>k[0]==='_'?undefined:v))}catch(e){}}
let _st;function saveSoon(){clearTimeout(_st);_st=setTimeout(save,250)}
function plan(){return S.plans.find(p=>p.id===S.selPlan)||S.plans[0]}
function phase(){const p=plan();return p.phases.find(x=>x.id===p.selPhase)||p.phases[0]}

let selNode=null, selCable=null;
let clipboard=null;

const UNDO=[],REDO=[];
function snapOf(pl,label){return{planId:pl.id,label:label,
  json:JSON.stringify(pl,(k,v)=>k[0]==='_'?undefined:v)}}
function snap(label){
  const pl=plan();if(!pl)return;
  UNDO.push(snapOf(pl,label));
  if(UNDO.length>40)UNDO.shift();
  REDO.length=0}
function restoreSnap(u){
  const ix=S.plans.findIndex(p=>p.id===u.planId);
  if(ix<0)return null;
  const keepLive=new Map();
  (S.plans[ix].phases||[]).forEach(ph=>{if(ph._live&&ph._live.length)keepLive.set(ph.id,ph._live)});
  S.plans[ix]=JSON.parse(u.json);
  S.plans[ix].phases.forEach(ph=>{const L=keepLive.get(ph.id);if(L)ph._live=L});
  S.selPlan=u.planId;selNode=selCable=null;
  S.plans[ix].phases.forEach(ph=>computeLoops(ph,true));
  save();render();
  return ix}
function undo(){
  if(!UNDO.length){toast('nothing to undo');return}
  const pl=plan(),u=UNDO.pop();
  if(pl)REDO.push(snapOf(pl,u.label));
  if(restoreSnap(u)===null){toast('undo target is gone');return}
  toast('undone: '+u.label+'   ('+UNDO.length+' left)')}
function redo(){
  if(!REDO.length){toast('nothing to redo');return}
  const pl=plan(),r=REDO.pop();
  if(pl)UNDO.push(snapOf(pl,r.label));
  if(restoreSnap(r)===null){toast('redo target is gone');return}
  toast('redone: '+r.label+'   ('+REDO.length+' left)')}

const $=s=>_host.querySelector(s);
let world=null, cwrap=null, svg=null, cablesG=null, ghost=null, rail=null, toastEl=null, ctxMenu=null;
let cabEnds=null;

function el(tag,cls,html){const d=document.createElement(tag);if(cls)d.className=cls;
  if(html!=null)d.innerHTML=html;return d}
let _tt;function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');
  clearTimeout(_tt);_tt=setTimeout(()=>toastEl.classList.remove('show'),2600)}


function askConfirm(message,onYes){
  if(_ctx&&_ctx.showConfirm){_ctx.showConfirm(message,onYes);return}
  toast('this window has no confirm surface — do it from the ADE tab')}
function askPrompt(message,def,onOk){
  if(_ctx&&_ctx.showPrompt){_ctx.showPrompt(message,def,onOk);return}
  toast('this window has no prompt surface — do it from the ADE tab')}

function perimXY(w,h,p){const P=2*(w+h),d=((p%1)+1)%1*P;
  if(d<w)return{x:d,y:0,e:'t'};
  if(d<w+h)return{x:w,y:d-w,e:'r'};
  if(d<2*w+h)return{x:w-(d-w-h),y:h,e:'b'};
  return{x:0,y:h-(d-2*w-h),e:'l'}}
function xyToP(w,h,x,y){x=Math.max(0,Math.min(w,x));y=Math.max(0,Math.min(h,y));
  const dT=y,dB=h-y,dL=x,dR=w-x,m=Math.min(dT,dB,dL,dR);let d;
  if(m===dT)d=x;else if(m===dR)d=w+y;else if(m===dB)d=w+h+(w-x);else d=2*w+h+(h-y);
  return d/(2*(w+h))}
const NORM={t:[0,-1],r:[1,0],b:[0,1],l:[-1,0]};
function worldPt(e){const r=cwrap.getBoundingClientRect();
  return{x:(e.clientX-r.left-S.panX)/S.zoom,y:(e.clientY-r.top-S.panY)/S.zoom}}

function computeLoops(ph,quiet){
  const adj={};ph.nodes.forEach(n=>adj[n.id]=[]);
  ph.cables.forEach(c=>{if(adj[c.a.n])adj[c.a.n].push(c.b.n)});
  const idx=new Map(),low=new Map(),on=new Map(),stk=[];let i=0;const sccs=[];
  function strong(v){idx.set(v,i);low.set(v,i);i++;stk.push(v);on.set(v,true);
    for(const w of adj[v]||[]){
      if(!idx.has(w)){strong(w);low.set(v,Math.min(low.get(v),low.get(w)))}
      else if(on.get(w))low.set(v,Math.min(low.get(v),idx.get(w)))}
    if(low.get(v)===idx.get(v)){const c=[];let w;
      do{w=stk.pop();on.set(w,false);c.push(w)}while(w!==v);sccs.push(c)}}
  ph.nodes.forEach(n=>{if(!idx.has(n.id))strong(n.id)});
  const selfL=new Set(ph.cables.filter(c=>c.a.n===c.b.n).map(c=>c.a.n));
  const found=sccs.filter(c=>c.length>1||selfL.has(c[0]));
  const old=new Map((ph.loops||[]).map(L=>[L.key,L]));
  const prevKeys=new Set(old.keys());
  ph.loops=found.map(comp=>{const key=comp.slice().sort().join('+');const prev=old.get(key);
    return{key,nodes:comp,maxCycles:prev?prev.maxCycles:'',maxCtx:prev?prev.maxCtx:''}});
  ph._loopEdges=new Set();const inL=new Map();
  ph.loops.forEach((L,ix)=>L.nodes.forEach(n=>inL.set(n,ix)));
  ph.cables.forEach(c=>{if(inL.has(c.a.n)&&inL.get(c.a.n)===inL.get(c.b.n))
    ph._loopEdges.add(c.id)});
  if(quiet)return;
  ph.loops.forEach((L,ix)=>{if(!prevKeys.has(L.key))
    toast('loop detected — ⟳ L'+(ix+1)+' · name its worktree + set the ceilings on the phase face')});
}
function loopWts(L,ph){const seen=[];
  L.nodes.forEach(id=>{const n=ph.nodes.find(x=>x.id===id);
    if(n&&n.wt&&seen.indexOf(n.wt)<0)seen.push(n.wt)});
  return seen}

function renderRail(){
  rail.innerHTML='';
  const pl=plan();
  pl.phases.forEach(ph=>{
    const b=el('div','ph'+(ph.id===pl.selPhase?' sel':'')+(ph.active?' live':''));
    const top=el('div','ph-top');
    const nm=el('span','ph-name');bindCE(nm,()=>ph.name,v=>ph.name=v);
    const lv=el('button','ph-live',null);lv.textContent='LIVE';
    lv.title='preview the active-phase light';
    lv.addEventListener('pointerdown',e=>e.stopPropagation());
    lv.addEventListener('click',e=>{e.stopPropagation();ph.active=!ph.active;
      saveSoon();renderRail()});
    top.append(nm,lv);b.append(top);
    b.append(el('div','ph-sec','shared files'));
    const pf=el('div','ph-files');
    ph.files.forEach((f,ix)=>{
      const row=el('div','pf-row');
      const s=el('span','pf-n',null);s.textContent=f;s.title=f;
      const x=el('button','pf-x','×');x.title='remove '+f+'  (⌘Z undoes it)';
      x.addEventListener('pointerdown',e=>e.stopPropagation());
      x.addEventListener('click',e=>{e.stopPropagation();snap('remove '+f);
        ph.files.splice(ix,1);saveSoon();renderRail()});
      row.addEventListener('pointerdown',e=>e.stopPropagation());
      row.append(s,x);pf.append(row)});
    const pfa=el('button','pf-add','+ file');
    pfa.addEventListener('pointerdown',e=>e.stopPropagation());
    pfa.addEventListener('click',e=>{e.stopPropagation();
      askPrompt('file for the phase kit:','',f=>{
        if(f){snap('add file');ph.files.push(f);saveSoon();renderRail()}})});
    pf.append(pfa);b.append(pf);
    b.append(el('div','ph-sec','loops · worktrees'));
    const pl2=el('div','ph-loops');
    if(!(ph.loops||[]).length)pl2.append(el('span','ph-none','none — wire a cycle and it appears'));
    (ph.loops||[]).forEach((L,ix)=>{
      const c=el('div','lchip');
      const r1=el('div','lc-row');
      r1.append(el('span',null,'⟳ L'+(ix+1)));
      const wts=loopWts(L,ph);
      r1.append(el('i','lc-wtm'+(wts.length?'':' none')));
      const wl=el('span','lc-wtl'+(wts.length?'':' none'));
      wl.textContent=wts.length?wts.join(' · '):'no worktree named';
      wl.title='mirror only — set a worktree inside a node (⤢ expand)';
      r1.append(wl);
      const r2=el('div','lc-row');
      const l1=el('span','lc-l','max cyc');const i1=document.createElement('input');
      i1.placeholder='∞';i1.value=L.maxCycles||'';
      i1.addEventListener('pointerdown',e=>e.stopPropagation());
      i1.addEventListener('input',()=>{L.maxCycles=i1.value;saveSoon()});
      const l2=el('span','lc-l','max ctx');const i2=document.createElement('input');
      i2.placeholder='—';i2.value=L.maxCtx||'';
      i2.addEventListener('pointerdown',e=>e.stopPropagation());
      i2.addEventListener('input',()=>{L.maxCtx=i2.value;saveSoon()});
      r2.append(l1,i1,l2,i2);
      c.append(r1,r2);pl2.append(c)});
    b.append(pl2);
    b.append(el('div','ph-meta',ph.nodes.length+' node'+(ph.nodes.length===1?'':'s')));
    b.addEventListener('click',()=>{if(pl.selPhase!==ph.id){pl.selPhase=ph.id;
      selNode=selCable=null;saveSoon();render()}});
    b.addEventListener('contextmenu',e=>phaseCtxMenu(e,ph));
    rail.append(b);
  });
  const ap=el('button',null,'+ phase');ap.id='ar-addPhase';
  ap.addEventListener('click',()=>{pl.phases.push({id:uid(),name:'PHASE '+pl.phases.length,
    files:[],active:false,loops:[],nodes:[],cables:[]});saveSoon();renderRail()});
  rail.append(ap);
}

export function clearMap(){
  if(!S)return;
  const pl=plan();if(!pl)return;
  snap('clear map');
  pl.phases=[{id:uid(),name:'PHASE 0',files:[],active:false,loops:[],nodes:[],cables:[]}];
  pl.selPhase=pl.phases[0].id;
  selNode=selCable=null;
  saveSoon();render();
}

const STATUS=REGION_STATUS;
const KINDS=[['cable','◦ cable'],['git','▪ git'],['fork','⑂ fork/resume']];
const NOTCH_ADD=[['cable','cable'],['git','git'],['fork/resume','fork']];
const MARKER_KINDS=['git','fork'];

function freeP(n){
  const taken=(n.notches||[]).map(x=>x.p);
  const gap=0.045;
  for(let i=0;i<40;i++){
    const p=(0.38+i*gap)%1;
    if(!taken.some(t=>{const d=Math.abs(t-p);return Math.min(d,1-d)<gap*0.8}))return p}
  return Math.random()}

function bindCE(span,get,set,ro){
  if(ro){span.textContent=get()||'';span.classList.add('ce-ro');return}
  span.contentEditable='true';span.spellcheck=false;span.textContent=get()||'';
  span.addEventListener('input',()=>{set(span.textContent);saveSoon()});
  span.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();span.blur()}});
  span.addEventListener('pointerdown',e=>e.stopPropagation());
}

function statusApply(nel,n){
  STATUS.forEach(s=>nel.classList.remove('st-'+s));
  nel.classList.add('st-'+n.status);
  const d=nel.querySelector('.dot');
  d.className='dot '+(n.status==='idle'?'idle':n.status==='thinking'?'thinking':
    n.status==='working'?'working':'idle');
}

function notchLabel(ph,nc){
  const here=ph.cables.filter(c=>c.a.t===nc.id||c.b.t===nc.id);
  if(!here.length)return'';
  if(ph._loopEdges&&here.some(c=>ph._loopEdges.has(c.id)))return'loop';
  if(here.some(c=>c.a.t===nc.id))return'out';
  return'in';
}

function buildNode(n){
  const ro=!!n._live;
  const nel=el('div','node'+(ro?' live':''));nel.dataset.id=n.id;
  if(n.regnode_id)nel.dataset.rid=n.regnode_id;
  nel.style.left=n.x+'px';nel.style.top=n.y+'px';
  const head=el('div','n-head');
  const nm=el('span','n-name');bindCE(nm,()=>n.name,v=>n.name=v,ro);
  const md=el('span','n-model');bindCE(md,()=>n.model,v=>n.model=v,ro);
  head.append(nm,md);nel.append(head);
  if(n._rail){const rl=el('div','n-rail');rl.textContent=n._rail;
    rl.title='rail — provider · loop class · mechanism (from the server, read-only)';
    nel.append(rl)}
  const notes=el('div','n-notes');bindCE(notes,()=>n.notes,v=>n.notes=v,ro);
  if(!ro)notes.addEventListener('input',()=>requestAnimationFrame(()=>{layoutNotches(n,nel);
    drawCables();placeLoopBoxes()}));
  nel.append(notes);
  if(n.wt){const t=el('div','n-wt','<i></i>');t.append(document.createTextNode(n.wt));
    t.title='worktree / branch — set inside the node (⤢ expand)';nel.append(t)}
  const st=el('div','n-status');
  const dotWrap=el('span','n-dot','<span class="dot idle"></span><span class="n-check">✓</span>');
  dotWrap.title=ro?'live region — status comes from the server':
    'click to cycle status · shift-click to go back';
  dotWrap.addEventListener('pointerdown',e=>e.stopPropagation());
  if(!ro)dotWrap.addEventListener('click',e=>{e.stopPropagation();
    const d=(e.shiftKey||e.altKey)?-1:1;
    n.status=STATUS[(STATUS.indexOf(n.status)+d+STATUS.length)%STATUS.length];
    statusApply(nel,n);saveSoon()});
  const stxt=el('span','n-stxt');bindCE(stxt,()=>n.stxt,v=>n.stxt=v,ro);
  st.append(dotWrap,stxt);nel.append(st);
  nel.append(el('div','n-pips',
    '<span class="pip white">R</span><span class="pip green">W</span><span class="pip yellow">E</span>'));
  if(!ro){const ex=el('button','n-ex','⤢');ex.title='expand';
    ex.addEventListener('pointerdown',e=>e.stopPropagation());
    ex.addEventListener('click',e=>{e.stopPropagation();openExpand(n)});
    nel.append(ex)}
  const ph=phase();
  n.notches.forEach(nc=>{
    const isMarker=MARKER_KINDS.indexOf(nc.kind)>=0;
    const lab=isMarker?'':notchLabel(ph,nc);
    const ne=el('div','notch k-'+(isMarker?nc.kind:(lab||'in')));ne.dataset.node=n.id;ne.dataset.notch=nc.id;
    ne.title=isMarker
      ? nc.kind+' — a FLAG, not a jack. no cable touches it. drag to reposition, dbl-click to delete.'
      : nc.kind+' — dbl-click to delete';
    ne.append(el('span','nlab',null));
    ne.querySelector('.nlab').textContent=lab;
    ne.addEventListener('pointerdown',e=>notchDown(e,n,nc,ne,nel));
    ne.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();
      snap('delete '+nc.kind+' notch');
      n.notches=n.notches.filter(x=>x.id!==nc.id);
      phase().cables=phase().cables.filter(c=>c.a.t!==nc.id&&c.b.t!==nc.id);
      structural()});
    nel.append(ne)});
  statusApply(nel,n);
  nel.addEventListener('pointerdown',e=>nodeDown(e,n,nel));
  nel.addEventListener('contextmenu',e=>nodeCtxMenu(e,n));
  return nel;
}

function layoutNotches(n,nel){
  const w=nel.offsetWidth,h=nel.offsetHeight;n._w=w;n._h=h;
  n.notches.forEach(nc=>{
    const xy=perimXY(w,h,nc.p);
    nc._ax=n.x+xy.x;nc._ay=n.y+xy.y;nc._e=xy.e;
    const ne=nel.querySelector('[data-notch="'+nc.id+'"]');
    if(ne){ne.style.left=xy.x+'px';ne.style.top=xy.y+'px';ne.dataset.e=xy.e}});
}

function faceNodes(ph){return ph.nodes.concat(ph._live||[])}

function renderCanvas(){
  world.querySelectorAll('.node,.loopbox').forEach(x=>x.remove());
  const ph=phase();
  faceNodes(ph).forEach(n=>world.append(buildNode(n)));
  requestAnimationFrame(()=>{
    faceNodes(ph).forEach(n=>{const nel=world.querySelector('.node[data-id="'+n.id+'"]');
      if(nel)layoutNotches(n,nel)});
    drawCables();placeLoopBoxes();applySel()});
}
function render(){renderRail();renderCanvas()}
function structural(){computeLoops(phase());saveSoon();render()}

function notchOf(nid,tid){const n=phase().nodes.find(x=>x.id===nid);
  return n&&n.notches.find(x=>x.id===tid)}

function notchCablePath(a,b){
  const k=Math.max(30,Math.min(120,Math.hypot(b._ax-a._ax,b._ay-a._ay)/2.2));
  const na=NORM[a._e||'r'],nb=NORM[b._e||'l'];
  return 'M'+a._ax+','+a._ay+' C'+(a._ax+na[0]*k)+','+(a._ay+na[1]*k)+' '+
    (b._ax+nb[0]*k)+','+(b._ay+nb[1]*k)+' '+b._ax+','+b._ay}





let _feed=[];
const _regionRoots={};

function esc(s){return String(s).replace(/[&<>"]/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

function nodesByRegion(){
  const m=new Map();
  faceNodes(phase()).forEach(n=>{if(n.regnode_id&&!m.has(n.regnode_id))m.set(n.regnode_id,n)});
  return m;
}

function cablePath(a,b){
  const aw=a._w||180,ah=a._h||78,bw=b._w||180,bh=b._h||78;
  const acy=a.y+ah/2, bcy=b.y+bh/2;
  const right=(b.x+bw/2)>=(a.x+aw/2);
  const ax=right?a.x+aw:a.x, bx=right?b.x:b.x+bw;
  const s=right?1:-1;
  const k=Math.max(30,Math.min(120,Math.hypot(bx-ax,bcy-acy)/2.2));
  return 'M'+ax+','+acy+' C'+(ax+s*k)+','+acy+' '+(bx-s*k)+','+bcy+' '+bx+','+bcy;
}

function derivedCables(){
  if(!_feed.length)return [];
  const byRid=nodesByRegion();
  if(!byRid.size)return [];
  let ws;
  try{ws=deriveCables(_feed,{roots:_regionRoots})}catch(e){return []}
  const out=[];
  ws.forEach(w=>{const a=byRid.get(w.from),b=byRid.get(w.to);
    if(a&&b&&a!==b)out.push({w:w,a:a,b:b})});
  return out;
}

function cablePairKey(aId,bId){return aId+'→'+bId}




function drawCables(){
  const ph=phase();let out='';let ends='';
  const derived=derivedCables();
  const authoredPairs=new Set(ph.cables.map(c=>cablePairKey(c.a.n,c.b.n)));
  const derivedPairs=new Set(derived.map(p=>cablePairKey(p.a.id,p.b.id)));
  derived.forEach(p=>{
    const key=cablePairKey(p.a.id,p.b.id);
    if(authoredPairs.has(key))return;
    const d=cablePath(p.a,p.b);
    const n=p.w.paths.length;
    const tip=n+(n===1?' file':' files')+': '+p.w.paths.slice(0,6).join(', ')+(n>6?' …':'');
    out+='<path class="dcvis c-exec" marker-end="url(#ar-c-ex)" d="'+d+'">'+
         '<title>'+esc(tip)+'</title></path>';
  });
  ph.cables.forEach(c=>{
    const a=notchOf(c.a.n,c.a.t),b=notchOf(c.b.n,c.b.t);
    if(!a||!b||a._ax===undefined||b._ax===undefined)return;
    const d=notchCablePath(a,b);
    const executed=derivedPairs.has(cablePairKey(c.a.n,c.b.n));
    let cls='cvis '+(executed?'c-exec':'c-unexec');
    if(ph._loopEdges&&ph._loopEdges.has(c.id))cls+=' c-loop';
    if(selCable===c.id)cls+=' c-sel';
    const act=String(c.action||'').trim();
    if(act)cls+=' c-act';
    out+='<path class="chit" data-c="'+c.id+'" d="'+d+'"></path>'+
         '<path class="'+cls+'" d="'+d+'">'+
         (act?'<title>action: '+esc(act)+'</title>':'')+'</path>';
    ends+='<div class="cabend '+(executed?'c-exec':'c-unexec')+
      '" style="left:'+b._ax+'px;top:'+b._ay+'px"></div>'});
  cablesG.innerHTML=out;
  if(cabEnds)cabEnds.innerHTML=ends;
  cablesG.querySelectorAll('.chit').forEach(p=>p.addEventListener('click',e=>{
    e.stopPropagation();
    if(e.shiftKey){const c=cableById(p.dataset.c);if(c)openCableMenu(c);return}
    hideCableMenu();
    selCable=p.dataset.c;selNode=null;drawCables();applySel()}));
  cablesG.querySelectorAll('.chit').forEach(p=>p.addEventListener('contextmenu',e=>{
    const c=cableById(p.dataset.c);if(c)cableCtxMenu(e,c)}));
  placeCableMenu();
}








const ACTION_SEEDS=['initiate','fork','resume'];

let menuFor=null;
let cmenu=null, cmenuIn=null, cmenuContentIn=null;

function cableById(id){const ph=phase();
  return (ph&&ph.cables.find(c=>c.id===id))||null}

function hideCableMenu(){menuFor=null;if(cmenu)cmenu.classList.remove('open')}
function closeCableMenu(){if(!menuFor)return;hideCableMenu();drawCables()}

function openCableMenu(c){
  menuFor=c.id;
  cmenuIn.value=c.action||'';
  cmenuContentIn.value=c.content||'';
  cmenu.classList.add('open');
  placeCableMenu();
  if(menuFor){cmenuIn.focus();cmenuIn.select()}
}

function setCableAction(v){
  const c=cableById(menuFor);if(!c)return;
  c.action=String(v);
  saveSoon();
}

function setCableContent(v){
  const c=cableById(menuFor);if(!c)return;
  c.content=String(v);
  saveSoon();
}

function placeCableMenu(){
  if(!menuFor||!cmenu)return;
  const p=cablesG.querySelector('.chit[data-c="'+menuFor+'"]');
  if(!p){hideCableMenu();return}
  let mid=null;try{mid=p.getPointAtLength(p.getTotalLength()/2)}catch(e){}
  if(!mid){hideCableMenu();return}
  cmenu.style.left=mid.x+'px';cmenu.style.top=mid.y+'px';
}

function wireCableMenu(){
  cmenu=$('#ar-cbmenu');cmenuIn=$('#ar-cbmenuIn');cmenuContentIn=$('#ar-cbmenuContent');
  const seeds=$('#ar-cbmenuSeeds');
  ACTION_SEEDS.forEach(a=>{
    const b=el('button');b.textContent=a;b.title='set this cable’s action to “'+a+'”';
    b.addEventListener('pointerdown',e=>e.stopPropagation());
    b.addEventListener('click',e=>{e.stopPropagation();
      cmenuIn.value=a;setCableAction(a);drawCables()});
    seeds.append(b)});
  cmenu.addEventListener('pointerdown',e=>e.stopPropagation());
  cmenu.addEventListener('dblclick',e=>e.stopPropagation());
  cmenuIn.addEventListener('input',()=>setCableAction(cmenuIn.value));
  cmenuIn.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();closeCableMenu();return}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCableMenu()}});
  cmenuContentIn.addEventListener('input',()=>setCableContent(cmenuContentIn.value));
  cmenuContentIn.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();closeCableMenu();return}
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCableMenu()}});
  $('#ar-cbmenuClr').addEventListener('click',e=>{e.stopPropagation();
    cmenuIn.value='';setCableAction('');
    cmenuContentIn.value='';setCableContent('');
    drawCables();cmenuIn.focus()});
  $('#ar-cbmenuDone').addEventListener('click',e=>{e.stopPropagation();closeCableMenu()});
}

function placeLoopBoxes(){
  world.querySelectorAll('.loopbox').forEach(x=>x.remove());
  if(!S.dev.loopbox)return;
  const ph=phase();const PAD=30;
  (ph.loops||[]).forEach((L,ix)=>{
    const mem=L.nodes.map(id=>ph.nodes.find(n=>n.id===id)).filter(Boolean);
    if(!mem.length)return;
    let x1=1/0,y1=1/0,x2=-1/0,y2=-1/0;
    mem.forEach(n=>{const w=n._w||180,h=n._h||78;
      x1=Math.min(x1,n.x);y1=Math.min(y1,n.y);x2=Math.max(x2,n.x+w);y2=Math.max(y2,n.y+h)});
    const box=el('div','loopbox');
    box.style.left=(x1-PAD)+'px';box.style.top=(y1-PAD)+'px';
    box.style.width=(x2-x1+PAD*2)+'px';box.style.height=(y2-y1+PAD*2)+'px';
    const wts=loopWts(L,ph);
    const lab=el('div','lb-lbl'+(wts.length?'':' none'));
    lab.textContent=(wts.length?wts.join(' · ')
      :'no worktree — this loop does not git')+'  ·  ⟳ L'+(ix+1);
    box.append(lab);world.append(box)});
}

function applySel(){
  world.querySelectorAll('.node').forEach(x=>
    x.classList.toggle('sel',x.dataset.id===selNode));
}

function nodeDown(e,n,nel){
  if(e.target.closest('[contenteditable],button,.notch,input'))return;
  e.preventDefault();
  const start=worldPt(e),ox=n.x,oy=n.y;let moved=false;
  nel.setPointerCapture(e.pointerId);nel.style.cursor='grabbing';
  function mv(ev){const p=worldPt(ev);
    const dx=p.x-start.x,dy=p.y-start.y;
    if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
    n.x=Math.max(0,ox+dx);n.y=Math.max(0,oy+dy);
    nel.style.left=n.x+'px';nel.style.top=n.y+'px';
    layoutNotches(n,nel);drawCables();placeLoopBoxes()}
  function up(){nel.removeEventListener('pointermove',mv);
    nel.removeEventListener('pointerup',up);nel.style.cursor='grab';
    if(moved)saveSoon();
    else{selNode=(selNode===n.id?null:n.id);selCable=null;applySel();drawCables()}}
  nel.addEventListener('pointermove',mv);nel.addEventListener('pointerup',up);
}

function notchDown(e,n,nc,ne,nel){
  e.preventDefault();e.stopPropagation();
  ne.setPointerCapture(e.pointerId);
  const isMarker=MARKER_KINDS.indexOf(nc.kind)>=0;
  let mode=isMarker?'slide':'pending';
  function mv(ev){
    const p=worldPt(ev);
    const lx=p.x-n.x,ly=p.y-n.y;
    const w=n._w||nel.offsetWidth,h=n._h||nel.offsetHeight;
    const inside=Math.max(0,Math.min(w,lx)),insideY=Math.max(0,Math.min(h,ly));
    const dist=Math.hypot(lx-inside,ly-insideY);
    const nearRim=lx>-22&&lx<w+22&&ly>-22&&ly<h+22&&dist<22;
    if(!isMarker)mode=nearRim?'slide':'cable';
    if(mode==='slide'){
      nc.p=xyToP(w,h,lx,ly);layoutNotches(n,nel);drawCables();
      ghost.setAttribute('visibility','hidden')}
    else{
      const fake={_ax:p.x,_ay:p.y,_e:nc._e==='l'?'r':nc._e==='r'?'l':nc._e==='t'?'b':'t'};
      ghost.setAttribute('d',notchCablePath(nc,fake));
      ghost.setAttribute('visibility','visible');
      _host.querySelectorAll('.notch.hot').forEach(x=>x.classList.remove('hot'));
      const tgt=document.elementsFromPoint(ev.clientX,ev.clientY)
        .find(x=>x.classList&&x.classList.contains('notch')&&x!==ne);
      if(tgt)tgt.classList.add('hot')}}
  function up(ev){
    ne.removeEventListener('pointermove',mv);ne.removeEventListener('pointerup',up);
    ghost.setAttribute('visibility','hidden');
    _host.querySelectorAll('.notch.hot').forEach(x=>x.classList.remove('hot'));
    if(mode==='slide'){saveSoon();return}
    if(mode!=='cable')return;
    const tgt=document.elementsFromPoint(ev.clientX,ev.clientY)
      .find(x=>x.classList&&x.classList.contains('notch')&&x!==ne);
    if(!tgt)return;
    const tn=tgt.dataset.node,tt=tgt.dataset.notch,tk=notchOf(tn,tt);
    if(!tk)return;
    if(MARKER_KINDS.indexOf(tk.kind)>=0){
      toast('a '+tk.kind+' notch is a flag, not a jack — no cable touches it.');return}
    const a={n:n.id,t:nc.id},b={n:tn,t:tt};
    if(phase().cables.some(c=>c.a.n===a.n&&c.a.t===a.t&&c.b.n===b.n&&c.b.t===b.t)){
      toast('already wired.');return}
    snap('add cable');
    phase().cables.push({id:uid(),a,b});
    structural()}
  ne.addEventListener('pointermove',mv);ne.addEventListener('pointerup',up);
}

function applyView(){world.style.transform=
  'translate('+S.panX+'px,'+S.panY+'px) scale('+S.zoom+')';
  $('#ar-zoomLbl').textContent=Math.round(S.zoom*100)+'%';saveSoon()}
function setZoom(z,cx,cy){z=Math.max(.35,Math.min(2,z));
  const wx=(cx-S.panX)/S.zoom,wy=(cy-S.panY)/S.zoom;
  S.zoom=z;S.panX=cx-wx*z;S.panY=cy-wy*z;applyView()}

function fitAll(){
  const ph=phase();if(!ph)return;
  const nodes=(ph.nodes||[]).concat(ph._live||[]);
  if(!nodes.length){S.zoom=1;S.panX=40;S.panY=20;applyView();return}
  const r=cwrap.getBoundingClientRect();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  nodes.forEach(n=>{
    const w=n._w||180,h=n._h||78;
    minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);
    maxX=Math.max(maxX,n.x+w);maxY=Math.max(maxY,n.y+h)});
  const pad=60,bw=(maxX-minX)+pad*2,bh=(maxY-minY)+pad*2;
  const z=Math.max(.1,Math.min(2,Math.min(r.width/bw,r.height/bh)));
  S.zoom=z;
  S.panX=r.width/2-(minX-pad+bw/2)*z;
  S.panY=r.height/2-(minY-pad+bh/2)*z;
  applyView()}

function wireCanvas(){
  cwrap.addEventListener('pointerdown',e=>{
    if(e.target!==cwrap&&e.target!==world&&e.target!==svg&&!e.target.closest('#ar-svg'))return;
    if(e.target.closest('.chit'))return;
    const sx=e.clientX,sy=e.clientY,ox=S.panX,oy=S.panY;let moved=false;
    cwrap.setPointerCapture(e.pointerId);
    function mv(ev){const dx=ev.clientX-sx,dy=ev.clientY-sy;
      if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
      S.panX=ox+dx;S.panY=oy+dy;applyView()}
    function up(){cwrap.removeEventListener('pointermove',mv);
      cwrap.removeEventListener('pointerup',up);
      if(!moved){selNode=null;selCable=null;hideCableMenu();applySel();drawCables()}}
    cwrap.addEventListener('pointermove',mv);cwrap.addEventListener('pointerup',up);
  });
  cwrap.addEventListener('dblclick',e=>{
    if(e.target.closest('.chit'))return;
    if(e.target!==cwrap&&e.target!==world&&e.target!==svg&&!e.target.closest('#ar-svg'))return;
    const p=worldPt(e);
    snap('add region');
    phase().nodes.push(blankRegion(uid(),{x:Math.max(0,p.x-85),y:Math.max(0,p.y-30)}));
    structural()});
  cwrap.addEventListener('contextmenu',e=>{
    if(e.target.closest('.chit'))return;
    if(e.target!==cwrap&&e.target!==world&&e.target!==svg&&!e.target.closest('#ar-svg'))return;
    const p=worldPt(e);
    openCtxMenu(e,[
      ['clear map',clearMap],
      ['+ add node',()=>{snap('add region');
        phase().nodes.push(blankRegion(uid(),{x:Math.max(0,p.x-85),y:Math.max(0,p.y-30)}));
        structural()}],
      ['show all',fitAll]
    ]);
  });
  cwrap.addEventListener('wheel',e=>{
    e.preventDefault();
    const r=cwrap.getBoundingClientRect();
    if(e.shiftKey){S.panX-=e.deltaX;S.panY-=e.deltaY;applyView();return}
    setZoom(S.zoom*(e.deltaY<0?1.08:0.92),e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
  $('#ar-zIn').addEventListener('click',()=>{const r=cwrap.getBoundingClientRect();
    setZoom(S.zoom*1.2,r.width/2,r.height/2)});
  $('#ar-zOut').addEventListener('click',()=>{const r=cwrap.getBoundingClientRect();
    setZoom(S.zoom/1.2,r.width/2,r.height/2)});
}

function deleteSelectedCable(){
  const ph=phase();if(!selCable)return;
  snap('delete cable');
  ph.cables=ph.cables.filter(c=>c.id!==selCable);selCable=null;structural()}
function deleteSelectedNode(){
  const ph=phase();if(!selNode)return;
  if((ph._live||[]).some(x=>x.id===selNode)){
    toast('that region is live on the server — kill it from the roster, not here');return}
  const n=ph.nodes.find(x=>x.id===selNode);
  snap('delete node'+(n&&n.name?' “'+n.name+'”':''));
  ph.cables=ph.cables.filter(c=>c.a.n!==selNode&&c.b.n!==selNode);
  ph.nodes=ph.nodes.filter(x=>x.id!==selNode);selNode=null;structural()}
function copySelectedNode(){
  const ph=phase();if(!selNode)return;
  const n=ph.nodes.find(x=>x.id===selNode)||(ph._live||[]).find(x=>x.id===selNode);
  if(!n)return;
  clipboard=JSON.parse(JSON.stringify(n,(k,v)=>k[0]==='_'?undefined:v));
  toast('copied “'+(n.name||'node')+'”')}
function cutSelectedNode(){copySelectedNode();deleteSelectedNode()}
function pasteNode(pt){
  if(!clipboard){toast('nothing to paste');return}
  const ph=phase();if(!ph)return;
  snap('paste node'+(clipboard.name?' “'+clipboard.name+'”':''));
  const n=JSON.parse(JSON.stringify(clipboard));
  n.id=uid();n.x=pt.x;n.y=pt.y;
  n.notches=(clipboard.notches||[]).map(nc=>({id:uid(),kind:nc.kind,p:nc.p,label:nc.label||''}));
  delete n.regnode_id;
  ph.nodes.push(n);selNode=n.id;selCable=null;
  structural()}
function deletePhase(ph){
  const pl=plan();if(!pl)return;
  if(pl.phases.length<=1){toast('only phase left — nothing to delete');return}
  snap('delete phase “'+(ph.name||'')+'”');
  pl.phases=pl.phases.filter(x=>x.id!==ph.id);
  if(pl.selPhase===ph.id)pl.selPhase=pl.phases[0].id;
  selNode=selCable=null;saveSoon();render()}

function onKeydown(e){
  if(!_host.classList.contains('active'))return;
  if(e.target.closest('[contenteditable],input,textarea'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return}
  if(e.key!=='Delete')return;
  if(selCable)deleteSelectedCable();
  else if(selNode)deleteSelectedNode();
}

function closeCtxMenu(){if(ctxMenu)ctxMenu.classList.remove('open')}
function ctxMenuIsOpen(){return!!(ctxMenu&&ctxMenu.classList.contains('open'))}
function placeCtxMenu(e){
  const r=_host.getBoundingClientRect();
  ctxMenu.style.left=(e.clientX-r.left)+'px';
  ctxMenu.style.top=(e.clientY-r.top)+'px';}
function openCtxMenu(e,items){
  e.preventDefault();e.stopPropagation();
  ctxMenu.innerHTML='';
  items.forEach(it=>{
    if(it==='sep'){ctxMenu.append(el('div','ctx-sep'));return}
    const b=el('button',null,it[0]);
    b.addEventListener('pointerdown',ev=>ev.stopPropagation());
    b.addEventListener('click',ev=>{ev.stopPropagation();closeCtxMenu();it[1]()});
    ctxMenu.append(b)});
  ctxMenu.classList.add('open');
  placeCtxMenu(e)}

const UNDO_REDO_ITEMS=()=>['sep',['↺ undo',undo],['↻ redo',redo]];

function nodeCtxMenu(e,n){
  selNode=n.id;selCable=null;applySel();drawCables();
  const ro=!!n._live;
  const items=[];
  if(!ro)NOTCH_ADD.forEach(([lab,k])=>items.push(['+ '+lab+' notch',()=>{
    snap('add '+k+' notch');
    n.notches.push({id:uid(),kind:k,p:freeP(n),label:''});
    saveSoon();render()}]));
  if(!ro)items.push('sep');
  if(!ro)items.push(['✂ cut',cutSelectedNode]);
  items.push(['⧉ copy',copySelectedNode]);
  if(clipboard)items.push(['📋 paste',()=>pasteNode(worldPt(e))]);
  items.push(['⚙ open settings',()=>toast('settings — not built yet')]);
  if(!ro)items.push(['✕ delete',deleteSelectedNode]);
  openCtxMenu(e,items.concat(UNDO_REDO_ITEMS()))}

function cableCtxMenu(e,c){
  selCable=c.id;selNode=null;drawCables();
  const items=[['⚙ open settings',()=>toast('settings — not built yet')],
    ['✕ delete',deleteSelectedCable]];
  openCtxMenu(e,items.concat(UNDO_REDO_ITEMS()))}

function phaseCtxMenu(e,ph){
  const items=[['✕ delete phase',()=>deletePhase(ph)]];
  openCtxMenu(e,items.concat(UNDO_REDO_ITEMS()))}

let exNode=null;
function openExpand(n){exNode=n;
  $('#ar-exTitle').textContent=n.name||'agent';
  $('#ar-exModel').textContent=(n.model||'')+(n.status!=='blank'?' · '+n.status:'');
  _host.querySelectorAll('#ar-ex textarea,#ar-ex input').forEach(t=>{
    const f=t.dataset.f;
    t.value=f==='notes'?(n.notes||''):f==='wt'?(n.wt||''):(n.detail&&n.detail[f]||'');
    t.oninput=()=>{
      if(f==='notes')n.notes=t.value;
      else if(f==='wt')n.wt=t.value;
      else{n.detail=n.detail||{};n.detail[f]=t.value}
      saveSoon()}});
  $('#ar-ex').className='open exm-'+S.dev.expand}
function closeExpand(){$('#ar-ex').className='exm-'+S.dev.expand;render()}

export function currentPlan(){
  if(!S)return null;
  const p=plan();if(!p)return null;
  return JSON.parse(JSON.stringify(p,(k,v)=>k[0]==='_'?undefined:v));}
function planJSON(){
  return JSON.stringify(currentPlan(),null,2)}




function pipePlan(){
  if(!_ctx||!_ctx.send){toast('no socket on this window — pipe from the ADE tab');return}
  const pl=currentPlan();
  if(!pl){toast('nothing to pipe');return}
  const ph=phase();
  const nm=(ph&&ph.name)||'this phase';
  const n=(ph&&ph.nodes.length)||0;
  if(!n){toast('no regions on '+nm+' — nothing to pipe');return}
  askConfirm(
    'Pipe '+nm+' — '+n+' region'+(n===1?'':'s')+' onto '+n+' new track'+
    (n===1?'':'s')+', one region each?\n\n'+
    'This writes the records. It does NOT start anything: a region becomes a run '+
    'when its agent is initiated, which is when you prompt it.\n\n'+
    'Piping again writes a second set — there is no update in place.',
    ()=>{_ctx.send({type:'ade_plan',plan:pl});
         toast('piped '+nm+' — '+n+' region'+(n===1?'':'s')+', nothing started')});
}
function copyText(txt,okMsg){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>toast(okMsg),()=>showJSON())}
  else showJSON()}
function showJSON(){$('#ar-jsonta').value=planJSON();$('#ar-jsonwrap').classList.add('open');
  $('#ar-jsonta').focus();$('#ar-jsonta').select()}

function applyDev(){
  _host.classList.toggle('dev-pips',S.dev.pips);
  _host.classList.toggle('dev-nlabels',S.dev.nlabels);
  saveSoon()}

function wireChrome(){
  $('#ar-exBack').addEventListener('click',closeExpand);
  $('#ar-ex').addEventListener('click',e=>{if(e.target.id==='ar-ex')closeExpand()});
  $('#ar-btnCopy').addEventListener('click',()=>copyText(planJSON(),'plan copied — paste it wherever it goes'));
  $('#ar-btnShow').addEventListener('click',showJSON);
  $('#ar-jbCopy').addEventListener('click',()=>{const t=$('#ar-jsonta');t.select();
    copyText(t.value,'copied')});
  $('#ar-jbClose').addEventListener('click',()=>$('#ar-jsonwrap').classList.remove('open'));
  $('#ar-jsonwrap').addEventListener('click',e=>{if(e.target.id==='ar-jsonwrap')
    $('#ar-jsonwrap').classList.remove('open')});
  $('#ar-popout').addEventListener('click',()=>
    window.open('/ade/arrange','adeArrange','width=1440,height=900'));
}

const EXTRACT={name:'EXTRACTION TAB',extract:true,sel:0,phases:[
  {name:'PHASE 0',files:[],nodes:{},wires:[],loops:[]}]};

function buildSeed(sd){
  const pl={id:uid(),name:sd.name,extract:!!sd.extract,selPhase:null,phases:[]};
  sd.phases.forEach(pd=>{
    const ph={id:uid(),name:pd.name,files:(pd.files||[]).slice(),active:false,
      loops:[],nodes:[],cables:[]};
    const map={};
    Object.keys(pd.nodes||{}).forEach(k=>{
      const v=pd.nodes[k];
      const n={id:uid(),x:v[0],y:v[1],name:v[2],model:v[3],notes:v[4],status:v[5],stxt:v[6],
        wt:v[8]||'',
        notches:v[7].map(t=>({id:uid(),kind:t[0],p:t[1],label:''})),
        detail:{agent:''}};
      ph.nodes.push(n);map[k]=n});
    (pd.wires||[]).forEach(w=>{
      const A=map[w[0]],B=map[w[2]];if(!A||!B)return;
      const an=A.notches.find(x=>x.kind===w[1]);
      const ins=B.notches.filter(x=>x.kind==='in');
      const bn=ins[w[3]||0]||ins[0];
      if(an&&bn)ph.cables.push({id:uid(),a:{n:A.id,t:an.id},b:{n:B.id,t:bn.id}})});
    computeLoops(ph,true);
    (pd.loops||[]).forEach(ld=>{
      const key=ld.nodes.map(k=>map[k]&&map[k].id).filter(Boolean).sort().join('+');
      const L=ph.loops.find(x=>x.key===key);
      if(L){L.maxCycles=ld.cyc||'';L.maxCtx=ld.ctx||''}});
    pl.phases.push(ph)});
  pl.selPhase=pl.phases[sd.sel||0].id;
  return pl;
}

function migratePlan(p){
  if(!p.phases||!p.phases.length)p.phases=[{id:uid(),name:'PHASE 0',files:[],active:false,
    loops:[],nodes:[],cables:[]}];
  if(!p.phases.some(x=>x.id===p.selPhase))p.selPhase=p.phases[0].id;
  p.phases.forEach(ph=>{
    (ph.loops||[]).forEach(L=>{if(!L.wt)return;
      (L.nodes||[]).forEach(id=>{const n=(ph.nodes||[]).find(x=>x.id===id);
        if(n&&!n.wt)n.wt=L.wt})});
    (ph.nodes||[]).forEach(n=>{
      if(n.wt===undefined)n.wt='';
      (n.notches||[]).forEach(nc=>{
        if(nc.kind==='spawn')nc.kind='out';
        if(nc.kind==='git'&&(ph.cables||[]).some(c=>c.a.t===nc.id||c.b.t===nc.id))
          nc.kind='out';
        if(nc.kind==='in'||nc.kind==='out'||nc.kind==='loop')nc.kind='cable'
      })});
    computeLoops(ph,true)});
}

function initState(){
  try{S=JSON.parse(localStorage.getItem(LS)||'null')}catch(e){S=null}
  if(!S){
    S=defState();
    S.plans.push(buildSeed(EXTRACT));
    S.selPlan=S.plans[0].id;
  }
  if(!S.dev)S.dev={};
  if(S.dev.expand===undefined)S.dev.expand='replace';
  if(S.dev.loopbox===undefined)S.dev.loopbox=false;
  if(S.dev.pips===undefined)S.dev.pips=false;
  if(S.dev.nlabels===undefined)S.dev.nlabels=true;
  if(!S.plans||!S.plans.length){S.plans=[buildSeed(EXTRACT)]}
  if(!S.plans.some(p=>p.id===S.selPlan))S.selPlan=S.plans[0].id;
  S.plans.forEach(migratePlan);
  save();
}

function bumpUidPast(pl){
  let max=S.uid;
  const bump=id=>{if(typeof id==='string'&&id[0]==='k'){
    const n=parseInt(id.slice(1),10);if(!isNaN(n)&&n>=max)max=n+1}};
  bump(pl.id);
  (pl.phases||[]).forEach(ph=>{
    bump(ph.id);
    (ph.nodes||[]).forEach(n=>{bump(n.id);(n.notches||[]).forEach(t=>bump(t.id))});
    (ph.cables||[]).forEach(c=>bump(c.id));
    (ph.loops||[]).forEach(l=>bump(l.id))});
  S.uid=max;
}




export function syncSessionPlan(serverPlan){
  if(!S)return;
  UNDO.length=0;REDO.length=0;
  selNode=selCable=null;
  if(serverPlan&&Array.isArray(serverPlan.phases)&&serverPlan.phases.length){
    bumpUidPast(serverPlan);
    migratePlan(serverPlan);
    S.plans=[serverPlan];
    S.selPlan=serverPlan.id;
  }else{
    S.plans=[{id:uid(),name:'scratch',extract:true,selPhase:null,phases:[]}];
    migratePlan(S.plans[0]);
    S.selPlan=S.plans[0].id;
  }
  saveSoon();render();
}

const HOST_HTML=`
<div id="ar-shell">
  <div id="ar-topbar">
    <span class="spacer"></span>
    <button class="tb-btn" id="ar-popout" title="open in a separate window">⧉ pop out</button>
    <button class="tb-btn" id="ar-btnCopy">⧉ copy this plan as JSON</button>
    <button class="tb-btn" id="ar-btnShow">show JSON</button>
  </div>

  <div id="ar-main">
    <div id="ar-rail"></div>
    <div id="ar-railsplit"></div>
    <div id="ar-cwrap">
      <div id="ar-world">
        <svg id="ar-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <!-- WAVE 4 (2026-08-08, SCOPE-cable-convergence §3) — NO ARROWHEAD.
                 The endpoint is a circle: hollow + bright outline when unexecuted,
                 filled + darkened when executed. Same two colours as ade.css's
                 .c-unexec / .c-exec (#ffffff / #5f5e59), hardcoded here the same
                 way the two markers this replaced always were.
                 WAVE 4 REDPEN (2026-08-08) — #ar-c-un (the hollow/unexecuted
                 marker) is GONE, not just unused: an authored cable no longer
                 emits any marker-end at all (see #ar-cabends' note below,
                 drawCables()) and a derived-only cable is ALWAYS executed by
                 definition (§3 success item 5 — "an observed cable with no
                 authored cable behind it... draws EXECUTED"), so nothing ever
                 drew the hollow marker in the first place. #ar-c-ex is the
                 only one left, and
                 it is still used, by the derived-only path alone: only
                 marker-end, never marker-start, same single decorated endpoint
                 that keeps direction readable with no arrowhead (§3 success
                 item 7). -->
            <marker id="ar-c-ex" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7"
                    markerHeight="7">
              <circle cx="4" cy="4" r="3" fill="#5f5e59"/>
            </marker>
          </defs>
          <g id="ar-cablesG"></g>
          <path id="ar-ghost" class="cvis c-ghost" d="" visibility="hidden"/>
        </svg>
        <!-- WAVE 4 REDPEN (2026-08-08) — an AUTHORED cable's endpoint circle
             (§3) sits at a NOTCH, and .notch is an opaque HTML div, z-index
             12, that already sits above #ar-svg (z-index:auto) — it painted
             over the SVG marker-end circle completely, on every notch kind,
             not just the ones with a visibly mismatched glyph. This sibling
             is HTML for the same reason .notch is: only HTML can outrank
             another HTML element by z-index without moving the whole canvas.
             Same #ar-world coordinate space as .node/.notch (world px, no
             transform of its own — it rides the shared pan/zoom for free),
             filled fresh every drawCables() call, same wholesale-rebuild
             discipline as #ar-cablesG. pointer-events:none throughout: it
             must never steal a notch's drag or the .chit hit-path beneath
             it. A derived-only cable does NOT get one — it already ends on a
             bare node edge, no notch there to collide with, and its own SVG
             marker-end (#ar-c-ex — always executed, §3 success item 5) still
             does the job untouched. -->
        <div id="ar-cabends"></div>
        <!-- WAVE 3 — the cable's action menu. INSIDE #ar-world on purpose: it is
             pinned to a cable, so it must pan and zoom with the cable, and being
             static DOM here (not built per-render) is what lets it survive a
             redraw with the caret still in the field. See THE CABLE'S ACTION. -->
        <div id="ar-cbmenu">
          <div class="cbm-h">action on this cable</div>
          <div class="cbm-seeds" id="ar-cbmenuSeeds"></div>
          <input id="ar-cbmenuIn" spellcheck="false"
                 placeholder="anything — this list is open">
          <!-- SCOPE-edge-storage — a second field, content, twin of action
               on the same edge object. Same open-text, same store-verbatim,
               same saveSoon(). Clear clears both (Brandon, 2026-08-08). -->
          <div class="cbm-h cbm-h2">content this edge carries</div>
          <input id="ar-cbmenuContent" spellcheck="false"
                 placeholder="anything — this edge carries it">
          <div class="cbm-row">
            <button id="ar-cbmenuClr">clear</button>
            <button id="ar-cbmenuDone">done</button>
          </div>
          <div class="cbm-note">what should happen when the source region finishes.
            stored on the cable and piped out with the plan.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<div id="ar-jsonwrap">
  <div id="ar-jsonbox">
    <div class="jb-row">
      <span class="jb-t">the extraction tab's plan — select all, copy, hand it over</span>
      <button class="tb-btn" id="ar-jbCopy">copy</button>
      <button class="tb-btn" id="ar-jbClose">close</button>
    </div>
    <textarea id="ar-jsonta" spellcheck="false"></textarea>
  </div>
</div>

<div id="ar-ex" class="exm-replace">
  <div id="ar-exPanel">
    <div class="ex-head">
      <button id="ar-exBack">← canvas</button>
      <span id="ar-exTitle"></span><span id="ar-exModel"></span>
    </div>
    <div class="ex-grid">
      <div class="ex-f"><label>agent</label><textarea data-f="agent"></textarea></div>
      <div class="ex-f"><label>worktree / branch — where this node works</label>
        <input data-f="wt" spellcheck="false" placeholder="../agent-1  ·  or a branch  ·  blank = wherever the plan is"></div>
      <div class="ex-f wide"><label>notes</label><textarea data-f="notes"></textarea></div>
    </div>
  </div>
</div>

<div id="ar-zoomctl">
  <button id="ar-zOut">−</button><span id="ar-zoomLbl">100%</span><button id="ar-zIn">+</button>
</div>
<div id="ar-toast"></div>
<!-- right-click menu (2026-08-08, Brandon) — nodes · cables · phase columns. Host-
     scoped absolute, same idiom as #ar-zoomctl/#ar-toast above: positioned in
     JS off the triggering event, host-relative. Built fresh per open, see
     openCtxMenu(). -->
<div id="ar-ctxmenu"></div>
`;

export function mount(elHost, ctx){
  _host=elHost;_ctx=ctx;
  _host.innerHTML=HOST_HTML;
  world=$('#ar-world');cwrap=$('#ar-cwrap');svg=$('#ar-svg');cablesG=$('#ar-cablesG');
  ghost=$('#ar-ghost');rail=$('#ar-rail');toastEl=$('#ar-toast');cabEnds=$('#ar-cabends');
  ctxMenu=$('#ar-ctxmenu');
  wireCanvas();wireChrome();wireCableMenu();
  document.addEventListener('keydown',onKeydown);
  document.addEventListener('pointerdown',e=>{
    if(!ctxMenuIsOpen())return;
    if(!_host.classList.contains('active'))return;
    if(!e.target.closest('#ar-ctxmenu'))closeCtxMenu()});
  window.addEventListener('beforeunload',()=>{clearTimeout(_st);save()});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){clearTimeout(_st);save()}});
  initState();applyDev();applyView();
}

export function refresh(){
  render();
  if(_ctx&&_ctx.send)_ctx.send({type:'feed'});
}






const PX_PER_MIN=26;
const LANE_H=150;
const LIVE_X0=40, LIVE_Y0=40;

function railOf(row){
  return [row.provider,row.loop_class,row.mechanism].filter(Boolean).join(' · ');}
function startMs(row){
  if(!row||!row.created)return null;
  const t=Date.parse(row.created);return isNaN(t)?null:t;}

function adoptRegions(rows,prune){
  if(!S)return;
  const ph=phase();if(!ph)return;
  if(!ph._live)ph._live=[];
  const authored=new Map(ph.nodes.map(n=>[n.id,n]));
  const byRid=new Map((ph._live||[]).map(n=>[n.regnode_id,n]));
  let origin=Infinity;
  rows.forEach(r=>{const t=startMs(r);if(t!=null&&t<origin)origin=t});
  if(!isFinite(origin))origin=Date.now();
  const seen=new Set();let changed=false;
  rows.forEach((r,ix)=>{
    if(!r||!r.id)return;
    seen.add(r.id);
    if(r.root)_regionRoots[r.id]=r.root;
    const an=r.node_id?authored.get(r.node_id):null;
    if(an){
      const rail=railOf(r);
      if(an.regnode_id!==r.id||an._rail!==rail){an.regnode_id=r.id;an._rail=rail;changed=true}
      const old=byRid.get(r.id);
      if(old){ph._live=ph._live.filter(x=>x!==old);byRid.delete(r.id);changed=true}
      return;
    }
    let n=byRid.get(r.id);
    if(!n){
      const t=startMs(r);
      n=blankRegion(uid(),{
        x:Math.max(0,LIVE_X0+(t==null?0:((t-origin)/60000)*PX_PER_MIN)),
        y:LIVE_Y0+ix*LANE_H});
      n._live=true;n.regnode_id=r.id;
      n.status='idle';
      ph._live.push(n);byRid.set(r.id,n);changed=true;
    }
    const rail=railOf(r);
    const name=r.name||'',model=r.model||'',track=r.track||'';
    if(n._rail!==rail||n.name!==name||n.model!==model||n.track!==track){
      n._rail=rail;n.name=name;n.model=model;n.track=track;changed=true}
  });
  if(prune&&ph._live.length){
    const keep=ph._live.filter(n=>seen.has(n.regnode_id));
    if(keep.length!==ph._live.length){ph._live=keep;changed=true}
    ph.nodes.forEach(n=>{if(n.regnode_id&&!seen.has(n.regnode_id)){n.regnode_id=null;n._rail='';changed=true}});
  }
  if(changed&&_host&&_host.classList.contains('active'))render();
}

export function onFrame(m){
  if(!S||!m)return;
  if(m.type==='ade_init'||m.type==='track_list')adoptRegions(m.tracks||[],true);
  else if(m.type==='track_created'&&m.track)adoptRegions([m.track],false);
  else if(m.type==='feed'){
    _feed=m.records||[];
    if(_host&&_host.classList.contains('active'))render();
  }
}




export function insertRegion(src){
  if(!S)return null;
  const ph=phase();if(!ph)return null;
  const k=ph.nodes.length;
  const n=blankRegion(uid(),{x:40+(k%5)*200,y:40+Math.floor(k/5)*150});
  n.name=(src&&src.name)||'';
  n.model=(src&&src.model)||'';
  REGION_FIELDS.forEach(f=>{const v=regionGet(src,f);if(v)regionSet(n,f,v)});
  snap('add region'+(n.name?' “'+n.name+'”':''));
  ph.nodes.push(n);
  save();
  if(_host&&_host.classList.contains('active'))render();
  return n;
}

export function onEsc(){
  const ae=document.activeElement;
  if(ae&&_host.contains(ae)&&ae.closest('[contenteditable],input,textarea'))return true;
  if($('#ar-jsonwrap').classList.contains('open')){$('#ar-jsonwrap').classList.remove('open');return true}
  if($('#ar-ex').classList.contains('open')){closeExpand();return true}
  if(ctxMenuIsOpen()){closeCtxMenu();return true}
  if(menuFor){closeCableMenu();return true}
  if(selNode||selCable){selNode=selCable=null;applySel();drawCables();return true}
  return false;
}
