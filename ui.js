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
  const overlaySet=_wceOverlaySet();
  const shown=items;
  sec.innerHTML='<div class="st">Environment</div>';
  const g=mk('div','pg');
  shown.forEach(item=>{
    const b=mk('button','pb2'); b.textContent=item.name; b.dataset.hf=item.file; b.dataset.name=item.name;
    if(item.name===_hdriActiveName || (!_hdriActiveName && item.default)) b.classList.add('active');
    b.onclick=()=>{
      _loadHDRIItem(item);
      qsa('.pb2[data-hf]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    };
    g.appendChild(b);
  });
  sec.appendChild(g);
}

function buildFilterSwitcher(){
  const items=(CFG.post_process&&CFG.post_process.filters)||[];
  const shown=items;   // every filter always shows as a button now, unconditionally
  const sec2=document.getElementById('sfilters');
  if(!sec2) return;
  if(!shown.length){ sec2.innerHTML=''; return; }
  sec2.innerHTML='<div class="st">Filters</div>';
  const g2=mk('div','pg');
  shown.forEach(item=>{
    const b=mk('button','pb2'); b.textContent=item.name; b.dataset.pf=item.filter_type; b.dataset.pfn=item.name;
    if(window._wceActivePPFilter===item.filter_type) b.classList.add('active');
    b.onclick=()=>{
      if(typeof _wceApplyPPFilter==='function') _wceApplyPPFilter(item.filter_type, item.intensity, item);
      window._wceActivePPFilter=item.filter_type;
      qsa('.pb2[data-pf]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    };
    g2.appendChild(b);
  });
  sec2.appendChild(g2);
}

const SELECTABLE_SELECTOR = '.vc,.gb,.pb2,.anim-btn,.cam-btn,.tt-btn,.cin-btn,.tnb,.tb,h1,#vl,.st,#atb,#sfx-toggle,#ar-btn,#force-refresh-btn,#st,.sr-label,.hotspot-lbl,.empty-note';
function _wceHexToRgba(hex, alpha){
  const h=(hex||'#808080').replace('#','');
  let r=parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
  if(isNaN(r)) r=128; if(isNaN(g)) g=128; if(isNaN(b)) b=128;
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}
function _wceApplyColors(colors, panelBg, panelOpacity){
  if(colors) Object.entries(colors).forEach(([k,v])=>{
    if(v) document.documentElement.style.setProperty('--'+k, v);
  });
  const bg = panelBg || '#000000';
  const op = (panelOpacity!=null?panelOpacity:100)/100;
  document.documentElement.style.setProperty('--panel-bg', _wceHexToRgba(bg, op));
}
function applyGlobalPalette(){
  // Removing the inline overrides (rather than setting a frozen snapshot of
  // Global's current values) lets the stylesheet's own :root rule show
  // through — which is what applyLive() keeps up to date on every edit.
  // Setting a snapshot here instead would freeze Global's colors at
  // whatever they were at this exact moment, permanently blocking any
  // later live edits to Global from ever showing (inline always beats a
  // stylesheet rule for the same property, regardless of source order).
  const theme = window.WCE_THEME || {};
  Object.keys(theme.colors||{}).forEach(k=>{ document.documentElement.style.removeProperty('--'+k); });
  document.documentElement.style.removeProperty('--panel-bg');
  window._wceActiveProfile = null;
  if(typeof buildThumbnailOverlays==='function') buildThumbnailOverlays();
}
function applyProfile(p){
  if(!p) return;
  // Canvas-mode profiles never touch global colors/panel styling at all --
  // only Panel-mode profiles do. Calling _wceApplyColors here regardless
  // would reset --panel-bg to black every time a Canvas profile triggers,
  // since its p.colors/p.panelBg are simply never populated.
  if(p.mode!=='canvas') _wceApplyColors(p.colors, p.panelBg, p.panelOpacity);
  window._wceActiveProfile = p;
  if(typeof buildThumbnailOverlays==='function') buildThumbnailOverlays();
}
function _wceRunTransition(applyFn, transitionType, duration){
  const dur = duration!=null ? duration : 400;
  if(transitionType === 'blackout' || transitionType === 'whiteout'){
    const panel = document.getElementById('panel');
    const rect = panel ? panel.getBoundingClientRect() : {left:0,top:0,width:window.innerWidth,height:window.innerHeight};
    const half = Math.max(80, Math.round(dur/2));
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;'+
      'z-index:99999;background:'+(transitionType==='blackout'?'#000':'#fff')+';opacity:0;transition:opacity '+(half/1000)+'s ease;pointer-events:none';
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>{ overlay.style.opacity='1'; });
    setTimeout(()=>{
      applyFn();
      setTimeout(()=>{
        overlay.style.opacity='0';
        setTimeout(()=>{ overlay.remove(); }, half+40);
      }, 80);
    }, half+10);
  } else if(transitionType === 'fade'){
    _wceEnsureColorTransitionCSS(dur);
    applyFn();
    // Remove the transition CSS once the animation has had time to finish —
    // otherwise it lingers permanently and makes a later 'None' transition
    // look like it's fading too, since the CSS rule never goes away.
    clearTimeout(_wceColorTransitionCleanupTimer);
    _wceColorTransitionCleanupTimer = setTimeout(_wceRemoveColorTransitionCSS, dur+50);
  } else {
    _wceRemoveColorTransitionCSS();   // guarantee no lingering transition CSS makes this look animated
    applyFn();
  }
}
let _wceColorTransitionCleanupTimer = null;
function _wceEnsureColorTransitionCSS(dur){
  if(document.getElementById('wce-color-transition-css')) return;
  const secs = (dur!=null?dur:400)/1000;
  const s=document.createElement('style'); s.id='wce-color-transition-css';
  s.textContent = '.pb2,.gb,.tb,.anim-btn,.cam-btn,.tt-btn,.cin-btn,.vc,.tnb,#panel{'+
    'transition:background-color '+secs+'s ease,color '+secs+'s ease,border-color '+secs+'s ease !important;}';
  document.head.appendChild(s);
}
function _wceRemoveColorTransitionCSS(){
  const s = document.getElementById('wce-color-transition-css');
  if(s) s.remove();
}
function _wceWireProfileTrigger(el, overlayId){
  // Canvas-mode profiles can be triggered by clicking a thumbnail, toggle
  // group, text label, image, or group frame directly -- not just the
  // fixed set of chrome buttons SELECTABLE_SELECTOR covers. Added as an
  // extra listener (never replacing the element's own onclick), so a
  // toggle still cycles its own state AND applies the profile at once.
  const profiles = window.WCE_PROFILES||[];
  const matched = profiles.find(p=>p.mode==='canvas' && (p.triggerOverlayIds||[]).indexOf(overlayId)!==-1);
  if(matched){
    el.addEventListener('click', ()=>_wceRunTransition(()=>applyProfile(matched), matched.transition||'fade', matched.duration));
  }
}
function _wceInitProfiles(){
  const profiles = window.WCE_PROFILES||[];
  document.querySelectorAll(SELECTABLE_SELECTOR).forEach(el=>{
    let matched = null;
    for(const p of profiles){
      const hit = (p.triggers||[]).some(t=>{
        const sel = (typeof t === 'string') ? t : t.selector;
        if(!sel) return false;
        try{ return el.matches(sel); }catch(e){ return false; }
      });
      if(hit){ matched = p; break; }
    }
    if(matched){
      const p = matched;
      el.addEventListener('click', ()=>_wceRunTransition(()=>applyProfile(p), p.transition||'fade', p.duration));
    } else {
      el.addEventListener('click', ()=>_wceRunTransition(applyGlobalPalette, 'fade'));
    }
  });
}
window._wceDesignerEditMode = window._wceDesignerEditMode !== undefined ? window._wceDesignerEditMode : !!window.WCE_DESIGNER_MODE;
function _wceApplyDesignerVisibility(){
  const forceShow = !!window._wceDesignerEditMode;
  // Hide empty ANIM / CAMERA tabs in Preview and the real exported build,
  // but keep them switchable in the Designer's Edit mode so they can still
  // be set up even before anything has been added to them.
  [['anim', ['sa-ctrl','sa-combo','sa-builtin','sa-seq','sa-mat','sa-geo']], ['camera', ['sc-static','sc-turntable','sc-cinematic']], ['section', ['ssection']]].forEach(pair=>{
    const tabName = pair[0], sectionIds = pair[1];
    const isEmpty = sectionIds.every(id=>{
      const el=document.getElementById(id);
      return !el || !el.querySelector('button, select, .anim-btn, .cam-btn, .tt-btn, .cin-btn');
    });
    const tabBtn = document.querySelector('.tnb[data-tab="'+tabName+'"]');
    const tabPane = document.getElementById('tab-'+tabName);
    if(!tabBtn || !tabPane) return;
    const shouldHide = isEmpty && !forceShow;
    tabBtn.style.display = shouldHide ? 'none' : '';
    if(shouldHide && tabBtn.classList.contains('active')){
      // The currently-active tab just got hidden — fall back to Config.
      tabBtn.classList.remove('active'); tabPane.classList.remove('active');
      const cfgBtn=document.querySelector('.tnb[data-tab="config"]'), cfgPane=document.getElementById('tab-config');
      if(cfgBtn) cfgBtn.classList.add('active');
      if(cfgPane) cfgPane.classList.add('active');
    }
  });
  // AR button: force-show as a preview placeholder in Designer Edit mode,
  // even on a browser/device with no real AR support to detect — but never
  // hide it if real AR support was genuinely found.
  const arBtn = document.getElementById('ar-btn');
  if(arBtn){
    var _isDesktopView = _wceDetectDeviceView() === 'desktop';
    var _shouldForceShow = forceShow && !_isDesktopView;
    if(_shouldForceShow) arBtn.style.display='flex';
    else if(arBtn.dataset.realArAvailable !== '1') arBtn.style.display='none';
  }
}
window._wceSetDesignerEditMode = function(on){
  window._wceDesignerEditMode = !!on;
  _wceApplyDesignerVisibility();
};
// Detects touch + viewport width for Desktop vs Mobile, then
// matchMedia(orientation) for Horizontal vs Vertical within Mobile. Applies
// whichever deviceOverrides snapshot matches to the JS-driven (non-CSS)
// parts of the theme -- overlays, panelLayout, chromeOverrides,
// thumbnailGroups, globalThumbProps -- colors, panel background, and
// typography are already handled natively via CSS media queries baked in
// at export time (see _wce_theme_css), requiring no JS here at all.
function _wceDetectDeviceView(){
  // wce_mobile_frame means this page is loaded inside the Mobile Portrait/
  // Horizontal phone-frame preview (see the /__wce_mobile__ server route) --
  // still a real desktop browser with a real mouse the whole time, so
  // hover:none/pointer:coarse below would never match no matter how narrow
  // the frame is. Checking this first means overlay positions, chrome
  // text, and layout (all driven by this function via
  // _wceApplyDeviceOverrides) correctly switch to the mobile version
  // through that preview too, not just the colors/typography that
  // _wce_theme_css's separate class-based fallback already covers.
  const forced = new URLSearchParams(window.location.search).get('wce_mobile_frame');
  if(forced === 'portrait') return 'mobileV';
  if(forced === 'horizontal') return 'mobileH';
  const isTouch = window.matchMedia("(hover:none) and (pointer:coarse)").matches;
  if(!isTouch) return "desktop";
  return window.matchMedia("(orientation:landscape)").matches ? "mobileH" : "mobileV";
}
function _wceApplyDeviceOverrides(){
  const base = window.WCE_THEME || {};
  const view = _wceDetectDeviceView();
  const dev = base.deviceOverrides || {};
  const override = (view!=="desktop") ? dev[view] : null;
  const src = override || base;
  window.WCE_OVERLAYS = src.overlays || [];
  window.WCE_PROFILES = src.profiles || base.profiles || [];
  window.WCE_THUMBNAIL_GROUPS = src.thumbnailGroups || [];
  base.panelLayout = src.panelLayout || "tabs";
  base.chromeOverrides = src.chromeOverrides || {};
  base.globalThumbProps = src.globalThumbProps || base.globalThumbProps;
  base.panelHidden = (override ? override.panelHidden : base.panelHidden);
}
let _wceOrientationListenerAttached = false;
function _wceAttachOrientationListener(){
  if(_wceOrientationListenerAttached) return;
  _wceOrientationListenerAttached = true;
  const mq = window.matchMedia("(orientation:landscape)");
  const onChange = function(){
    if(_wceDetectDeviceView()==="desktop") return;
    _wceApplyDeviceOverrides();
    if(typeof buildThumbnailOverlays==="function") buildThumbnailOverlays();
    if(typeof _wceApplyChromeOverrides==="function") _wceApplyChromeOverrides();
    const pan = document.getElementById("panel"), ptab = document.getElementById("ptab");
    if(pan && ptab){
      const hidden = !!(window.WCE_THEME||{}).panelHidden;
      pan.style.display = hidden ? "none" : "";
      ptab.style.display = hidden ? "none" : "";
    }
  };
  if(mq.addEventListener) mq.addEventListener("change", onChange);
  else if(mq.addListener) mq.addListener(onChange);
}
function buildUI(){
  // Mirrors _wceDetectDeviceView's own wce_mobile_frame check, applied as a
  // body class so _wce_theme_css's class-based fallback (see its own
  // comment) can pick up the colors/typography half of an artist's mobile
  // overrides through this same preview path -- _wceApplyDeviceOverrides
  // right below already handles the JS-driven half (overlays/layout/chrome
  // text) via that shared detection function.
  const _wceForcedMobile = new URLSearchParams(window.location.search).get('wce_mobile_frame');
  if(_wceForcedMobile === 'portrait') document.body.classList.add('wce-force-mobile-v');
  else if(_wceForcedMobile === 'horizontal') document.body.classList.add('wce-force-mobile-h');
  _wceApplyDeviceOverrides();
  _wceAttachOrientationListener();
  buildVariants();buildGlobalSets();buildGeoPkgs();buildMatSubs();buildHDRISwitcher();buildFilterSwitcher();
  buildAdvGeo();buildAdvMat();buildAnimUI();buildSequenceUI();buildCameraUI();buildSectionViewUI();buildThumbnailOverlays();if(typeof buildMatGeoAnimUI==='function') buildMatGeoAnimUI();
  _wceInitProfiles();
  document.getElementById('atb').addEventListener('click',()=>{
    const s=document.getElementById('as');s.classList.toggle('open');
    document.getElementById('aa').textContent=s.classList.contains('open')?'▴':'▾';
  });
  const ptab=document.getElementById('ptab'),pan=document.getElementById('panel');
  if((window.WCE_THEME||{}).panelHidden){pan.style.display='none';ptab.style.display='none';}
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
  ccBtn.id='force-refresh-btn';
  ccBtn.style.cssText='margin-top:30px;color:#c8a96e;border-color:var(--border)';
  ccBtn.innerHTML='↻ FORCE REFRESH';
  ccBtn.onclick=()=>{window.location.href=window.location.href.split('?')[0]+'?nocache='+Date.now();};
  document.getElementById('pb').appendChild(ccBtn);
  _wceApplyDesignerVisibility();
  _wceIndexStLabels();
  _wceApplyChromeOverrides();
}
function _wceIndexStLabels(){
  // :nth-of-type counts by tag name, not by class, so it can't reliably
  // target "the Nth .st among .st siblings" when other element types sit
  // between them. Index by data-attribute instead, which is exact regardless
  // of what else shares the parent.
  const parents = new Set();
  document.querySelectorAll('.st').forEach(function(el){ if(el.parentElement) parents.add(el.parentElement); });
  parents.forEach(function(parent){
    let i=0;
    Array.prototype.forEach.call(parent.children, function(child){
      if(child.classList.contains('st')){ child.dataset.stIdx = i; i++; }
    });
  });
}
function _wceApplyChromeOverrides(){
  const overrides = (window.WCE_THEME||{}).chromeOverrides || {};
  const isTextSel = function(s){ return s && (s === 'h1' || s === '#vl' || s === '#force-refresh-btn' || s === '#st' || s.indexOf('.st') !== -1 || s.indexOf('label[for=') !== -1 || s.indexOf('.hotspot-lbl') !== -1 || s.indexOf('.empty-note') !== -1); };
  Object.keys(overrides).forEach(function(sel){
    const entry = overrides[sel];
    const isText = isTextSel(sel);
    try{
      document.querySelectorAll(sel).forEach(function(el){
        // No Edit mode here, this is the real production page — a removed
        // element (text or button) is simply fully hidden. For text this
        // also removes any decorative pseudo-element tied to it (like the
        // .st divider line), not just its own text content.
        el.style.display = entry.removed ? 'none' : '';
        if(entry.text !== undefined && entry.text !== null){
          if(isText){
            el.textContent = entry.text;
          } else {
            // Buttons can carry nested markup (icon spans, etc.) — textContent
            // would wipe it out. Only touch the leading text node.
            const existing = Array.prototype.find.call(el.childNodes, function(n){ return n.nodeType === 3; });
            if(existing) existing.textContent = entry.text;
            else el.insertBefore(document.createTextNode(entry.text), el.firstChild);
          }
        }
        if(entry.pos){
          el.style.left = entry.pos.x+'%'; el.style.top = entry.pos.y+'%';
          el.style.bottom = 'auto'; el.style.right = 'auto';
        }
      });
    }catch(e){}
  });
}

function buildAnimUI(){
  const overlaySet=_wceOverlaySet();
  const allCtrl=(CFG.animations||{}).controls||[];
  const controls=allCtrl.filter(d=>!d.builtin && !d.hidden_ui);   // regular controls only
  const builtins=allCtrl.filter(d=>d.builtin);     // Explode / Hover
  const combos=((CFG.animations||{}).combos||[]);
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
      }else if(def.trigger==='hotspot'){
        const lbl=mk('div','hotspot-lbl');lbl.dataset.hotspotLabel=def.name;lbl.style.cssText='font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
        lbl.textContent='● '+def.name.replace(/_/g,' ')+'  [hotspot in scene]';ctrlSec.appendChild(lbl);
      }
    });
  }else{
    const p=mk('p','empty-note');p.dataset.note='anim-controls';p.style.cssText='font-size:10px;color:var(--muted);padding:6px 0';
    p.textContent='No animation controls exported.';ctrlSec.appendChild(p);
  }

  comboSec.innerHTML='<div class="st">Animation Combos</div>';
  if(combos.length){
    combos.forEach(def=>{
      if(def.trigger==='button'){
        const btn=mk('button','anim-btn');btn.dataset.anim=def.name;
        const ms=(def.members||[]).join(' + ')||'—';
        btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
        btn.onclick=()=>triggerAnim(def.name);comboSec.appendChild(btn);
      }else if(def.trigger==='hotspot'){
        const lbl=mk('div','hotspot-lbl');lbl.dataset.hotspotLabel=def.name;lbl.style.cssText='font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
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
        }else if(def.trigger==='hotspot'){
          const lbl=mk('div','hotspot-lbl');lbl.dataset.hotspotLabel=def.name;lbl.style.cssText='font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
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
  const {action_type, action_name, target_state, target_name, target_uid, container_name, container_material, geo_toggle_chain} = step;
  if (action_type === 'flyto') {
    // Dedicated camera fly-to step — no animation, just move the camera.
    if (action_name) flyToCamera(action_name);
  } else if (action_type === 'mat_subset' || action_type === 'global_set') {
    const pool = (CFG.mat_subsets||[]).concat(CFG.global_mat_sets||[]);
    // Prefer the persistent uid (survives renames, and disambiguates two
    // categories that happen to share an identically-named subset) --
    // falls back to a name-only match for sequences saved before target_uid
    // existed.
    const s = (target_uid && pool.find(x => x.uid === target_uid)) || pool.find(x => x.name === target_name);
    if (s) {
      applyMatSubset(s.state); refreshAdvMat(s.state);
      // Sync the active-button highlight on the panel, same as the normal
      // click handlers already do, so a sequence step does not leave the
      // previously-selected button looking active after switching away.
      qsa('.gb').forEach(x=>x.classList.remove('active'));
      qsa('.pb2').forEach(x=>{ if(x.dataset.sc!==undefined) x.classList.remove('active'); });
      const btn = qsa('.gb').find(x=>x.dataset.gn===target_name) ||
                  qsa('.pb2').find(x=>x.dataset.mn===target_name);
      if (btn) btn.classList.add('active');
    }
  } else if (action_type === 'geo_subset') {
    const s = (CFG.geometry_subsets||[]).find(x => x.name === target_name);
    if (s) {
      applyGeoSubset(s.state);
      qsa('.pb2').forEach(x=>{ if(x.dataset.tp==='gp') x.classList.toggle('active', x.textContent===target_name); });
    }
  } else if (action_type === 'environment') {
    const item = (CFG.hdris||[]).find(x => x.name === target_name);
    if (item) {
      _loadHDRIItem(item);
      qsa('.pb2').forEach(x=>{ if(x.dataset.hf!==undefined) x.classList.toggle('active', x.dataset.name===item.name); });
    }
  } else if (action_type === 'filter') {
    const item = ((CFG.post_process&&CFG.post_process.filters)||[]).find(x => x.name === target_name);
    if (item && typeof _wceApplyPPFilter==='function') {
      _wceApplyPPFilter(item.filter_type, item.intensity, item);
      window._wceActivePPFilter=item.filter_type;
      qsa('.pb2').forEach(x=>{ if(x.dataset.pf!==undefined) x.classList.toggle('active', x.dataset.pfn===item.name); });
    }
  } else if (action_type === 'container') {
    if (container_name && container_material) {
      applyMat(container_name, container_material); matSt[container_name]=container_material; refreshAdvMat(matSt);
    }
  } else if (action_type === 'geo_variant') {
    // Fires applyGeoToggle once per ancestor level, in order, from the
    // top-level slot down to the target leaf -- geo_toggle_chain is
    // precomputed entirely at export time (see
    // _wce_geo_toggle_chain_for_export), so this never needs to walk
    // CFG.geometry_exposed or reconstruct sibling lists at runtime.
    (geo_toggle_chain||[]).forEach(gstep => {
      if (gstep.child && gstep.siblings && gstep.siblings.length) applyGeoToggle(gstep.child, gstep.siblings);
    });
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
  const overlaySet=_wceOverlaySet();
  const shown = seqs;

  // Find or create the sequences section inside the anim tab.
  let sec = document.getElementById('sa-seq');
  if (!sec) {
    const animTab = document.getElementById('tab-anim');
    if (!animTab) return;
    sec = mk('div', 'sec'); sec.id = 'sa-seq';
    animTab.appendChild(sec);
  }

  sec.innerHTML = '<div class="st">Sequences</div>';

  shown.forEach(seq => {
    const trigger = seq.trigger || 'button';
    if (trigger === 'button') {
      const btn = mk('button', 'anim-btn');
      btn.textContent = (seq.label || seq.name).replace(/_/g,' ');
      btn.onclick = () => executeSequence(seq.name);
      sec.appendChild(btn);
    } else if (trigger === 'hotspot') {
      const lbl = mk('div','hotspot-lbl'); lbl.dataset.hotspotLabel=seq.name;
      lbl.style.cssText = 'font-size:10px;color:var(--hot);padding:5px 0 5px 4px;letter-spacing:.1em';
      lbl.textContent = '● ' + seq.name.replace(/_/g,' ') + '  [hotspot in scene]';
      sec.appendChild(lbl);
    }
  });


  // Wire hotspot triggers for sequences.
  seqs.filter(s => s.trigger === 'hotspot' && s.hotspot_object).forEach(seq => {
    _registerHotspot(seq.hotspot_object, () => executeSequence(seq.name));
  });
}

function buildSectionViewUI(){
  const sec=document.getElementById('ssection');
  if(!sec) return;
  const keys=Object.keys(window._wceSectionAxes||{});
  if(!keys.length){ sec.innerHTML=''; return; }
  sec.innerHTML='<div class="st">Section View</div>';
  const order=['x','y','z'];
  order.filter(k=>window._wceSectionAxes[k]).forEach(axisKey=>{
    const ax=window._wceSectionAxes[axisKey];
    const row=mk('div','sr');
    const btn=mk('button','pb2 sec-axis-btn');
    btn.textContent=axisKey.toUpperCase();
    btn.dataset.axis=axisKey;
    if(ax.active) btn.classList.add('active');
    const slider=document.createElement('input');
    slider.type='range'; slider.min='0'; slider.max='100'; slider.step='0.5';
    slider.value=ax.position;
    slider.disabled=!ax.active;
    slider.className='sec-axis-slider';
    btn.onclick=()=>{
      ax.active=!ax.active;
      btn.classList.toggle('active', ax.active);
      slider.disabled=!ax.active;
      if(typeof window._wceSectionSetActive==='function') window._wceSectionSetActive(axisKey, ax.active);
    };
    row.appendChild(btn);
    slider.oninput=()=>{
      ax.position=parseFloat(slider.value);
      if(typeof window._wceSectionSetPosition==='function') window._wceSectionSetPosition(axisKey, ax.position);
    };
    row.appendChild(slider);
    sec.appendChild(row);
  });
}

function buildCameraUI(){
  const overlaySet=_wceOverlaySet();
  const staticList=(camCfg.static||[]);
  const tt=camCfg.turntable||{};
  const cin=camCfg.cinematic||{};
  const staticSec=document.getElementById('sc-static');
  const ttSec=document.getElementById('sc-turntable');
  const cinSec=document.getElementById('sc-cinematic');

  staticSec.innerHTML = staticList.length ? '<div class="st">Scene Cameras</div>' : '';
  staticList.forEach(sc=>{
    const btn=mk('button','cam-btn');btn.dataset.cam=sc.name;
    btn.textContent=sc.name.replace(/_/g,' ');
    btn.onclick=()=>flyToCamera(sc.name);staticSec.appendChild(btn);
  });

  if(tt.enabled){
    ttSec.innerHTML='<div class="st">Turntable</div>';
    const btn=mk('button','tt-btn');btn.textContent='Auto Rotate';
    btn.onclick=()=>_turntableActive?_stopTurntable():_startTurntable();
    ttSec.appendChild(btn);
  } else {
    ttSec.innerHTML='';
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
    }else if(cin.trigger==='hotspot'){
      const lbl=mk('div','hotspot-lbl');lbl.dataset.hotspotLabel='cinematic';lbl.style.cssText='font-size:10px;color:var(--hot);padding:4px 0;letter-spacing:.1em';
      lbl.textContent='● Hotspot in scene starts cinematic';cinSec.appendChild(lbl);
    }
  }
}

function _wceOverlayKey(o){
  if(!o.type && o.container && o.material) o.type='material';   // legacy saves before multi-type overlays
  if(o.type==='material') return 'material::'+o.container+'::'+o.material;
  if(o.type==='geo_toggle') return 'geo_toggle::'+o.node;
  if(o.type==='hdri') return 'hdri::'+(o.uid || (o.item&&o.item.file));
  if(o.type==='mat_subset'||o.type==='global_set'||o.type==='geo_subset') return o.type+'::'+(o.uid||o.name);
  if(o.type==='turntable') return 'turntable::singleton';
  if(o.type==='cinematic') return 'cinematic::singleton';
  if(o.type==='text' || o.type==='group' || o.type==='section_slider') return o.id || (o.type+'::'+Math.random().toString(36).slice(2));
  return o.type+'::'+o.name;
}
function _wceOverlaySet(){
  return new Set((window.WCE_OVERLAYS||[]).map(_wceOverlayKey));
}
function applyOverlay(o){
  if(!o.type && o.container && o.material) o.type='material';
  try{
    if(o.type==='material' && o.container && o.material){
      applyMat(o.container, o.material); matSt[o.container]=o.material; refreshAdvMat(matSt);
    } else if(o.type==='variant' && o.name){
      applyVariant(o.name);
    } else if(o.type==='mat_subset'||o.type==='global_set'){
      // Resolve fresh from CFG by uid (name is only a fallback, for overlays
      // saved before uid existed) instead of trusting the state blob that
      // was captured on this overlay back in the Designer -- that snapshot
      // goes stale the moment the subset's material assignments change on a
      // later export, even though the subset's own name never did.
      const pool=(CFG.mat_subsets||[]).concat(CFG.global_mat_sets||[]);
      const s=(o.uid && pool.find(x=>x.uid===o.uid)) || pool.find(x=>x.name===o.name) || (o.state ? {state:o.state} : null);
      if(s){ applyMatSubset(s.state); refreshAdvMat(s.state); }
    } else if(o.type==='geo_subset'){
      const s=(o.uid && (CFG.geometry_subsets||[]).find(x=>x.uid===o.uid)) || (CFG.geometry_subsets||[]).find(x=>x.name===o.name) || (o.state ? {state:o.state} : null);
      if(s) applyGeoSubset(s.state);
    } else if(o.type==='geo_toggle' && o.node){
      applyGeoToggle(o.node, o.siblings||[]);
    } else if((o.type==='anim_control'||o.type==='anim_combo') && o.name){
      triggerAnim(o.name);
    } else if(o.type==='sequence' && o.name){
      executeSequence(o.name);
    } else if(o.type==='camera' && o.name){
      flyToCamera(o.name);
    } else if(o.type==='turntable'){
      window._turntableActive ? _stopTurntable() : _startTurntable();
    } else if(o.type==='cinematic'){
      window._cinematicPlaying ? _stopCinematic() : _startCinematic();
    } else if(o.type==='hdri'){
      const item=(o.uid && (CFG.hdris||[]).find(h=>h.uid===o.uid)) || (CFG.hdris||[]).find(h=>h.name===o.name) || o.item;
      if(item) _loadHDRIItem(item);
    } else if(o.type==='presentation'){
      if(_wcePresentationActive){ _wceExitPresentationMode(); }
      else{ _wceEnterPresentationMode(o, document.querySelector('[data-overlay-id="'+o.id+'"]')); }
    } else if(o.type==='snapshot'){
      _wceTakeSnapshot();
    }
    // 'text' and 'group' are purely descriptive/organizational -- no apply action.
  }catch(e){ console.error('[WCE] overlay apply failed:', e); }
}
function buildVariants(){
  const keys=Object.keys(varData);if(!keys.length)return;
  const overlaySet=_wceOverlaySet();
  const sec=document.getElementById('sv');sec.innerHTML='<div class="st">Variants</div>';
  const g=mk('div','vg');
  keys.forEach(k=>{const b=mk('div','vc');b.dataset.v=k;b.textContent=k.replace(/_/g,' ');b.onclick=()=>applyVariant(k);g.appendChild(b);});
  sec.appendChild(g);
}
function buildGlobalSets(){
  const sets=CFG.global_mat_sets||[];if(!sets.length)return;
  // Always shown, independent of whether Global Sets also has an enabled
  // Materials auto-cycling entry -- the manual picker and an auto-cycle
  // trigger are two separate controls now, not mutually exclusive.
  const overlaySet=_wceOverlaySet();
  const sec=document.getElementById('sgs');sec.innerHTML='<div class="st">Full Configurations</div>';
  sets.forEach(s=>{
    const b=mk('button','gb');b.dataset.gn=s.name;b.textContent=s.name;
    b.onclick=()=>{activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyMatSubset(s.state);qsa('.gb').forEach(x=>x.classList.remove('active'));qsa('.pb2[data-sc]').forEach(x=>x.classList.remove('active'));b.classList.add('active');refreshAdvMat(s.state);};
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
if(typeof _updateAnnotationVisibility==='function')_updateAnnotationVisibility();
_wceSyncGeoLinkedAreaLights();
}
function _wceSyncGeoLinkedAreaLights(){
  var _lights = (typeof window!=='undefined' && window._wceAreaLights) ? window._wceAreaLights : [];
  _lights.forEach(function(light){
    if(light.userData && light.userData.wceGeoChain && typeof window._wceRecomputeAreaLight==='function'){
      window._wceRecomputeAreaLight(light);
    }
  });
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
  const overlaySet=_wceOverlaySet();
  const sec=document.getElementById('sag');sec.innerHTML='<div class="st">Geometry Variants</div>';
  if(!entries.length){const p=mk('p','empty-note');p.dataset.note='geo-variants';p.style.cssText='font-size:10px;color:var(--muted);margin-top:4px';p.textContent='No geometry variants defined.';sec.appendChild(p);return;}
  entries.forEach(([pN,tree])=>{
    const allCh=(tree.children||[]).filter(c=>!c.name.toLowerCase().includes('common'));if(!allCh.length) return;
    const ch=allCh;
    if(!ch.length) return;
    const pf=(pN||'').replace(/[_]+$/,'')+'_';
    const fid='adv-geo-'+pN.replace(/[^a-z0-9]/gi,'-').toLowerCase();
    const row=mk('div','sr');const lbl=mk('label','sr-label');lbl.setAttribute('for',fid);lbl.textContent=pN.replace('GEOMETRIES_','').replace(/_/g,' ');row.appendChild(lbl);
    const sel=document.createElement('select');sel.id=fid;sel.innerHTML='<option value="">— select —</option>';
    ch.forEach(node=>{const o=document.createElement('option');o.value=node.name;const stripped=node.name.startsWith(pf)?node.name.slice(pf.length):node.name;o.textContent=stripped.replace(/_/g,' ')||node.name;sel.appendChild(o);});
    const cur=ch.find(c=>{const n=findNode(c.name);return n&&n.visible;});if(cur) sel.value=cur.name;
    sel.onchange=()=>{if(!sel.value)return;activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyGeoToggle(sel.value,allCh.map(c=>c.name));};
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
  // Always shown, independent of whether Geo Subsets also has an enabled
  // Geometries auto-cycling entry -- the manual picker and an auto-cycle
  // trigger are two separate controls now, not mutually exclusive.
  const overlaySet=_wceOverlaySet();
  const sec=document.getElementById('sgp');sec.innerHTML='<div class="st">Packages</div>';
  const g=mk('div','pg');
  subs.forEach((s,i)=>{const b=mk('button','pb2');b.dataset.gi=i;b.dataset.tp='gp';b.textContent=s.name;
    b.onclick=()=>{activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyGeoSubset(s.state);qsa('.pb2[data-tp="gp"]').forEach(x=>x.classList.remove('active'));b.classList.add('active');};g.appendChild(b);});
  sec.appendChild(g);
}
function buildMatSubs(){
  const subs=CFG.mat_subsets||[];if(!subs.length)return;
  const overlaySet=_wceOverlaySet();
  const byCat={};subs.forEach(s=>{(byCat[s.category]=byCat[s.category]||[]).push(s);});
  const sec=document.getElementById('sms');sec.innerHTML='';
  Object.entries(byCat).forEach(([cat,items])=>{
    // Always shown, independent of whether this category also has an
    // enabled Materials auto-cycling entry -- the manual picker and an
    // auto-cycle trigger are two separate controls now, not mutually
    // exclusive.
    const t=mk('div','st');t.textContent=cat;sec.appendChild(t);const g=mk('div','pg');
    items.forEach(s=>{const b=mk('button','pb2');b.dataset.sc=cat;b.dataset.mn=s.name;b.textContent=s.name;
      b.onclick=()=>{activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyMatSubset(s.state);qsa('.gb').forEach(x=>x.classList.remove('active'));qsa('.pb2[data-sc]').forEach(x=>x.classList.remove('active'));b.classList.add('active');refreshAdvMat(s.state);};g.appendChild(b);});
    sec.appendChild(g);
  });
}
function buildAdvMat(){refreshAdvMat({});}
function refreshAdvMat(state){
  const containers=CFG.containers||{};
  const overlaySet=_wceOverlaySet();
  const sec=document.getElementById('sam');sec.innerHTML='<div class="st">Individual Materials</div>';
  const allKeys=Object.keys(containers).filter(k=>containers[k]?.length);
  if(!allKeys.length){const p=mk('p','empty-note');p.dataset.note='material-containers';p.style.cssText='font-size:10px;color:var(--muted);margin-top:4px';p.textContent='No material containers defined.';sec.appendChild(p);return;}
  allKeys.forEach(c=>{
    const vals=containers[c];
    if(!vals.length) return;
    const fid='adv-mat-'+c.toLowerCase().replace(/[^a-z0-9]/g,'-');
    const row=mk('div','sr');const lbl=mk('label','sr-label');lbl.setAttribute('for',fid);lbl.textContent=c.replace(/_/g,' ');row.appendChild(lbl);
    const sel=document.createElement('select');sel.id=fid;sel.name=fid;sel.innerHTML='<option value="">— select —</option>';
    vals.forEach(v=>{const o=document.createElement('option');o.value=o.textContent=v;if(state[c]===v)o.selected=true;sel.appendChild(o);});
    sel.onchange=()=>{if(sel.value){activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyMat(c,sel.value);matSt[c]=sel.value;}};
    row.appendChild(sel);sec.appendChild(row);
  });
}
function _wceShapeVertices(shape){
  switch(shape){
    case 'hexagon': return [[25,0],[75,0],[100,50],[75,100],[25,100],[0,50]];
    case 'pentagon': return [[50,0],[100,38],[82,100],[18,100],[0,38]];
    case 'octagon': return [[30,0],[70,0],[100,30],[100,70],[70,100],[30,100],[0,70],[0,30]];
    case 'diamond': return [[50,0],[100,50],[50,100],[0,50]];
    default: return null;   // circle / square use native border-radius, no polygon needed
  }
}
function _wceRoundedPolygonPath(sizePx, vertsPct, radiusPx){
  const pts = vertsPct.map(p => [p[0]/100*sizePx, p[1]/100*sizePx]);
  const n = pts.length;
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const norm=v=>{ const l=Math.hypot(v[0],v[1])||1; return [v[0]/l,v[1]/l]; };
  let d='';
  for(let i=0;i<n;i++){
    const prev=pts[(i-1+n)%n], curr=pts[i], next=pts[(i+1)%n];
    const v1=norm([curr[0]-prev[0],curr[1]-prev[1]]), v2=norm([next[0]-curr[0],next[1]-curr[1]]);
    const len1=dist(prev,curr), len2=dist(curr,next);
    const r=Math.max(0,Math.min(radiusPx,len1/2,len2/2));
    const p1=[curr[0]-v1[0]*r,curr[1]-v1[1]*r], p2=[curr[0]+v2[0]*r,curr[1]+v2[1]*r];
    d += (i===0?'M ':'L ')+p1[0].toFixed(2)+' '+p1[1].toFixed(2)+' ';
    d += 'Q '+curr[0].toFixed(2)+' '+curr[1].toFixed(2)+' '+p2[0].toFixed(2)+' '+p2[1].toFixed(2)+' ';
  }
  return d+'Z';
}
const THUMB_GROUP_PROPS = ['size','shape','radius','borderWidth','borderColor','color','imageScale','opacity'];
// Groups only ever share these (never color/image — a whole group should
// never be forced onto the same image).
const THUMB_GROUP_STYLE_PROPS = ['size','shape','radius','borderWidth','borderColor','opacity'];
function _wceEffectiveThumbProps(o){
  let merged = Object.assign({}, o);
  if(o.styleGroupId){
    const props = o.styleGroupId==='__global__' ? (window.WCE_THEME||{}).globalThumbProps :
      ((window.WCE_THUMBNAIL_GROUPS||[]).find(g=>g.id===o.styleGroupId)||{}).props;
    if(props){
      THUMB_GROUP_STYLE_PROPS.forEach(k=>{ if(merged[k]===undefined && props[k]!==undefined) merged[k]=props[k]; });
    }
  }
  const activeProfile = window._wceActiveProfile;
  if(activeProfile && activeProfile.thumbnails && activeProfile.thumbnails[o.id]){
    const override = activeProfile.thumbnails[o.id];
    if(activeProfile.mode==='canvas'){
      // Canvas-mode overrides win outright, even over an explicit value the
      // thumbnail already has -- the whole point of a Canvas trigger is to
      // deliberately restyle things on demand while the profile is active.
      THUMB_GROUP_PROPS.forEach(k=>{ if(override[k]!==undefined) merged[k]=override[k]; });
    } else {
      // Panel-mode keeps the original behavior: the thumbnail's OWN explicit
      // value always wins -- only fills in properties left unset.
      THUMB_GROUP_PROPS.forEach(k=>{ if(o[k]===undefined && override[k]!==undefined) merged[k]=override[k]; });
    }
  }
  return merged;
}
function _wceEffectiveTextProps(o){
  let merged = Object.assign({}, o);
  const activeProfile = window._wceActiveProfile;
  if(activeProfile && activeProfile.textOverrides && activeProfile.textOverrides[o.id]){
    const override = activeProfile.textOverrides[o.id];
    if(activeProfile.mode==='canvas'){
      Object.keys(override).forEach(k=>{ merged[k]=override[k]; });
    } else {
      Object.keys(override).forEach(k=>{ if(o[k]===undefined) merged[k]=override[k]; });
    }
  }
  return merged;
}
function _wceEffectiveGroupProps(g){
  let merged = Object.assign({}, g);
  const activeProfile = window._wceActiveProfile;
  if(activeProfile && activeProfile.groupOverrides && activeProfile.groupOverrides[g.id]){
    const override = activeProfile.groupOverrides[g.id];
    if(activeProfile.mode==='canvas'){
      Object.keys(override).forEach(k=>{ merged[k]=override[k]; });
    } else {
      Object.keys(override).forEach(k=>{ if(g[k]===undefined) merged[k]=override[k]; });
    }
  }
  return merged;
}
function _wceApplyThumbShape(el, o0){
  const o = _wceEffectiveThumbProps(o0);
  // Rebuilds el's fill each call — safe since callers always create el fresh.
  el.innerHTML = '';
  if(o.emptied){
    el.style.display = 'none';
    return;
  }
  el.style.opacity = (o.opacity!=null ? o.opacity : 100)/100;
  const shape = o.shape || 'circle';
  const size = o.size || 46;
  const bw = o.borderWidth != null ? o.borderWidth : 2;
  const borderColor = o.borderColor || '#ffffff';
  const radius = o.radius || 0;

  if(shape === 'none'){
    // No shape at all — just the raw image (or color) with no border/clip,
    // so a transparent PNG shows through cleanly with nothing around it.
    el.style.clipPath = 'none';
    el.style.borderRadius = '0px';
    el.style.border = 'none';
    if(o.kind==='image' && o.image){
      el.style.background = 'transparent';
      el.style.backgroundImage = `url(${o.image})`;
      el.style.backgroundSize = (o.imageScale||100)+'%';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    } else {
      el.style.background = o.color || '#808080';
    }
    return;
  }

  const verts = _wceShapeVertices(shape);

  if(verts){
    // Polygon shapes: CSS border ignores clip-path, so the "border" is faked
    // with a border-colored outer clip and an inset inner clip for the fill —
    // otherwise the border only shows on the corners the clip happens to keep.
    el.style.clipPath = 'path("'+_wceRoundedPolygonPath(size, verts, radius)+'")';
    el.style.borderRadius = '0px';
    el.style.border = 'none';
    el.style.background = bw > 0 ? borderColor : 'transparent';
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;left:'+bw+'px;top:'+bw+'px;width:'+(size-2*bw)+'px;height:'+(size-2*bw)+'px;';
    const innerRadius = Math.max(0, radius - bw);
    inner.style.clipPath = 'path("'+_wceRoundedPolygonPath(size-2*bw, verts, innerRadius)+'")';
    if(o.kind==='image' && o.image){
      inner.style.backgroundImage = `url(${o.image})`;
      inner.style.backgroundSize = (o.imageScale||100)+'%';
      inner.style.backgroundPosition = 'center';
      inner.style.backgroundRepeat = 'no-repeat';
    } else {
      inner.style.background = o.color || '#808080';
    }
    el.appendChild(inner);
  } else {
    // Circle / Square — plain border-radius + a real CSS border works natively.
    el.style.clipPath = 'none';
    el.style.borderRadius = shape==='circle' ? '50%' : radius+'px';
    el.style.borderWidth = bw+'px';
    el.style.borderStyle = bw > 0 ? 'solid' : 'none';
    el.style.borderColor = borderColor;
    if(o.kind==='image' && o.image){
      el.style.backgroundImage = `url(${o.image})`;
      el.style.backgroundSize = (o.imageScale||100)+'%';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    } else {
      el.style.background = o.color || '#808080';
    }
  }
}
function _wceApplyGroupStyle(el, g){
  const header=el.querySelector('.wce-group-header');
  const body=el.querySelector('.wce-group-body');
  const label=el.querySelector('.wce-group-label');
  if(header){
    header.style.background=_wceHexToRgba(g.tabBg||'#1a1a1c', (g.tabBgOpacity!=null?g.tabBgOpacity:100)/100);
    header.style.borderColor=g.tabBorderColor||'#444444';
    header.style.borderWidth=(g.tabBorderWidth!=null?g.tabBorderWidth:1)+'px';
    header.style.borderStyle='solid';
    header.style.borderRadius=(g.tabRadius!=null?g.tabRadius:0)+'px';
  }
  if(body){
    body.style.background=_wceHexToRgba(g.shelfBg||'#1a1a1c', (g.shelfBgOpacity!=null?g.shelfBgOpacity:100)/100);
    body.style.borderColor=g.shelfBorderColor||'#444444';
    body.style.borderWidth=(g.shelfBorderWidth!=null?g.shelfBorderWidth:1)+'px';
    body.style.borderStyle='solid';
    body.style.borderRadius=(g.shelfRadius!=null?g.shelfRadius:0)+'px';
  }
  if(label){
    label.style.fontFamily=g.titleFont?("'"+g.titleFont+"',sans-serif"):'';
    label.style.fontSize=(g.titleFontSize||13)+'px';
  }
}
function _wceApplyGroupCollapse(el, g){
  const body = el.querySelector('.wce-group-body');
  const header = el.querySelector('.wce-group-header');
  if(!body || !header) return;
  const collapsed = !!g.collapsed;
  const dir = g.direction || 'vertical';
  const isHoriz = (dir==='horizontal' || dir==='reverse-horizontal');
  const isReverse = (dir==='reverse-horizontal' || dir==='reverse-vertical');
  const dirChanged = el.dataset.wceDir !== dir;
  el.dataset.wceDir = dir;
  if(dirChanged){
    header.style.writingMode=''; header.style.transform='';
    header.style.width=''; header.style.height=''; header.style.flexShrink='';
    el.style.display=''; el.style.flexDirection=''; el.style.transform='';
    body.style.width=''; body.style.position=''; body.style.left=''; body.style.top=''; body.style.right=''; body.style.bottom='';
    if(isHoriz){
      el.style.display='flex';
      el.style.flexDirection = isReverse ? 'row-reverse' : 'row';
      el.style.width='auto';
      header.style.flexShrink='0'; header.style.width='32px';
      header.style.writingMode='vertical-rl'; header.style.transform='rotate(180deg)';
      if(isReverse){
        // g.x/g.y (and dragging) always anchor the CONTAINER's own
        // top-left corner -- fine normally, where the header IS that
        // corner. For reverse-horizontal, row-reverse puts the header on
        // the RIGHT instead, so without this it would slide further right
        // as the body opens. Shifting the whole container left by its own
        // current total width keeps the header's edge fixed instead --
        // a percentage transform is relative to the element's OWN
        // rendered size and is recalculated every frame, so this stays
        // correct throughout the width transition, not just at rest.
        el.style.transform = 'translateX(-100%)';
      }
    } else if(isReverse){
      // Reverse Vertical: same header-then-body pair as plain Vertical,
      // just visually flipped via flex order instead of pulling the body
      // out of normal flow. A prior version anchored the body with
      // position:absolute + bottom:100% so it could escape the container
      // above the header -- that meant the body sat OUTSIDE the
      // container's own painted box, so the container's own background
      // never reached it (looked transparent) and its overflow:hidden
      // clipped it away unless overridden, which still didn't reliably
      // show. Keeping body in normal flow and reversing the column order
      // avoids both: the container's box still grows to enclose it, so
      // its background paints correctly and overflow:hidden never
      // conflicts with it.
      el.style.display='flex';
      el.style.flexDirection='column-reverse';
      // Same idea as the horizontal case above, on the other axis:
      // column-reverse puts the header on the BOTTOM, but g.x/g.y still
      // anchor the container's top-left corner -- without this the
      // header would slide further down as the body opens above it.
      el.style.transform = 'translateY(-100%)';
    }
  }
  if(isHoriz){
    const label=header.querySelector('.wce-group-label');
    let naturalLen=g.height||140;
    if(label){
      const clone=label.cloneNode(true);
      clone.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;writing-mode:horizontal-tb;transform:none;left:-9999px';
      header.appendChild(clone);
      naturalLen=Math.max(g.height||140, clone.scrollWidth+40);
      header.removeChild(clone);
    }
    header.style.height=naturalLen+'px';
    body.style.height=naturalLen+'px';
    body.style.width=collapsed?'0px':(g.width||180)+'px';
  } else {
    el.style.width=(g.width||180)+'px';
    body.style.height=collapsed?'0px':(g.height||140)+'px';
  }
}
let _wceGroupArrowDelegationAttached = false;
function _wceAttachGroupArrowDelegation(){
  // Attached exactly once, ever — never re-attached on re-render, so it can
  // never be lost or duplicated regardless of how many times overlays get
  // rebuilt. Always resolves the CURRENT element and CURRENT data at click
  // time via the DOM, rather than trusting a closure from whenever this
  // particular element happened to be created.
  if(_wceGroupArrowDelegationAttached) return;
  _wceGroupArrowDelegationAttached = true;
  document.body.addEventListener('click', function(ev){
    const arrow = ev.target.closest('.wce-group-arrow');
    if(!arrow) return;
    ev.stopPropagation();
    const groupEl = arrow.closest('.wce-overlay-group');
    if(!groupEl) return;
    const gid = groupEl.dataset.overlayId;
    const g = (window.WCE_OVERLAYS||[]).find(function(x){ return x.id===gid; });
    if(!g) return;
    g.collapsed = !g.collapsed;
    _wceApplyGroupCollapse(groupEl, g);
    arrow.textContent = g.collapsed ? '▸' : '▾';
  }, true);
}
function buildThumbnailOverlays(){
  // Buttons/labels the artist dragged out of the sidebar (or added freehand) in
  // the UI Designer -- variants, configs, packages, materials, animations,
  // cameras, sequences, environment, plus free-floating text labels and
  // collapsible groups that can nest several of the above together.
  document.querySelectorAll('.wce-overlay-thumb,.wce-overlay-text,.wce-overlay-group,.wce-overlay-section-slider,.wce-overlay-action-btn').forEach(el=>el.remove());
  const list=window.WCE_OVERLAYS||[];

  const groupEls={};
  list.filter(o=>o.type==='group').forEach(g=>{
    const el=mk('div','wce-overlay-group');
    el.dataset.overlayId=g.id;
    el.style.left=g.x+'%'; el.style.top=g.y+'%';
    el.innerHTML='<div class="wce-group-header"><span class="wce-group-arrow">'+(g.collapsed?'▸':'▾')+'</span>'+
      '<span class="wce-group-label">'+(g.label||'Group')+'</span></div><div class="wce-group-body"></div>';
    const geff=_wceEffectiveGroupProps(g);
    _wceApplyGroupCollapse(el, g);
    _wceApplyGroupStyle(el, geff);
    if(geff.titleFont) _wceEnsureFontLoaded(geff.titleFont);
    _wceWireProfileTrigger(el, g.id);
    document.body.appendChild(el);
    groupEls[g.id]=el;
    if(g.expandTrigger==='hover'){
      const _arw=el.querySelector('.wce-group-arrow');
      el.addEventListener('mouseenter',()=>{
        if(g.collapsed){ g.collapsed=false; _wceApplyGroupCollapse(el, g); if(_arw) _arw.textContent='\u25be'; }
      });
      el.addEventListener('mouseleave',()=>{
        if(!g.collapsed){ g.collapsed=true; _wceApplyGroupCollapse(el, g); if(_arw) _arw.textContent='\u25b8'; }
      });
    }
  });
  _wceAttachGroupArrowDelegation();

  function hostFor(o){
    const g=o.groupId && groupEls[o.groupId];
    return g ? g.querySelector('.wce-group-body') : document.body;
  }

  const _wceLoadedFonts={};
  function _wceEnsureFontLoaded(fam){
    const key=fam.trim().toLowerCase();
    if(_wceLoadedFonts[key]) return;
    _wceLoadedFonts[key]=true;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family='+fam.trim().replace(/ /g,'+')+':wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }
  list.filter(o=>o.type==='text').forEach(o0=>{
    const o=_wceEffectiveTextProps(o0);
    const el=mk('div','wce-overlay-text');
    el.dataset.overlayId=o0.id;
    el.textContent=o.label||'';
    el.style.color=o.color||'#ffffff';
    el.style.fontSize=(o.fontSize||13)+'px';
    if(o.fontFamily){ el.style.fontFamily=`'${o.fontFamily}',sans-serif`; _wceEnsureFontLoaded(o.fontFamily); }
    el.style.left=o0.x+'%'; el.style.top=o0.y+'%';
    if(o.link){
      el.classList.add('wce-overlay-linked');
      el.addEventListener('click', ()=>window.open(o.link, '_blank'));
    }
    _wceWireProfileTrigger(el, o0.id);
    hostFor(o).appendChild(el);
  });

  // Resolves one Toggle Group state {type,target} back into the full,
  // applyOverlay-compatible object -- each action type needs different
  // fields (a name, a full state blob, a full hdri item, etc.), so this
  // looks the real data up fresh from CFG rather than guessing a shape.
  function _wceResolveToggleState(st){
    if(!st || !st.type) return null;
    if(st.type==='camera'||st.type==='anim_control'||st.type==='anim_combo'||st.type==='sequence'||st.type==='variant'){
      return {type:st.type, name:st.target};
    }
    if(st.type==='hdri'){
      const item=(st.targetUid && (CFG.hdris||[]).find(h=>h.uid===st.targetUid)) || (CFG.hdris||[]).find(h=>h.name===st.target || h.file===st.target);
      return item ? {type:'hdri', item} : null;
    }
    if(st.type==='mat_subset'||st.type==='global_set'){
      const pool=(CFG.mat_subsets||[]).concat(CFG.global_mat_sets||[]);
      const s=(st.targetUid && pool.find(x=>x.uid===st.targetUid)) || pool.find(x=>x.name===st.target);
      return s ? {type:st.type, state:s.state} : null;
    }
    if(st.type==='geo_subset'){
      const s=(st.targetUid && (CFG.geometry_subsets||[]).find(x=>x.uid===st.targetUid)) || (CFG.geometry_subsets||[]).find(x=>x.name===st.target);
      return s ? {type:'geo_subset', state:s.state} : null;
    }
    if(st.type==='turntable'||st.type==='cinematic'){
      return {type:st.type};
    }
    return null;
  }
  function _wceShowTogglePicker(o, el, states){
    const existing=document.getElementById('wce-toggle-picker');
    if(existing) existing.remove();
    const rect=el.getBoundingClientRect();
    const pop=document.createElement('div');
    pop.id='wce-toggle-picker';
    const _dpTheme=(window.WCE_THEME&&window.WCE_THEME.dropdownPicker)||{};
    const _dpBg=_wceHexToRgba(_dpTheme.bgColor||'#0a0a0c', 0.95), _dpBorder=_dpTheme.borderColor||'#c8a96e';
    pop.style.cssText='position:fixed;z-index:10002;background:'+_dpBg+';border:1px solid '+_dpBorder+';border-radius:4px;padding:6px;min-width:120px';
    pop.style.left=rect.left+'px';
    pop.style.top=(rect.bottom+6)+'px';
    states.forEach((st,i)=>{
      const item=document.createElement('div');
      item.textContent=st.label || st.target || ('Option '+(i+1));
      item.style.cssText='padding:6px 10px;cursor:pointer;color:#fff;font-size:13px;border-radius:2px';
      item.addEventListener('mouseenter',()=>{ item.style.background='rgba(255,255,255,.1)'; });
      item.addEventListener('mouseleave',()=>{ item.style.background=''; });
      item.addEventListener('click',(e)=>{
        e.stopPropagation();
        o.activeIndex=i;
        const resolved=_wceResolveToggleState(st);
        if(resolved) applyOverlay(resolved);
        pop.remove();
        buildThumbnailOverlays();
      });
      pop.appendChild(item);
    });
    document.body.appendChild(pop);
    const closeHandler=(e)=>{
      if(!pop.contains(e.target)){ pop.remove(); document.removeEventListener('pointerdown', closeHandler, true); }
    };
    setTimeout(()=>document.addEventListener('pointerdown', closeHandler, true), 0);
  }

  list.filter(o=>o.type==='section_slider').forEach(o=>{
    try{
      const el=mk('div','wce-overlay-section-slider');
      el.dataset.overlayId=o.id;
      el.style.left=(o.x??10)+'%'; el.style.top=(o.y??10)+'%'; el.style.width=(o.width||200)+'px';
      el.style.setProperty('--sec-track-color', o.trackColor||'#333333');
      el.style.setProperty('--sec-track-height', (o.trackHeight!=null?o.trackHeight:6)+'px');
      el.style.setProperty('--sec-thumb-color', o.thumbColor||'#c8a96e');
      el.style.setProperty('--sec-thumb-size', (o.thumbSize!=null?o.thumbSize:16)+'px');
      const axes=window._wceSectionAxes||{};
      const axisKeys=['x','y','z'].filter(k=>axes[k]);
      if(axisKeys.length){
        if(o.controlMode==='combined'){
          let currentAxis=axisKeys.find(k=>axes[k].active)||axisKeys[0];
          const radiosDiv=mk('div','wce-sec-radios');
          const radioEls={};
          axisKeys.forEach(k=>{
            const r=mk('span','wce-sec-radio'+(k===currentAxis?' active':''));
            r.textContent=k.toUpperCase();
            if(k===currentAxis) r.style.background=o.activeColor||'#c8a96e';
            radioEls[k]=r;
            radiosDiv.appendChild(r);
          });
          el.appendChild(radiosDiv);
          const row=mk('div','wce-sec-row');
          const lbl = o.showLabels!==false ? mk('span','wce-sec-axislabel') : null;
          if(lbl){ lbl.textContent=currentAxis.toUpperCase(); row.appendChild(lbl); }
          const slider=document.createElement('input');
          slider.type='range'; slider.min='0'; slider.max='100'; slider.step='0.5'; slider.className='wce-sec-native-slider';
          slider.value=axes[currentAxis].position;
          slider.oninput=()=>{
            axes[currentAxis].position=parseFloat(slider.value);
            if(typeof window._wceSectionSetPosition==='function') window._wceSectionSetPosition(currentAxis, axes[currentAxis].position);
          };
          row.appendChild(slider);
          el.appendChild(row);
          axisKeys.forEach(k=>{
            radioEls[k].onclick=()=>{
              currentAxis=k;
              axisKeys.forEach(kk=>{
                const shouldBeActive=(kk===k);
                if(axes[kk].active!==shouldBeActive){
                  axes[kk].active=shouldBeActive;
                  if(typeof window._wceSectionSetActive==='function') window._wceSectionSetActive(kk, shouldBeActive);
                }
                radioEls[kk].classList.toggle('active', kk===currentAxis);
                radioEls[kk].style.background = kk===currentAxis ? (o.activeColor||'#c8a96e') : '';
              });
              slider.value=axes[currentAxis].position;
              if(lbl) lbl.textContent=currentAxis.toUpperCase();
            };
          });
        } else {
          axisKeys.forEach(k=>{
            const ax=axes[k];
            const row=mk('div','wce-sec-row');
            if(o.showLabels!==false){ const lbl=mk('span','wce-sec-axislabel'); lbl.textContent=k.toUpperCase(); row.appendChild(lbl); }
            const btn=mk('button','wce-sec-axisbtn'+(ax.active?' active':''));
            btn.textContent=k.toUpperCase();
            if(ax.active) btn.style.background=o.activeColor||'#c8a96e';
            const slider=document.createElement('input');
            slider.type='range'; slider.min='0'; slider.max='100'; slider.step='0.5'; slider.className='wce-sec-native-slider';
            slider.value=ax.position; slider.disabled=!ax.active;
            btn.onclick=()=>{
              ax.active=!ax.active;
              btn.classList.toggle('active', ax.active);
              btn.style.background = ax.active ? (o.activeColor||'#c8a96e') : '';
              slider.disabled=!ax.active;
              if(typeof window._wceSectionSetActive==='function') window._wceSectionSetActive(k, ax.active);
            };
            slider.oninput=()=>{
              ax.position=parseFloat(slider.value);
              if(typeof window._wceSectionSetPosition==='function') window._wceSectionSetPosition(k, ax.position);
            };
            row.appendChild(btn); row.appendChild(slider);
            el.appendChild(row);
          });
        }
      }
      hostFor(o).appendChild(el);
    }catch(e){ console.error('[WCE] failed to render a section slider:', e); }
  });

list.filter(o=>o.type==='presentation').forEach(o=>{
    const el=mk('button','wce-overlay-action-btn');
    el.dataset.overlayId=o.id;
    el.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span>'+(o.label||'Present')+'</span>';
    el.style.left=o.x+'%'; el.style.top=o.y+'%';
    el.onclick=()=>{ _wcePresentationActive ? _wceExitPresentationMode() : _wceEnterPresentationMode(o, el); };
    _wceWireProfileTrigger(el, o.id);
    hostFor(o).appendChild(el);
  });
list.filter(o=>o.type==='snapshot').forEach(o=>{
    const el=mk('button','wce-overlay-action-btn');
    el.dataset.overlayId=o.id;
    el.dataset.wceActionKind='snapshot';
    el.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span>'+(o.label||'Snapshot')+'</span>';
    el.style.left=o.x+'%'; el.style.top=o.y+'%';
    el.onclick=()=>_wceTakeSnapshot();
    _wceWireProfileTrigger(el, o.id);
    hostFor(o).appendChild(el);
  });

  list.filter(o=>o.type!=='group' && o.type!=='text' && o.type!=='section_slider' && o.type!=='presentation' && o.type!=='snapshot').forEach(o=>{
    if(!o.type && o.container && o.material) o.type='material';
    const el=mk('div','wce-overlay-thumb');
    el.style.left=(o.x??10)+'%';
    el.style.top=(o.y??10)+'%';
    const eff = _wceEffectiveThumbProps(o);
    const sz=eff.size||46;
    el.style.width=sz+'px';el.style.height=sz+'px';

    if(o.type==='toggle'){
      const states=o.states||[];
      const activeIdx=Math.min(o.activeIndex||0, Math.max(0,states.length-1));
      const cur=states[activeIdx]||{};
      const shapeProps=Object.assign({}, eff, {
        kind: cur.image ? 'image' : undefined,
        image: cur.image || undefined,
        color: cur.image ? undefined : (eff.color || '#808080'),
      });
      _wceApplyThumbShape(el, shapeProps);
      el.title = cur.label || o.name || 'Toggle';
      el.onclick=()=>{
        if(o.mode==='dropdown'){
          _wceShowTogglePicker(o, el, states);
        } else if(o.cycleShowMode==='current'){
          // Applies whichever state is CURRENTLY shown (before advancing),
          // so the thumbnail visible at the moment of the click matches
          // what just got applied, rather than already having flipped to
          // preview the next one.
          if(states.length){
            const resolved=_wceResolveToggleState(states[activeIdx]);
            if(resolved) applyOverlay(resolved);
            o.activeIndex = (activeIdx+1) % states.length;
          }
          buildThumbnailOverlays();
        } else {
          if(states.length){
            o.activeIndex = (activeIdx+1) % states.length;
            const resolved=_wceResolveToggleState(states[o.activeIndex]);
            if(resolved) applyOverlay(resolved);
          }
          buildThumbnailOverlays();
        }
      };
    } else {
      _wceApplyThumbShape(el, o);
      el.title = o.label || o.material || o.name || '';
      if(o.type==='deco_image'){
        el.style.cursor='default';
        el.classList.add('wce-overlay-image');
        if(o.link){
          el.classList.add('wce-overlay-linked');
          el.addEventListener('click', ()=>window.open(o.link, '_blank'));
        }
      } else {
        el.onclick=()=>{
          applyOverlay(o);
          qsa('.wce-overlay-thumb').forEach(t=>t.classList.remove('active'));
          el.classList.add('active');
        };
      }
    }
    _wceWireProfileTrigger(el, o.id);
    hostFor(o).appendChild(el);
  });
}
function refreshActive(){
  qsa('.vc').forEach(b=>b.classList.toggle('active',b.dataset.v===activeV));
  qsa('.tb').forEach(b=>b.classList.remove('active'));
  Object.keys(geoSt).forEach(k=>{if(geoSt[k]){const btn=document.querySelector(`.tb[data-col="${k}"]`);if(btn)btn.classList.add('active');}  });
}
const mk=(t,c)=>{const e=document.createElement(t);if(c)e.className=c;return e;};
const qsa=(s)=>[...document.querySelectorAll(s)];

// ── Presentation Mode & Snapshot ─────────────────────────────────────────
function _wceTakeSnapshot(){
  try{
    // comp (EffectComposer) is what the render loop actually calls every
    // frame -- bloom, color grading, DOF, any other post-process pass only
    // ever gets applied through it. Calling renderer.render(scene, cam)
    // directly, as a previous version did, bypasses all of that entirely
    // (a raw, unfiltered copy, confirmed directly against a real project),
    // and exercises a plain rendering path the app otherwise never uses at
    // all, which is almost certainly why the very first snapshot noticeably
    // lagged -- likely forcing fresh shader compilation for a path the
    // composer's own continuous rendering had never needed and so never
    // warmed up. Reusing the exact same call the render loop already makes
    // every frame avoids both problems at once.
    comp.render();
    const url=renderer.domElement.toDataURL('image/png');
    const a=document.createElement('a');
    a.href=url; a.download='snapshot-'+Date.now()+'.png';
    document.body.appendChild(a); a.click(); a.remove();
  }catch(e){ console.error('[WCE] Snapshot failed:', e); }
}
let _wcePresentationActive=false;
let _wcePresentationHiddenEls=[];
let _wcePresentationHiddenMarkers=[];
const _wcePresentationRevealed=new Set();
let _wcePresentationKeyHandler=null;
let _wcePresentationDef=null;
let _wcePresentationTriggerEl=null;
let _wcePresentationTriggerOrigHTML=null;
function _wcePresentationHideSelectors(){
  // Everything a visitor would normally interact with -- the side panel,
  // every artist-placed overlay (including every OTHER Presentation
  // button an artist placed), the Sound/AR chrome buttons. Only the 3D
  // view is left. The specific button that triggered this run is
  // excluded from the sweep separately in _wceEnterPresentationMode below
  // -- not by leaving its class out of this list -- since every other
  // .wce-overlay-action-btn still needs to hide like everything else.
  // Snapshot buttons are ALSO excluded from this same sweep (see the skip
  // check below) -- there's no separate built-in Snapshot control
  // anymore; an artist's OWN placed Snapshot button simply stays visible
  // and usable the whole time presenting, the same way Present's own
  // button does (just without needing to relabel into anything).
  //
  // Hotspot markers, annotation markers, and image triggers are
  // DELIBERATELY not listed here at all -- they're handled by a
  // completely separate mechanism below (_wcePresentationHiddenMarkers),
  // not this generic style.display sweep. All three are driven by their
  // own per-frame tick function (_tickHotspots / _tickImgTriggers), which
  // runs on every single rendered frame and actively re-manages each
  // marker's own display style itself (occlusion, on/off-screen fading,
  // its own 'hidden' flag) -- setting style.display directly here would
  // just get silently overwritten on the very next frame, which is
  // exactly why the reveal hotkeys looked like they were doing nothing at
  // all: the hide was being undone 60 times a second, confirmed directly
  // against a real project.
  return ['#panel','#ptab','#sfx-toggle','#ar-btn','.wce-overlay-thumb','.wce-overlay-text',
          '.wce-overlay-group','.wce-overlay-section-slider','.wce-overlay-action-btn'];
}
function _wceElementCategory(el){
  // Maps a DOM element back to whichever hotkey category it would be
  // addressed by, so the hide sweep can check "does THIS specific thing
  // already have a hotkey assigned" -- needed for starting hotkey-
  // assigned categories visible (ON) instead of hidden, since knowing
  // that requires knowing which category each individual element IS,
  // not just which selector matched it.
  if(el.id==='panel' || el.id==='ptab') return 'chrome:panel';
  if(el.id==='sfx-toggle') return 'chrome:sound';
  if(el.id==='ar-btn') return 'chrome:ar';
  if(el.dataset.overlayId) return 'overlay:'+el.dataset.overlayId;
  return null;
}
function _wcePresentationCategorySelector(cat){
  // Bulk categories are addressed as a whole (chrome pieces) -- individual
  // overlays are addressed by the same data-overlay-id every overlay
  // element already carries, so this never needs its own separate id
  // scheme. Hotspots/annotations/image triggers are NOT resolved to a
  // selector at all -- see _wceToggleMarkerCategory, which handles them
  // through each marker's own 'hidden' flag instead of a CSS selector,
  // for the reason explained in _wcePresentationHideSelectors above.
  if(cat==='chrome:panel') return '#panel,#ptab';
  if(cat==='chrome:sound') return '#sfx-toggle';
  if(cat==='chrome:ar') return '#ar-btn';
  if(cat.indexOf('overlay:')===0) return '[data-overlay-id="'+cat.slice(8)+'"]';
  return null;
}
function _wceHideMarkerCategory(kind, hasHotkey, arr, filterFn){
  // hs.hidden / it.hidden is the SAME flag other, completely separate
  // logic already uses for its own conditional visibility (e.g. an
  // annotation linked to a material/geo subset that isn't currently
  // active) -- recording each marker's CURRENT value before forcing it
  // to true, rather than assuming it started false, means exiting
  // presentation mode can restore exactly what that other logic already
  // wanted, instead of incorrectly revealing something it meant to keep
  // hidden. kind is tracked explicitly rather than inferred from a
  // property like isAnnotation, since image trigger objects don't carry
  // that field at all (undefined would otherwise read as false, wrongly
  // grouping them in with plain hotspots).
  //
  // hasHotkey: still records every entry either way (needed for exit to
  // restore correctly regardless), but only actually forces hidden=true
  // when this category has NO assigned hotkey. A category with one
  // starts exactly as it already was (usually visible) instead of forced
  // hidden, and gets marked already-revealed below so the very first
  // press of its hotkey correctly turns it OFF, not silently does nothing.
  (arr||[]).forEach(function(item){
    if(!filterFn(item)) return;
    _wcePresentationHiddenMarkers.push({item:item, orig:item.hidden, kind:kind});
    if(!hasHotkey) item.hidden = true;
  });
}
function _wceToggleMarkerCategory(kind, reveal){
  _wcePresentationHiddenMarkers.forEach(function(entry){
    if(entry.kind !== kind) return;
    // Revealing always shows it regardless of what it was hidden for (the
    // artist explicitly asked to see it right now); re-hiding always goes
    // back to fully hidden, matching everything else's default during
    // presentation -- only actually exiting presentation mode restores
    // each marker's own original reason for being hidden or not.
    entry.item.hidden = !reveal;
  });
}
function _wceEnterPresentationMode(def, triggerEl){
  if(_wcePresentationActive) return;
  _wcePresentationActive=true;
  _wcePresentationDef=def||{};
  _wcePresentationHiddenEls=[];
  _wcePresentationHiddenMarkers=[];
  _wcePresentationRevealed.clear();
  _wcePresentationTriggerEl=triggerEl||null;
  _wcePresentationTriggerOrigHTML=null;
  // Every category that has at least one hotkey assigned to it starts
  // visible (ON) instead of hidden -- the hotkey itself is what turns it
  // OFF (and back on again), rather than only ever being a way to peek at
  // something that starts hidden. Categories with no hotkey at all keep
  // the original all-hidden-by-default behavior, since there'd be no way
  // to ever bring them back otherwise.
  const hotkeyCats = new Set((_wcePresentationDef.hotkeys||[]).map(function(h){ return h.category; }));
  _wcePresentationHideSelectors().forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){
      // Never hide a Snapshot button -- there's no separate built-in one
      // anymore, an artist's OWN placed Snapshot button just stays usable
      // the whole time presenting -- nor the specific button that
      // triggered this (handled below, possibly relabeled into Close
      // rather than left alone).
      if(el.dataset.wceActionKind==='snapshot') return;
      if(el===_wcePresentationTriggerEl) return;
      _wcePresentationHiddenEls.push({el:el, prevDisplay:el.style.display});
      const cat = _wceElementCategory(el);
      if(cat && hotkeyCats.has(cat)){
        _wcePresentationRevealed.add(cat);
        return;
      }
      el.style.display='none';
    });
  });
  _wceHideMarkerCategory('hotspot', hotkeyCats.has('bulk:hotspots'), window.hotspots, function(hs){ return !hs.isAnnotation; });
  _wceHideMarkerCategory('annotation', hotkeyCats.has('bulk:annotations'), window.hotspots, function(hs){ return !!hs.isAnnotation; });
  _wceHideMarkerCategory('imagetrigger', hotkeyCats.has('bulk:imagetriggers'), window._imgTriggers, function(){ return true; });
  if(hotkeyCats.has('bulk:hotspots')) _wcePresentationRevealed.add('bulk:hotspots');
  if(hotkeyCats.has('bulk:annotations')) _wcePresentationRevealed.add('bulk:annotations');
  if(hotkeyCats.has('bulk:imagetriggers')) _wcePresentationRevealed.add('bulk:imagetriggers');
  if(_wcePresentationTriggerEl){
    if(_wcePresentationDef.showCloseButton===false){
      // Artist opted out of a visible way out -- hide the trigger button
      // itself too, exactly like everything else. Escape still always
      // works regardless of this setting.
      _wcePresentationHiddenEls.push({el:_wcePresentationTriggerEl, prevDisplay:_wcePresentationTriggerEl.style.display});
      _wcePresentationTriggerEl.style.display='none';
    } else {
      // The SAME button the artist placed becomes Close, rather than a
      // separate built-in Close button appearing alongside it -- restored
      // back to its original Present label/icon on exit, below.
      _wcePresentationTriggerOrigHTML=_wcePresentationTriggerEl.innerHTML;
      _wcePresentationTriggerEl.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg><span>Close</span>';
      _wcePresentationTriggerEl.classList.add('wce-presentation-active');
    }
  }
  const rootEl=document.documentElement;
  const req=rootEl.requestFullscreen||rootEl.webkitRequestFullscreen||rootEl.mozRequestFullScreen;
  if(req){ try{ req.call(rootEl).catch(function(){}); }catch(e){} }
  // Reveal hotkeys are only ever heard by whichever document currently
  // has keyboard focus -- when this whole thing is running inside the
  // Designer's own preview iframe (as opposed to the real, standalone
  // page, where there's no separate focus target to lose in the first
  // place), focus could still be sitting on the Designer's own outer
  // page (its sidebar, an input, etc.) at the moment Present gets
  // clicked, in which case the very next keypress would never reach this
  // listener at all. Explicitly taking focus here guarantees it lands in
  // the right place regardless of whatever had it a moment before.
  try{ window.focus(); }catch(e){}
  _wcePresentationKeyHandler=function(ev){
    const hotkeys=_wcePresentationDef.hotkeys||[];
    // One key can be assigned to several different targets at once (see
    // the duplicate check in the Designer's own Add Hotkey handler, which
    // only blocks the exact same key+target pair twice, not a key being
    // reused across DIFFERENT targets) -- so this triggers every matching
    // entry, not just the first one found, otherwise a key configured for
    // two things would only ever toggle one of them.
    const matches=hotkeys.filter(function(h){ return h.key===ev.code; });
    matches.forEach(function(h){ _wceTogglePresentationReveal(h.category); });
  };
  document.addEventListener('keydown', _wcePresentationKeyHandler);
}
function _wceTogglePresentationReveal(cat){
  const isRevealed=_wcePresentationRevealed.has(cat);
  if(cat==='bulk:hotspots'){
    _wceToggleMarkerCategory('hotspot', !isRevealed);
  } else if(cat==='bulk:annotations'){
    _wceToggleMarkerCategory('annotation', !isRevealed);
  } else if(cat==='bulk:imagetriggers'){
    _wceToggleMarkerCategory('imagetrigger', !isRevealed);
  } else {
    const sel=_wcePresentationCategorySelector(cat);
    if(!sel) return;
    document.querySelectorAll(sel).forEach(function(el){
      // Only ever touches elements presentation mode itself recorded -- an
      // element that was already hidden for some other reason (Removed via
      // the theme, a currently-empty tab, etc.) is left alone either way.
      const entry=_wcePresentationHiddenEls.find(function(h){ return h.el===el; });
      if(!entry) return;
      el.style.display = isRevealed ? 'none' : (entry.prevDisplay||'');
    });
  }
  if(isRevealed) _wcePresentationRevealed.delete(cat); else _wcePresentationRevealed.add(cat);
}
function _wceExitPresentationMode(){
  if(!_wcePresentationActive) return;
  _wcePresentationActive=false;
  _wcePresentationHiddenEls.forEach(function(entry){ entry.el.style.display=entry.prevDisplay; });
  _wcePresentationHiddenEls=[];
  _wcePresentationHiddenMarkers.forEach(function(entry){ entry.item.hidden=entry.orig; });
  _wcePresentationHiddenMarkers=[];
  _wcePresentationRevealed.clear();
  if(_wcePresentationTriggerEl && _wcePresentationTriggerOrigHTML!==null){
    _wcePresentationTriggerEl.innerHTML=_wcePresentationTriggerOrigHTML;
    _wcePresentationTriggerEl.classList.remove('wce-presentation-active');
  }
  _wcePresentationTriggerEl=null;
  _wcePresentationTriggerOrigHTML=null;
  if(_wcePresentationKeyHandler){ document.removeEventListener('keydown', _wcePresentationKeyHandler); _wcePresentationKeyHandler=null; }
  if(document.fullscreenElement && document.exitFullscreen){ try{ document.exitFullscreen().catch(function(){}); }catch(e){} }
}
// Escape (or any other way fullscreen ends) fires this natively -- a
// single shared exit path for every way presentation mode can end, rather
// than separately wiring Escape and the Close button to do the same thing.
document.addEventListener('fullscreenchange', function(){
  if(!document.fullscreenElement && _wcePresentationActive) _wceExitPresentationMode();
});
