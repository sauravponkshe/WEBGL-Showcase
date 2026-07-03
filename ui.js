// ui.js — WEB_CONFIGURATOR UI layer
// Edit this file to customise the web UI after export.
// Globals are exposed by the main module via window before buildUI() is called.

function _animLabel(def,idx){
  const total=(def.states||2)-1;
  const nm=(def.state_names&&def.state_names[idx])?def.state_names[idx]:'';
  return (nm?nm+' ':'')+'['+idx+'/'+total+']';
}

function buildHDRISwitcher(){
  const items=CFG.hdris||[];
  const sec=document.getElementById('shdri');
  if(!sec) return;
  if(items.length<2){ sec.innerHTML=''; return; }   // nothing to switch between
  sec.innerHTML='<div class="st">Environment</div>';
  const g=mk('div','pg');
  items.forEach(item=>{
    const b=mk('button','pb2'); b.textContent=item.name; b.dataset.hf=item.file;
    if(item.file===_hdriActiveFile || (!_hdriActiveFile && item.default)) b.classList.add('active');
    b.onclick=()=>{
      _loadHDRIItem(item);
      qsa('.pb2[data-hf]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    };
    g.appendChild(b);
  });
  sec.appendChild(g);
}

function buildUI(){
  buildVariants();buildGlobalSets();buildGeoPkgs();buildMatSubs();buildHDRISwitcher();
  buildAdvGeo();buildAdvMat();buildAnimUI();buildSequenceUI();buildCameraUI();
  document.getElementById('atb').addEventListener('click',()=>{
    const s=document.getElementById('as');s.classList.toggle('open');
    document.getElementById('aa').textContent=s.classList.contains('open')?'▴':'▾';
  });
  const ptab=document.getElementById('ptab'),pan=document.getElementById('panel');
  ptab.onclick=()=>{pan.classList.toggle('closed');ptab.textContent=pan.classList.contains('closed')?'❮':'❯';};
  if(window.innerWidth<768){pan.classList.add('closed');ptab.textContent='❮';}
  document.querySelectorAll('.tnb').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tnb').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    });
  });
  const ccBtn=mk('button','at');
  ccBtn.style.cssText='margin-top:30px;color:#c8a96e;border-color:var(--border)';
  ccBtn.innerHTML='↻ FORCE REFRESH';
  ccBtn.onclick=()=>{window.location.href=window.location.href.split('?')[0]+'?nocache='+Date.now();};
  document.getElementById('pb').appendChild(ccBtn);
}

function buildAnimUI(){
  const allCtrl=(CFG.animations||{}).controls||[];
  const controls=allCtrl.filter(d=>!d.builtin);   // regular controls only
  const builtins=allCtrl.filter(d=>d.builtin);     // Explode / Hover
  const combos=(CFG.animations||{}).combos||[];
  const ctrlSec=document.getElementById('sa-ctrl');
  const comboSec=document.getElementById('sa-combo');
  const biSec=document.getElementById('sa-builtin');

  ctrlSec.innerHTML='<div class="st">Animation Controls</div>';
  if(controls.length){
    controls.forEach(def=>{
      if(def.trigger==='button'){
        const btn=mk('button','anim-btn');btn.dataset.anim=def.name;
        btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
        btn.onclick=()=>triggerAnim(def.name);ctrlSec.appendChild(btn);
      }else if(def.trigger==='mesh'){
        const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--muted);padding:5px 0 5px 4px;letter-spacing:.1em';
        lbl.textContent='▷ '+def.name.replace(/_/g,' ')+'  [touch: '+def.trigger_mesh+']';ctrlSec.appendChild(lbl);
      }else if(def.trigger==='hotspot'){
        const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
        lbl.textContent='● '+def.name.replace(/_/g,' ')+'  [hotspot in scene]';ctrlSec.appendChild(lbl);
      }
    });
  }else{
    const p=mk('p');p.style.cssText='font-size:10px;color:var(--muted);padding:6px 0';
    p.textContent='No animation controls exported.';ctrlSec.appendChild(p);
  }

  comboSec.innerHTML='<div class="st">Animation Combos</div>';
  if(combos.length){
    combos.forEach(def=>{
      if(def.trigger==='button'){
        const btn=mk('button','anim-btn');btn.dataset.anim=def.name;
        const ms=(def.members||[]).join(' + ')||'—';
        btn.title='Parts: '+ms;   // member list on hover (was crowding the row)
        btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
        btn.onclick=()=>triggerAnim(def.name);comboSec.appendChild(btn);
      }else if(def.trigger==='mesh'){
        const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--muted);padding:5px 0 5px 4px;letter-spacing:.1em';
        lbl.textContent='▷ '+def.name.replace(/_/g,' ')+'  [touch: '+def.trigger_mesh+']';comboSec.appendChild(lbl);
      }else if(def.trigger==='hotspot'){
        const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
        lbl.textContent='● '+def.name.replace(/_/g,' ')+'  [hotspot in scene]';comboSec.appendChild(lbl);
      }
    });
  }

  // ── Built-in Animations (Explode / Hover): own group under the ANIM tab ──
  if(biSec){
    if(builtins.length){
      biSec.innerHTML='<div class="st">Special Effects</div>';
      builtins.forEach(def=>{
        if(def.trigger==='button'){
          const btn=mk('button','anim-btn');btn.dataset.anim=def.name;
          btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
          btn.onclick=()=>triggerAnim(def.name);biSec.appendChild(btn);
        }else if(def.trigger==='mesh'){
          const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--muted);padding:5px 0 5px 4px;letter-spacing:.1em';
          lbl.textContent='▷ '+def.name.replace(/_/g,' ')+'  [touch: '+def.trigger_mesh+']';biSec.appendChild(lbl);
        }else if(def.trigger==='hotspot'){
          const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
          lbl.textContent='● '+def.name.replace(/_/g,' ')+'  [hotspot in scene]';biSec.appendChild(lbl);
        }
      });
    }else{ biSec.innerHTML=''; }
  }
}

// ── Sequences ─────────────────────────────────────────────────────────────────
// A Sequence is a named list of Steps that fires animations, combos, and
// camera fly-tos in order. Steps marked Together fire simultaneously with the
// step directly above them. The executor syncs animState so the configurator
// UI always reflects the current state.

const _seqRunning = {};   // seqName → true while a sequence is executing



function _fireStep(step) {
  const {action_type, action_name, target_state} = step;
  if (action_type === 'flyto') {
    // Dedicated camera fly-to step — no animation, just move the camera.
    if (action_name) flyToCamera(action_name);
  } else {
    // CONTROL or COMBO: drive animation directly to explicit target state.
    if (action_name) flyToAnimState(action_name, target_state ?? 1);
  }
}

async function executeSequence(seqName) {
  const seqs = (CFG.animations||{}).sequences || [];
  const seq  = seqs.find(s => s.name === seqName);
  if (!seq || !seq.steps || !seq.steps.length) return;
  if (_seqRunning[seqName]) return;
  _seqRunning[seqName] = true;

  try {
    let i = 0;
    while (i < seq.steps.length) {
      // Collect group: this step + any consecutive Together steps.
      const group = [seq.steps[i]];
      let j = i + 1;
      while (j < seq.steps.length && seq.steps[j].together) {
        group.push(seq.steps[j]); j++;
      }

      // Snapshot which keys are CURRENTLY live in _segWatch before firing.
      const before = new Set(Object.keys(_segWatch));

      // Fire every step in the group simultaneously.
      group.forEach(st => _fireStep(st));

      // Identify keys NEWLY added to _segWatch by these steps.
      const newKeys = Object.keys(_segWatch).filter(k => !before.has(k));

      const hasFlyto = group.some(st => st.action_type === 'flyto');
      await new Promise(res => {
        if (newKeys.length === 0 && !hasFlyto) { setTimeout(res, 60); return; }
        const T0 = performance.now();
        const poll = () => {
          try {
            const animDone = newKeys.every(k => !_segWatch[k]);
            const flyDone = !hasFlyto || !window._isFlyActive();
            if ((animDone && flyDone) || performance.now() - T0 > 15000) { res(); return; }
          } catch(e) { res(); return; }
          setTimeout(poll, 30);
        };
        setTimeout(poll, 16);
      });

      i = j;
    }
  } finally {
    _seqRunning[seqName] = false;
  }
}
function buildSequenceUI() {
  const seqs = (CFG.animations||{}).sequences || [];
  if (!seqs.length) return;

  // Find or create the sequences section inside the anim tab.
  let sec = document.getElementById('sa-seq');
  if (!sec) {
    const animTab = document.getElementById('tab-anim');
    if (!animTab) return;
    sec = mk('div', 'sec'); sec.id = 'sa-seq';
    animTab.appendChild(sec);
  }

  sec.innerHTML = '<div class="st">Sequences</div>';

  seqs.forEach(seq => {
    const trigger = seq.trigger || 'button';
    if (trigger === 'button') {
      const btn = mk('button', 'anim-btn');
      btn.textContent = (seq.label || seq.name).replace(/_/g,' ');
      btn.onclick = () => executeSequence(seq.name);
      sec.appendChild(btn);
    } else if (trigger === 'mesh') {
      const lbl = mk('div');
      lbl.style.cssText = 'font-size:10px;color:var(--muted);padding:5px 0 5px 4px;letter-spacing:.1em';
      lbl.textContent = '▷ ' + seq.name.replace(/_/g,' ') + '  [touch: ' + seq.trigger_mesh + ']';
      sec.appendChild(lbl);
    } else if (trigger === 'hotspot') {
      const lbl = mk('div');
      lbl.style.cssText = 'font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
      lbl.textContent = '● ' + seq.name.replace(/_/g,' ') + '  [hotspot in scene]';
      sec.appendChild(lbl);
    }
  });

  // Wire mesh-click triggers for sequences.
  seqs.filter(s => s.trigger === 'mesh' && s.trigger_mesh).forEach(seq => {
    _addMeshTrigger(seq.trigger_mesh, () => executeSequence(seq.name));
  });

  // Wire hotspot triggers for sequences.
  seqs.filter(s => s.trigger === 'hotspot' && s.hotspot_object).forEach(seq => {
    _registerHotspot(seq.hotspot_object, () => executeSequence(seq.name));
  });
}

function buildCameraUI(){
  const staticList=camCfg.static||[];
  const tt=camCfg.turntable||{};
  const cin=camCfg.cinematic||{};
  const staticSec=document.getElementById('sc-static');
  const ttSec=document.getElementById('sc-turntable');
  const cinSec=document.getElementById('sc-cinematic');

  if(staticList.length){
    staticSec.innerHTML='<div class="st">Static Cameras</div>';
    staticList.forEach(sc=>{
      const btn=mk('button','cam-btn');btn.dataset.cam=sc.name;
      btn.textContent=sc.name.replace(/_/g,' ');
      btn.onclick=()=>flyToCamera(sc.name);staticSec.appendChild(btn);
    });
  }

  if(tt.enabled){
    ttSec.innerHTML='<div class="st">Turntable</div>';
    const btn=mk('button','tt-btn');btn.textContent='Auto Rotate';
    btn.onclick=()=>_turntableActive?_stopTurntable():_startTurntable();
    ttSec.appendChild(btn);
  }

  if((cin.sequence||[]).length){
    cinSec.innerHTML='<div class="st">Cinematic Sequence</div>';
    const seqDiv=mk('div');seqDiv.style.cssText='font-size:9px;color:var(--muted);letter-spacing:.12em;margin-bottom:10px;line-height:1.9';
    cin.sequence.forEach((s,i)=>{seqDiv.innerHTML+=(i+1)+'. '+s.name.replace(/_/g,' ')+'<br>';});
    cinSec.appendChild(seqDiv);
    if(cin.trigger==='button'){
      const btn=mk('button','cin-btn');
      btn.innerHTML='<span>PLAY CINEMATIC</span>';
      btn.onclick=()=>_cinematicPlaying?_stopCinematic():_startCinematic();
      cinSec.appendChild(btn);
    }else if(cin.trigger==='mesh'){
      const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--muted);padding:4px 0;letter-spacing:.1em';
      lbl.textContent='▷ Touch '+(cin.trigger_mesh||'')+' to play cinematic';cinSec.appendChild(lbl);
    }else if(cin.trigger==='hotspot'){
      const lbl=mk('div');lbl.style.cssText='font-size:10px;color:var(--hot);padding:4px 0;letter-spacing:.1em';
      lbl.textContent='● Hotspot in scene starts cinematic';cinSec.appendChild(lbl);
    }
  }
}

function buildVariants(){
  const keys=Object.keys(varData);if(!keys.length)return;
  const sec=document.getElementById('sv');sec.innerHTML='<div class="st">Variants</div>';
  const g=mk('div','vg');
  keys.forEach(k=>{const b=mk('div','vc');b.dataset.v=k;b.textContent=k.replace(/_/g,' ');b.onclick=()=>applyVariant(k);g.appendChild(b);});
  sec.appendChild(g);
}
function buildGlobalSets(){
  const sets=CFG.global_mat_sets||[];if(!sets.length)return;
  const sec=document.getElementById('sgs');sec.innerHTML='<div class="st">Full Configurations</div>';
  sets.forEach(s=>{
    const b=mk('button','gb');b.dataset.gn=s.name;b.textContent=s.name;
    b.onclick=()=>{applyMatSubset(s.state);qsa('.gb').forEach(x=>x.classList.remove('active'));qsa('.pb2[data-sc]').forEach(x=>x.classList.remove('active'));b.classList.add('active');refreshAdvMat(s.state);};
    sec.appendChild(b);
  });
}
function applyGeoToggle(colName,siblingNames){
  const sc=colName.replace(/ /g,'_');
  const smooth=!!_TRANS.geometry;
  siblingNames.forEach(s=>{
    const n=findNode(s);
    const show=(s===sc);
    if(show) geoSt[s]=true; else delete geoSt[s];
    if(!n) return;
    if(smooth && root && root.visible){
      // Dissolve in the shown one / dissolve out the rest (only if state changed).
      if(show && !n.visible) _geoDissolveNode(n,+1);
      else if(!show && n.visible) _geoDissolveNode(n,-1);
      else n.visible=show;
    } else {
      n.visible=show;
    }
  });
  refreshActive();
}
function applyGeoSubset(st){
  Object.entries(st).forEach(([parent,child])=>{
    let pN=CFG.geometry_exposed[parent]?parent:(CFG.geometry_exposed['GEOMETRIES_'+parent]?'GEOMETRIES_'+parent:null);
    const sib=pN&&CFG.geometry_exposed[pN]?CFG.geometry_exposed[pN].children.map(c=>c.name):[];
    applyGeoToggle(child.replace(/ /g,'_'),sib);
  });
}
function buildAdvGeo(){
  const entries=Object.entries(CFG.geometry_exposed||{}).filter(([,t])=>!t.subset_only);
  const sec=document.getElementById('sag');sec.innerHTML='<div class="st">Geometry Variants</div>';
  if(!entries.length){const p=mk('p');p.style.cssText='font-size:10px;color:var(--muted);margin-top:4px';p.textContent='No geometry variants defined.';sec.appendChild(p);return;}
  entries.forEach(([pN,tree])=>{
    const ch=(tree.children||[]).filter(c=>!c.name.toLowerCase().includes('common'));if(!ch.length) return;
    const pf=(pN||'').replace(/[_]+$/,'')+'_';
    const fid='adv-geo-'+pN.replace(/[^a-z0-9]/gi,'-').toLowerCase();
    const row=mk('div','sr');const lbl=mk('label');lbl.setAttribute('for',fid);lbl.textContent=pN.replace('GEOMETRIES_','').replace(/_/g,' ');row.appendChild(lbl);
    const sel=document.createElement('select');sel.id=fid;sel.innerHTML='<option value="">— select —</option>';
    ch.forEach(node=>{const o=document.createElement('option');o.value=node.name;const stripped=node.name.startsWith(pf)?node.name.slice(pf.length):node.name;o.textContent=stripped.replace(/_/g,' ')||node.name;sel.appendChild(o);});
    const cur=ch.find(c=>{const n=findNode(c.name);return n&&n.visible;});if(cur) sel.value=cur.name;
    sel.onchange=()=>{if(!sel.value)return;applyGeoToggle(sel.value,ch.map(c=>c.name));};
    row.appendChild(sel);sec.appendChild(row);
  });
}
function buildGeoNode(container,children,depth,parentName){
  if(!children.length)return;
  const row=mk('div','tr');row.style.marginLeft=(depth*10)+'px';
  const pf=(parentName||'').replace(/[_]+$/,'')+'_';
  children.forEach(node=>{
    if(node.name.toLowerCase().includes('common'))return;
    const btn=mk('button','tb');btn.dataset.col=node.name;
    const stripped=node.name.startsWith(pf)?node.name.slice(pf.length):node.name;
    btn.textContent=stripped.replace(/_/g,' ')||node.name;
    btn.onclick=()=>{
      const sib=children.map(c=>c.name);applyGeoToggle(node.name,sib);
      row.querySelectorAll('.tb').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
      container.querySelectorAll(`.nested-grp[data-depth="${depth}"]`).forEach(el=>el.classList.remove('open'));
      if(node.children?.length){
        const nid='ng-'+node.name.replace(/[^a-z0-9]/gi,'-');
        let nel=document.getElementById(nid);
        if(!nel){nel=mk('div','nested-grp');nel.id=nid;nel.dataset.depth=depth;buildGeoNode(nel,node.children,depth+1,node.name);container.appendChild(nel);}
        nel.classList.add('open');
      }
    };row.appendChild(btn);
  });container.appendChild(row);
}
function buildGeoPkgs(){
  const subs=CFG.geometry_subsets||[];if(!subs.length)return;
  const sec=document.getElementById('sgp');sec.innerHTML='<div class="st">Packages</div>';
  const g=mk('div','pg');
  subs.forEach((s,i)=>{const b=mk('button','pb2');b.dataset.gi=i;b.dataset.tp='gp';b.textContent=s.name;
    b.onclick=()=>{applyGeoSubset(s.state);qsa('.pb2[data-tp="gp"]').forEach(x=>x.classList.remove('active'));b.classList.add('active');};g.appendChild(b);});
  sec.appendChild(g);
}
function buildMatSubs(){
  const subs=CFG.mat_subsets||[];if(!subs.length)return;
  const byCat={};subs.forEach(s=>{(byCat[s.category]=byCat[s.category]||[]).push(s);});
  const sec=document.getElementById('sms');sec.innerHTML='';
  Object.entries(byCat).forEach(([cat,items])=>{
    const t=mk('div','st');t.textContent=cat;sec.appendChild(t);const g=mk('div','pg');
    items.forEach(s=>{const b=mk('button','pb2');b.dataset.sc=cat;b.textContent=s.name;
      b.onclick=()=>{applyMatSubset(s.state);qsa('.gb').forEach(x=>x.classList.remove('active'));qsa('.pb2[data-sc]').forEach(x=>x.classList.remove('active'));b.classList.add('active');refreshAdvMat(s.state);};g.appendChild(b);});
    sec.appendChild(g);
  });
}
function buildAdvMat(){refreshAdvMat({});}
function refreshAdvMat(state){
  const containers=CFG.containers||{};
  const sec=document.getElementById('sam');sec.innerHTML='<div class="st">Individual Materials</div>';
  const allKeys=Object.keys(containers).filter(k=>containers[k]?.length);
  if(!allKeys.length){const p=mk('p');p.style.cssText='font-size:10px;color:var(--muted);margin-top:4px';p.textContent='No material containers defined.';sec.appendChild(p);return;}
  allKeys.forEach(c=>{
    const vals=containers[c];
    const fid='adv-mat-'+c.toLowerCase().replace(/[^a-z0-9]/g,'-');
    const row=mk('div','sr');const lbl=mk('label');lbl.setAttribute('for',fid);lbl.textContent=c.replace(/_/g,' ');row.appendChild(lbl);
    const sel=document.createElement('select');sel.id=fid;sel.name=fid;sel.innerHTML='<option value="">— select —</option>';
    vals.forEach(v=>{const o=document.createElement('option');o.value=o.textContent=v;if(state[c]===v)o.selected=true;sel.appendChild(o);});
    sel.onchange=()=>{if(sel.value){applyMat(c,sel.value);matSt[c]=sel.value;}};
    row.appendChild(sel);sec.appendChild(row);
  });
}
function refreshActive(){
  qsa('.vc').forEach(b=>b.classList.toggle('active',b.dataset.v===activeV));
  qsa('.tb').forEach(b=>b.classList.remove('active'));
  Object.keys(geoSt).forEach(k=>{if(geoSt[k]){const btn=document.querySelector(`.tb[data-col="${k}"]`);if(btn)btn.classList.add('active');}  });
}
const mk=(t,c)=>{const e=document.createElement(t);if(c)e.className=c;return e;};
const qsa=(s)=>[...document.querySelectorAll(s)];
