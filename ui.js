// ui.js — WEB_CONFIGURATOR UI layer
// Edit this file to customise the web UI after export.
// Globals are exposed by the main module via window before buildUI() is called.

// ===== WCEG — shared Group-Frame / Shape helpers ==========================
// This exact block is injected into BOTH the UI Designer page and the exported
// site's ui.js (see _WCE_GROUP_COMMON_JS in core.py), so the two can never drift
// apart. Everything here is DOM-only: it takes elements/objects as arguments and
// uses el.ownerDocument, so it works for the Designer's iframe document and the
// real page alike.
const WCEG = (function(){
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Scroll offset per group id — survives the full re-renders both the Designer
  // and the exported page do (they rebuild every overlay element on each change).
  // Kept on the window that OWNS the element (the preview iframe, when in the
  // Designer) so the Designer's copy of this module and the page's own copy of it
  // always read and write the very same offsets.
  function st(el){
    const w = el.ownerDocument.defaultView;
    return w.__wcegScroll || (w.__wcegScroll = {});
  }

  const CSS = [
    // Content layer every child of a group / shape is placed in. Children keep
    // being positioned in % of it, exactly as they were in % of the old body.
    '.wce-group-content{position:absolute;left:0;top:0;right:0;bottom:0}',
    '.wce-shape-fill,.wce-shape-content{position:absolute;left:0;top:0;right:0;bottom:0}',
    '.wce-shape-fill{pointer-events:none}',
    '.wce-shape-fill svg{position:absolute;left:0;top:0;display:block}',
    // A shape is decoration + container: it never blocks the 3D view itself,
    // only the things placed inside it stay interactive.
    '.wce-overlay-shape{position:fixed;z-index:4;pointer-events:none}',
    '.wce-shape-content .wce-overlay-thumb,.wce-shape-content .wce-overlay-action-btn,.wce-shape-content .wce-overlay-group,',
    '.wce-shape-content .wce-overlay-section-slider,.wce-shape-content .wce-overlay-linked,',
    '.wce-group-content .wce-overlay-linked{pointer-events:auto}',
    // Anything sitting inside a container is positioned relative to it (before,
    // sliders / action buttons stayed position:fixed even inside a group).
    '.wce-group-content>.wce-overlay-thumb,.wce-group-content>.wce-overlay-text,.wce-group-content>.wce-overlay-shape,',
    '.wce-group-content>.wce-overlay-section-slider,.wce-group-content>.wce-overlay-action-btn,',
    '.wce-shape-content>.wce-overlay-thumb,.wce-shape-content>.wce-overlay-text,.wce-shape-content>.wce-overlay-shape,',
    '.wce-shape-content>.wce-overlay-section-slider,.wce-shape-content>.wce-overlay-action-btn{position:absolute}',
    // A group frame can sit inside another group frame or a shape: positioned inside it, and (inside a shape,
    // which is click-through) still interactive.
    '.wce-group-content>.wce-overlay-group,.wce-shape-content>.wce-overlay-group{position:absolute}',
    // A group can be as wide as the screen, but never wider than a smaller one.
    '.wce-overlay-group{max-width:calc(100vw / var(--wce-s, 1))}',
    '.wce-group-scroller{position:absolute;z-index:8;box-sizing:border-box;touch-action:none;cursor:pointer}',
    '.wce-group-scroller-thumb{position:absolute;left:0;right:0;top:0;box-sizing:border-box;cursor:grab}'
  ].join('\n');

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  // On-screen size / layout size of an element = the scale it is drawn at. It is 1 in the Designer and
  // whenever the UI is unscaled; on the exported site it is WCEUIS's s. Pointer deltas (screen px) must be
  // divided by it before they are used as CSS px.
  function localScale(el){
    try{
      const r = el.getBoundingClientRect();
      const k = el.offsetHeight ? r.height / el.offsetHeight : (el.offsetWidth ? r.width / el.offsetWidth : 1);
      return k > 0.01 ? k : 1;
    }catch(e){ return 1; }
  }
  function num(v, dflt){ return (v!==undefined && v!==null && v!=='' && !isNaN(v)) ? +v : dflt; }

  function rgba(hex, a){
    const h = String(hex||'#808080').replace('#','');
    let r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
    if(isNaN(r)) r = 128;
    if(isNaN(g)) g = 128;
    if(isNaN(b)) b = 128;
    return 'rgba('+r+','+g+','+b+','+a+')';
  }
  function isHoriz(dir){ return dir==='horizontal' || dir==='reverse-horizontal'; }

  // ---------- Group frame: structure ----------
  function groupInnerHTML(g){
    return '<div class="wce-group-header"><span class="wce-group-arrow">'+(g.collapsed?'\u25b8':'\u25be')+'</span>'+
      '<span class="wce-group-label">'+(g.label||'Group')+'</span></div>'+
      '<div class="wce-group-body"><div class="wce-group-content"></div></div>';
  }
  // The element every child of the group is appended to and positioned against.
  function groupHost(el){
    return el.querySelector('.wce-group-content') || el.querySelector('.wce-group-body');
  }

  // Header title alignment. Stored as start / center / end so that "start" always
  // means "the side the arrow is on". In a horizontal-collapse group the header is a
  // rotated vertical strip (writing-mode + rotate(180deg)), so start = visual BOTTOM
  // and end = visual TOP there; in vertical groups start = left, end = right.
  function headerTextAlign(align, dir){
    if(align==='center') return 'center';
    if(isHoriz(dir)) return align==='end' ? 'end' : 'start';
    return align==='end' ? 'right' : 'left';
  }

  // ---------- Group frame: arrow, title alignment, container, scroller ----------
  function groupExtras(el, g){
    el.__wcegG = g;
    // The outer container used to carry its own dark background + border in CSS, which
    // stayed visible underneath the tab/shelf and made "transparent" impossible.
    // Tab and shelf paint their own backgrounds, so the container itself stays neutral.
    el.style.background = 'none';
    el.style.border = 'none';
    const arrow = el.querySelector('.wce-group-arrow');
    const label = el.querySelector('.wce-group-label');
    if(arrow){
      arrow.style.color = g.arrowColor || '';               // '' -> CSS default (accent)
      arrow.style.fontSize = num(g.arrowSize, 9)+'px';
    }
    if(label){
      label.style.flex = '1 1 auto';
      label.style.minWidth = '0';
      label.style.textAlign = headerTextAlign(g.headerAlign, g.direction||'vertical');
    }
    layoutScroller(el, g);
  }

  function scrollOn(g){ return !!(g && g.scrollEnabled); }
  function scrollLenOf(g){ return num(g.scrollLength, 600); }

  function metrics(el, g){
    const content = el.querySelector('.wce-group-content');
    const viewH = content ? content.clientHeight : 0;
    const total = Math.max(scrollLenOf(g), viewH);
    return {viewH: viewH, total: total, max: Math.max(0, total - viewH)};
  }
  // Highest y (in % of the shelf) an element may be dragged to inside a group.
  function yMaxPct(g, viewH){
    if(!scrollOn(g) || !viewH) return 96;
    return Math.max(96, (Math.max(scrollLenOf(g), viewH) / viewH) * 100 - 4);
  }

  function layoutScroller(el, g){
    const body = el.querySelector('.wce-group-body');
    const content = el.querySelector('.wce-group-content');
    if(!body || !content) return;
    let bar = body.querySelector(':scope > .wce-group-scroller');
    if(!scrollOn(g)){
      if(bar) bar.remove();
      content.style.left = '0'; content.style.right = '0'; content.style.transform = '';
      body.style.touchAction = '';
      delete st(el)[g.id];
      return;
    }
    const doc = el.ownerDocument;
    const side = g.scrollSide==='left' ? 'left' : 'right';
    const thick = clamp(num(g.scrollWidth, 10), 2, 60);
    const gut = thick + 6;                                    // gutter reserved beside the content
    content.style.left = side==='left' ? gut+'px' : '0';
    content.style.right = side==='right' ? gut+'px' : '0';
    body.style.touchAction = 'none';
    let thumb;
    if(!bar){
      bar = doc.createElement('div'); bar.className = 'wce-group-scroller';
      thumb = doc.createElement('div'); thumb.className = 'wce-group-scroller-thumb';
      bar.appendChild(thumb); body.appendChild(bar);
      wireScroller(el, bar, thumb);
    } else {
      thumb = bar.querySelector('.wce-group-scroller-thumb');
    }
    const len = clamp(num(g.scrollTrackLength, 100), 10, 100);
    const bw = clamp(num(g.scrollBorderWidth, 0), 0, 8);
    const rad = clamp(num(g.scrollRadius, 4), 0, 30);
    bar.style.width = thick+'px';
    bar.style.top = ((100-len)/2)+'%';
    bar.style.height = len+'%';
    bar.style.left = side==='left' ? '3px' : 'auto';
    bar.style.right = side==='right' ? '3px' : 'auto';
    bar.style.background = rgba(g.scrollBg || '#000000', num(g.scrollBgOpacity, 40)/100);
    bar.style.border = bw>0 ? (bw+'px solid '+(g.scrollBorderColor || '#444444')) : 'none';
    bar.style.borderRadius = rad+'px';
    thumb.style.background = rgba(g.scrollThumbColor || '#c8a96e', num(g.scrollThumbOpacity, 100)/100);
    thumb.style.borderRadius = Math.max(0, rad - bw)+'px';
    updateScroller(el);
  }

  // Re-measures and repositions (viewport height changes with collapse / resize).
  function updateScroller(el){
    const g = el.__wcegG;
    if(!g) return;
    const content = el.querySelector('.wce-group-content');
    if(!content) return;
    if(!scrollOn(g)){ content.style.transform = ''; return; }
    const m = metrics(el, g);
    if(m.viewH <= 0) return;                                   // collapsed / not laid out yet
    const t = clamp(st(el)[g.id] || 0, 0, m.max);
    st(el)[g.id] = t;
    content.style.transform = t ? 'translateY('+(-t)+'px)' : '';
    const bar = el.querySelector('.wce-group-scroller');
    const thumb = bar && bar.querySelector('.wce-group-scroller-thumb');
    if(!bar || !thumb) return;
    const trackH = bar.clientHeight;
    const ratio = m.total > 0 ? Math.min(1, m.viewH / m.total) : 1;
    const thumbH = Math.max(Math.min(24, trackH), trackH * ratio);
    thumb.style.height = thumbH+'px';
    thumb.style.top = (m.max > 0 ? (trackH - thumbH) * (t / m.max) : 0)+'px';
  }
  // Collapse animates the shelf height, so measure now AND once it has settled.
  function scheduleRefresh(el){
    if(!el.__wcegG) return;
    updateScroller(el);
    if(!scrollOn(el.__wcegG)) return;                          // nothing to re-measure later
    const w = el.ownerDocument.defaultView;
    if(!w) return;
    w.requestAnimationFrame(function(){ updateScroller(el); });
    w.setTimeout(function(){ updateScroller(el); }, 330);
  }
  function setScroll(el, top){
    const g = el.__wcegG;
    if(!scrollOn(g)) return;
    st(el)[g.id] = top;
    updateScroller(el);
  }

  function wireScroller(el, bar, thumb){
    const body = el.querySelector('.wce-group-body');
    thumb.addEventListener('pointerdown', function(ev){
      ev.stopPropagation(); ev.preventDefault();
      const g = el.__wcegG; if(!g) return;
      const m = metrics(el, g); if(m.max <= 0) return;
      const startY = ev.clientY, startTop = st(el)[g.id] || 0, k = localScale(bar);
      const span = Math.max(1, bar.clientHeight - thumb.offsetHeight);
      try{ thumb.setPointerCapture(ev.pointerId); }catch(e){}
      function move(e){ setScroll(el, startTop + ((e.clientY - startY) / k) * (m.max / span)); }
      function up(e){
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', up);
        thumb.removeEventListener('pointercancel', up);
        try{ thumb.releasePointerCapture(e.pointerId); }catch(_){}
      }
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
      thumb.addEventListener('pointercancel', up);
    });
    // Clicking the empty track jumps the thumb there.
    bar.addEventListener('pointerdown', function(ev){
      if(ev.target === thumb) return;
      ev.stopPropagation(); ev.preventDefault();
      const g = el.__wcegG; if(!g) return;
      const m = metrics(el, g); if(m.max <= 0) return;
      const r = bar.getBoundingClientRect();
      const span = bar.clientHeight - thumb.offsetHeight;
      const py = ((ev.clientY - r.top) / localScale(bar) - bar.clientTop) - thumb.offsetHeight / 2;
      setScroll(el, (span > 0 ? clamp(py / span, 0, 1) : 0) * m.max);
    });
    if(body.__wcegWired) return;
    body.__wcegWired = true;
    // Mouse wheel anywhere over the shelf.
    body.addEventListener('wheel', function(ev){
      const g = el.__wcegG; if(!scrollOn(g)) return;
      const m = metrics(el, g); if(m.max <= 0) return;
      ev.preventDefault(); ev.stopPropagation();
      setScroll(el, (st(el)[g.id] || 0) + (ev.deltaMode===1 ? ev.deltaY*16 : ev.deltaY));
    }, {passive:false});
    // Touch drag on the shelf; a drag that scrolled must not also count as a tap.
    let ty = 0, t0 = 0, moved = false;
    body.addEventListener('touchstart', function(ev){
      const g = el.__wcegG; if(!scrollOn(g) || !ev.touches.length) return;
      ty = ev.touches[0].clientY; t0 = st(el)[g.id] || 0; moved = false;
    }, {passive:true});
    body.addEventListener('touchmove', function(ev){
      const g = el.__wcegG; if(!scrollOn(g) || !ev.touches.length) return;
      const dy = (ty - ev.touches[0].clientY) / localScale(body);
      if(Math.abs(dy) > 6) moved = true;
      if(moved){ ev.preventDefault(); setScroll(el, t0 + dy); }
    }, {passive:false});
    body.addEventListener('touchend', function(){
      if(!moved) return;
      moved = false;
      const swallow = function(e){ e.stopPropagation(); e.preventDefault(); };
      body.addEventListener('click', swallow, true);
      el.ownerDocument.defaultView.setTimeout(function(){ body.removeEventListener('click', swallow, true); }, 350);
    }, {passive:true});
  }

  // ---------- Shapes: decoration that is also a container ----------
  const SHAPE_VERTS = {
    hexagon:  [[25,0],[75,0],[100,50],[75,100],[25,100],[0,50]],
    pentagon: [[50,0],[100,38],[82,100],[18,100],[0,38]],
    octagon:  [[30,0],[70,0],[100,30],[100,70],[70,100],[30,100],[0,70],[0,30]],
    diamond:  [[50,0],[100,50],[50,100],[0,50]]
  };
  // Arrow and triangle are defined pointing RIGHT. An orientation maps the vertices (not a rotation), so the shape always
  // spans its whole box: h = right, v = down, rh = left, rv = up. A new triangle points up, a new arrow points right.
  SHAPE_VERTS.triangle = [[0,0],[100,50],[0,100]];
  SHAPE_VERTS.arrow = [[0,30],[58,30],[58,0],[100,50],[58,100],[58,70],[0,70]];
  function shapeVerts(shape, orient){
    const v = SHAPE_VERTS[shape];
    if(!v || (shape !== 'arrow' && shape !== 'triangle')) return v;
    const o = orient || (shape === 'triangle' ? 'rv' : 'h');
    if(o === 'h') return v;
    return v.map(function(p){ const x = p[0], y = p[1]; return o === 'rh' ? [100 - x, y] : (o === 'v' ? [y, x] : [y, 100 - x]); });
  }
  // Rounded polygon path for a w x h box (vertices are % of each axis).
  function polyPath(w, h, vp, radius){
    const pts = vp.map(function(p){ return [p[0]/100*w, p[1]/100*h]; });
    const n = pts.length;
    function dist(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
    function norm(v){ const l = Math.hypot(v[0], v[1]) || 1; return [v[0]/l, v[1]/l]; }
    let d = '';
    for(let i=0;i<n;i++){
      const prev = pts[(i-1+n)%n], curr = pts[i], next = pts[(i+1)%n];
      const v1 = norm([curr[0]-prev[0], curr[1]-prev[1]]), v2 = norm([next[0]-curr[0], next[1]-curr[1]]);
      const len1 = dist(prev,curr), len2 = dist(curr,next);
      const r = Math.max(0, Math.min(radius, len1/2, len2/2));
      const p1 = [curr[0]-v1[0]*r, curr[1]-v1[1]*r], p2 = [curr[0]+v2[0]*r, curr[1]+v2[1]*r];
      d += (i===0?'M ':'L ')+p1[0].toFixed(2)+' '+p1[1].toFixed(2)+' ';
      d += 'Q '+curr[0].toFixed(2)+' '+curr[1].toFixed(2)+' '+p2[0].toFixed(2)+' '+p2[1].toFixed(2)+' ';
    }
    return d + 'Z';
  }

  // ---------- Images: ONE crop model for thumbnails, image frames, toggle-state images and shapes ----------
  // rec = {image, imageAspect (natural width / height), imageFit ('fill' = cover, 'fit' = contain),
  //        imageScale (% of that baseline size; 100 = exactly as filled / fitted),
  //        imageX / imageY (0-100: where the image sits inside the frame -- 0 puts its left / top edge on the
  //        frame's left / top edge, 100 its right / bottom edge on the right / bottom edge)}.
  // The WHOLE picture is always kept; the frame only shows the part selected by scale + position, so a crop
  // can be adjusted any time. Fit / Fill only change the baseline size, Scale multiplies it.
  const _aspects = {}, _waiters = {};
  function aspectKey(u){ return u.length + ':' + u.slice(0, 40) + u.slice(-40); }
  function knownAspect(rec){ return rec.imageAspect > 0 ? rec.imageAspect : (_aspects[aspectKey(rec.image)] || 0); }
  function measureImage(url, doc, done){
    const key = aspectKey(url);
    if(_aspects[key]){ done(_aspects[key]); return; }
    if(_waiters[key]){ _waiters[key].push(done); return; }
    _waiters[key] = [done];
    const img = new (doc.defaultView.Image)();
    function fin(a){ _aspects[key] = a; const w = _waiters[key] || []; delete _waiters[key]; w.forEach(function(f){ try{ f(a); }catch(e){} }); }
    img.onload = function(){ fin(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1); };
    img.onerror = function(){ fin(1); };
    img.src = url;
  }
  // Size + position of the whole picture inside a W x H frame, in px (null while its shape is still unknown).
  function imgGeom(rec, W, H){
    const a = knownAspect(rec);
    if(!(a > 0) || !(W > 0) || !(H > 0)) return null;
    let iw = rec.imageFit === 'fit' ? Math.min(W, H * a) : Math.max(W, H * a);
    iw *= clamp(num(rec.imageScale, 100), 5, 800) / 100;
    const ih = iw / a;
    const X = clamp(num(rec.imageX, 50), 0, 100), Y = clamp(num(rec.imageY, 50), 0, 100);
    return {iw: iw, ih: ih, left: (W - iw) * X / 100, top: (H - ih) * Y / 100, a: a};
  }
  // (Re)paints the image layer inside `host`. The host must be positioned and clip its own overflow
  // (border-radius / clip-path / overflow:hidden); W x H is the layer's box in px.
  function paintImage(host, rec, W, H, opacity){
    const doc = host.ownerDocument;
    let layer = host.querySelector(':scope > .wce-img-layer');
    if(!layer){ layer = doc.createElement('div'); layer.className = 'wce-img-layer'; host.insertBefore(layer, host.firstChild); }
    layer.style.position = 'absolute'; layer.style.left = '0px'; layer.style.top = '0px';
    layer.style.width = W + 'px'; layer.style.height = H + 'px';
    layer.style.pointerEvents = 'none'; layer.style.backgroundRepeat = 'no-repeat';
    layer.style.backgroundImage = 'url("' + String(rec.image).replace(/"/g, '%22') + '")';
    layer.style.opacity = (opacity != null && opacity < 1) ? String(opacity) : '';
    const g = imgGeom(rec, W, H);
    if(g){
      layer.style.backgroundSize = g.iw + 'px ' + g.ih + 'px';
      layer.style.backgroundPosition = g.left + 'px ' + g.top + 'px';
    } else {
      // Picture shape not known yet (saved by an older build): keyword baseline now, exact once it has loaded.
      layer.style.backgroundSize = rec.imageFit === 'fit' ? 'contain' : 'cover';
      layer.style.backgroundPosition = num(rec.imageX, 50) + '% ' + num(rec.imageY, 50) + '%';
      measureImage(rec.image, doc, function(){ if(host.isConnected) paintImage(host, rec, W, H, opacity); });
    }
    return layer;
  }
  // Frame size of a thumbnail-style element. Image frames may be any width x height; everything else is square.
  function thumbDims(o){
    const size = num(o.size, 46);
    const frame = true;                       // any thumbnail may now be non-square (an explicit width / height wins)
    return {w: frame && o.width > 0 ? o.width : size, h: frame && o.height > 0 ? o.height : size};
  }
  // Where the image layer sits inside such an element (inside its border) and how big it is.
  function thumbImageBox(o){
    const d = thumbDims(o), bw = (o.shape === 'none') ? 0 : (o.borderWidth != null ? o.borderWidth : 2);
    return {ox: bw, oy: bw, W: Math.max(1, d.w - 2 * bw), H: Math.max(1, d.h - 2 * bw)};
  }
  function shapeImageBox(s){
    const w = Math.max(1, num(s.width, 160)), h = Math.max(1, num(s.height, 120)), bw = clamp(num(s.borderWidth, 2), 0, 40);
    return {ox: bw, oy: bw, W: Math.max(1, w - 2 * bw), H: Math.max(1, h - 2 * bw)};
  }
  // Paints a thumbnail / toggle / image frame (shape, border, colour or image). Used by BOTH the Designer and
  // the exported page, so what you crop and shape in the Designer is exactly what visitors get.
  // A drop shadow from ONE strength value (0 = none): the offset grows with the blur, the tint stays black. Strength 12 is the
  // shadow every thumbnail already had, so existing projects look exactly the same.
  function shadowCss(on, strength){
    const s = strength == null ? 12 : strength;
    if(!on || !(s > 0)) return 'none';
    return '0 ' + Math.round(s / 6) + 'px ' + s + 'px rgba(0,0,0,.45)';
  }
  function shadowFilter(on, strength){
    const s = strength == null ? 12 : strength;
    if(!on || !(s > 0)) return '';
    return 'drop-shadow(0 ' + Math.round(s / 6) + 'px ' + Math.round(s / 2) + 'px rgba(0,0,0,.45))';
  }
  function borderRgba(color, opacity){
    const c = color || '#ffffff';
    return (opacity != null && opacity < 100) ? rgba(c, opacity / 100) : c;
  }
  function paintThumb(el, o){
    const doc = el.ownerDocument;
    el.removeAttribute('data-wce-poly'); el.style.removeProperty('--wce-shadow-filter');
    el.style.opacity = (o.opacity != null ? o.opacity : 100) / 100;
    // Explicit either way (not just when off) since this always needs to win
    // over the .wce-overlay-thumb class's own box-shadow rule regardless of
    // which way the toggle is set.
    // A custom property, not a direct inline box-shadow -- setting the
    // shadow inline unconditionally would always beat the .active CSS
    // rule's own box-shadow (inline always wins over a class rule,
    // regardless of specificity), which is exactly what was silently
    // blocking the active-state glow from ever appearing on any thumbnail.
    // Routing both through custom properties lets the .active rule (see
    // its own comment) layer the ring glow ON TOP of this drop shadow
    // instead of one unconditionally overwriting the other.
    el.style.setProperty('--wce-thumb-shadow', shadowCss(o.shadow !== false, o.shadowStrength));
    const shape = o.shape || 'circle';
    const d = thumbDims(o), w = d.w, h = d.h;
    const bw = o.borderWidth != null ? o.borderWidth : 2;
    const borderColor = borderRgba(o.borderColor, o.borderOpacity);
    const radius = o.radius || 0;
    const hasImg = o.kind === 'image' && o.image;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.overflow = 'hidden';
    if(shape === 'none'){
      // No shape at all: just the picture (or colour), no border / clip, so a transparent PNG shows through.
      el.style.clipPath = 'none'; el.style.borderRadius = '0px'; el.style.border = 'none';
      if(hasImg){ el.style.background = 'transparent'; paintImage(el, o, w, h); }
      else el.style.background = o.color || '#808080';
      return;
    }
    const vp = shapeVerts(shape, o.orient);
    if(vp){
      // Polygons: CSS borders ignore clip-path, so the border is faked with a border-coloured outer clip and
      // an inset inner clip for the fill.
      // the element itself is NOT clipped (a clip would cut off its own glow / ring / shadow): the outline lives on an inner layer
      el.setAttribute('data-wce-poly', '1');
      el.style.clipPath = 'none'; el.style.borderRadius = '0px'; el.style.border = 'none'; el.style.background = 'transparent';
      el.style.setProperty('--wce-shadow-filter', shadowFilter(o.shadow !== false, o.shadowStrength));
      const outer = doc.createElement('div');
      outer.className = 'wce-poly-outer';
      outer.style.cssText = 'position:absolute;left:0;top:0;width:' + w + 'px;height:' + h + 'px;';
      outer.style.clipPath = 'path("' + polyPath(w, h, vp, radius) + '")';
      outer.style.background = bw > 0 ? borderColor : 'transparent';
      el.appendChild(outer);
      const iw = Math.max(1, w - 2 * bw), ih = Math.max(1, h - 2 * bw);
      const inner = doc.createElement('div');
      inner.style.cssText = 'position:absolute;left:' + bw + 'px;top:' + bw + 'px;width:' + iw + 'px;height:' + ih + 'px;';
      inner.style.clipPath = 'path("' + polyPath(iw, ih, vp, Math.max(0, radius - bw)) + '")';
      if(hasImg) paintImage(inner, o, iw, ih); else inner.style.background = o.color || '#808080';
      el.appendChild(inner);
    } else {
      // Circle / rounded rectangle: plain border-radius + a real CSS border.
      el.style.clipPath = 'none';
      el.style.borderRadius = shape === 'circle' ? '50%' : radius + 'px';
      el.style.borderWidth = bw + 'px'; el.style.borderStyle = bw > 0 ? 'solid' : 'none'; el.style.borderColor = borderColor;
      if(hasImg){ el.style.background = 'transparent'; paintImage(el, o, Math.max(1, w - 2 * bw), Math.max(1, h - 2 * bw)); }
      else el.style.background = o.color || '#808080';
    }
  }

  // (Re)paints a shape element: a visual layer (fill + border, fill opacity separate
  // from element opacity so children stay solid) and a content layer that hosts the
  // children and clips them to the shape's outline.
  function paintShape(el, s){
    const doc = el.ownerDocument;
    const w = Math.max(1, num(s.width, 160)), h = Math.max(1, num(s.height, 120));
    const shape = s.shape || 'square';
    const bw = clamp(num(s.borderWidth, 2), 0, 40);
    const bc = borderRgba(s.borderColor, s.borderOpacity);
    const fa = clamp(num(s.fillOpacity, 100), 0, 100) / 100;
    const radius = Math.max(0, num(s.radius, 12));
    const hasImg = s.kind === 'image' && !!s.image;
    el.style.width = w+'px'; el.style.height = h+'px';
    el.style.opacity = clamp(num(s.opacity, 100), 0, 100) / 100;
    el.setAttribute('data-wce-sil', '1');
    el.style.setProperty('--wce-shadow-filter', shadowFilter(s.shadow === true, s.shadowStrength));
    while(el.firstChild) el.removeChild(el.firstChild);
    const fill = doc.createElement('div'); fill.className = 'wce-shape-fill';
    const content = doc.createElement('div'); content.className = 'wce-shape-content';
    const vp = shapeVerts(shape, s.orient);
    if(vp){
      const outer = polyPath(w, h, vp, radius);
      const svg = doc.createElementNS(SVGNS, 'svg');
      svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', '0 0 '+w+' '+h);
      const path = doc.createElementNS(SVGNS, 'path');
      path.setAttribute('d', outer);
      path.setAttribute('fill', hasImg ? 'none' : rgba(s.color || '#1a1a1c', fa));
      if(bw > 0){
        // stroke is centred on the outline; the svg is clipped to the outline, so the
        // outer half disappears and exactly bw px of border remains inside.
        path.setAttribute('stroke', bc);
        path.setAttribute('stroke-width', bw*2);
        path.setAttribute('stroke-linejoin', 'round');
      }
      svg.appendChild(path);
      svg.style.clipPath = 'path("'+outer+'")';
      fill.appendChild(svg);
      if(hasImg){
        const iw = Math.max(1, w - 2*bw), ih = Math.max(1, h - 2*bw);
        const inner = doc.createElement('div');
        inner.style.cssText = 'position:absolute;left:'+bw+'px;top:'+bw+'px;width:'+iw+'px;height:'+ih+'px;pointer-events:none';
        inner.style.clipPath = 'path("'+polyPath(iw, ih, vp, Math.max(0, radius - bw))+'")';
        paintImage(inner, s, iw, ih, fa);
        fill.appendChild(inner);
      }
      content.style.clipPath = 'path("'+outer+'")';
    } else {
      const rad = shape==='circle' ? '50%' : radius+'px';
      fill.style.borderRadius = rad;
      fill.style.background = hasImg ? 'transparent' : rgba(s.color || '#1a1a1c', fa);
      fill.style.border = bw > 0 ? (bw+'px solid '+bc) : 'none';
      content.style.borderRadius = rad;
      content.style.overflow = 'hidden';
      if(hasImg){ fill.style.overflow = 'hidden'; paintImage(fill, s, Math.max(1, w - 2*bw), Math.max(1, h - 2*bw), fa); }
    }
    el.appendChild(fill);
    el.appendChild(content);
  }
  function buildShape(doc, s){
    const el = doc.createElement('div');
    el.className = 'wce-overlay-shape';
    el.dataset.overlayId = s.id;
    paintShape(el, s);
    return el;
  }
  function shapeHost(el){ return el.querySelector(':scope > .wce-shape-content'); }

  // ---------- Canvas-profile snapshots ----------
  // What a Canvas profile snapshot records per element and re-applies while the profile is
  // active: layout (position, size, which frame/shape it sits in, open/closed) and look
  // (colours, borders, fonts, roundness, opacity, scroller/arrow settings ...). Deliberately
  // NOT content or behaviour (label text, image data, links, what a thumbnail applies, toggle
  // states), so editing those later never gets silently overridden by an old snapshot.
  const SNAP_KEYS = [
    'x','y','groupId','width','height','size','collapsed','direction','opacity',
    'shape','radius','borderWidth','borderColor','color','fillOpacity','borderOpacity','shadow','shadowStrength','tracking','orient',
    'fontFamily','fontSize',
    'tabBg','tabBgOpacity','tabBorderColor','tabBorderWidth','tabRadius',
    'shelfBg','shelfBgOpacity','shelfBorderColor','shelfBorderWidth','shelfRadius',
    'titleFont','titleFontSize','titleColor','headerAlign','arrowColor','arrowSize',
    'scrollEnabled','scrollSide','scrollLength','scrollTrackLength','scrollWidth',
    'scrollBg','scrollBgOpacity','scrollBorderColor','scrollBorderWidth','scrollRadius',
    'scrollThumbColor','scrollThumbOpacity',
    'trackColor','trackHeight','thumbColor','thumbSize','activeColor','showLabels',
    'hover','iconColor'
  ];
  function snapshotOf(o){
    const s = {};
    SNAP_KEYS.forEach(function(k){ if(o[k] !== undefined) s[k] = o[k]; });
    s.groupId = o.groupId || null;      // "at the root" is part of the state too
    s.hidden = !!o.hidden;              // shown / hidden is part of the state too, so a profile can toggle it
    return s;
  }

  return {
    css: CSS, rgba: rgba, isHoriz: isHoriz, clamp: clamp,
    SNAP_KEYS: SNAP_KEYS, snapshotOf: snapshotOf,
    groupInnerHTML: groupInnerHTML, groupHost: groupHost, groupExtras: groupExtras,
    headerTextAlign: headerTextAlign,
    updateScroller: updateScroller, scheduleRefresh: scheduleRefresh, setScroll: setScroll,
    yMaxPct: yMaxPct, scrollOn: scrollOn,
    paintShape: paintShape, buildShape: buildShape, shapeHost: shapeHost,
    paintThumb: paintThumb, paintImage: paintImage, imgGeom: imgGeom, measureImage: measureImage,
    knownAspect: knownAspect, thumbDims: thumbDims, thumbImageBox: thumbImageBox, shapeImageBox: shapeImageBox
  };
})();

// ===== WCEUIS — uniform UI scaling ===========================================
// Shared by the UI Designer page and the exported site's ui.js, like WCEG above.
//
// THE MODEL. The whole HUD (side panel, chrome buttons, every placed overlay, hotspot markers,
// startup screen) lives inside #wce-ui-stage. The stage is laid out at (viewport / s) CSS px and
// then scaled by s with transform:scale(s) from its top-left corner, so it always covers exactly
// the viewport. Children keep their % positions AND their px sizes, but every px is now worth
// s real pixels — the picture drawn at the reference size is simply shrunk/grown as a whole.
//
// DESKTOP (contain): s = clamp( min(vw / refW, vh / refH), min, max ). Positions are % of the stage, so the layout
// only ever contracts relative to the Designer view (nothing overlaps or leaves the screen that did not already).
//
// PHONES (literal): the designed canvas keeps its reference size in the axis that varies from phone to phone.
//   portrait  fits the WIDTH  (s = vw / 390) and keeps the full 844 px HEIGHT: shorter screens simply CUT the bottom,
//   landscape fits the HEIGHT (s = vh / 390) and keeps the full 844 px WIDTH:  narrower screens CUT the right side.
// Everything is positioned inside #wce-ui-canvas, which has exactly that size, so a % in the cropped axis means
// "% of the reference canvas" -- a control keeps the same distance from the top-left corner on every phone, and the
// Designer's bleed guides mark exactly where each common screen shape stops. A `safe` region is guaranteed to stay
// fully visible (s shrinks if the window is too small for it), so anything inside it looks identical everywhere.
// Chrome that must hug the real screen edges (side panel, loader) is NOT inside the canvas.
const WCEUIS = (function(){
  const STAGE_ID = 'wce-ui-stage', CANVAS_ID = 'wce-ui-canvas';
  const DEFAULTS = {
    enabled: true, min: 0.6, max: 2.5,
    ref:         { desktop: [1920, 1080], mobileV: [390, 844], mobileH: [844, 390] },
    heightSlack: { desktop: 0 },
    // which axis the scale is fitted to: 'w' / 'h' = literal phone view, absent = desktop contain-fit
    fit:         { mobileV: 'w', mobileH: 'h' },
    // [literalX, literalY]: axis in which the canvas keeps its reference size and the screen crops / leaves room
    literal:     { desktop: [false, false], mobileV: [false, true], mobileH: [true, false] },
    // region that must always be fully visible in a literal view (canvas px)
    safe:        { mobileV: [390, 660], mobileH: [693, 390] },
    // bleed guides (canvas px at which common screens end). Phones: content beyond a line can be cut off.
    // Desktop is guide-only (its % layout slides in instead of being cropped).
    bleed: {
      desktop: { x: [{at: 1728, label: '16:10'}, {at: 1440, label: '4:3'}], y: [{at: 950, label: 'browser'}] },
      mobileV: { x: [], y: [{at: 780, label: '18:9'}, {at: 693, label: '16:9'}, {at: 660, label: 'browser bars'}] },
      mobileH: { x: [{at: 780, label: '18:9'}, {at: 693, label: '16:9'}], y: [] }
    },
    narrowBelow: 768                       // stage width under which the panel goes full-width
  };
  const MERGE = ['ref', 'heightSlack', 'fit', 'literal', 'safe', 'bleed'];
  function clampN(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  // Optional per-project override: WCE_THEME.uiScale = {enabled, min, max, ref, fit, literal, safe, bleed}
  function cfgFor(win){
    try{
      const o = win.WCE_THEME && win.WCE_THEME.uiScale;
      if(o && typeof o === 'object'){
        const c = Object.assign({}, DEFAULTS, o);
        MERGE.forEach(function(k){ c[k] = Object.assign({}, DEFAULTS[k], o[k] || {}); });
        return c;
      }
    }catch(e){}
    return DEFAULTS;
  }
  function urlParam(win){
    try{ return new win.URLSearchParams(win.location.search).get('wce_uiscale'); }catch(e){ return null; }
  }
  // True inside the Designer's own preview iframe (same-origin parent that owns #wce-preview-frame).
  function inDesigner(win){
    if(win.__wceDesigner) return true;
    try{ return win.parent !== win && !!win.parent.document.getElementById('wce-preview-frame'); }catch(e){ return false; }
  }
  // The real, current visible area -- falls back to the plain viewport where visualViewport
  // is not available (desktop browsers, and the Designer's own preview).
  function viewportSize(win){
    const vv = win.visualViewport;
    return vv ? {w: vv.width, h: vv.height} : {w: win.innerWidth || 1, h: win.innerHeight || 1};
  }
  function viewOf(win){
    if(win.__wceUiView) return win.__wceUiView;
    try{ if(typeof win._wceDetectDeviceView === 'function') return win._wceDetectDeviceView(); }catch(e){}
    return 'desktop';
  }
  function compute(win){
    const p = urlParam(win);
    if(p === 'off' || inDesigner(win)) return 1;
    const c = cfgFor(win);
    if(c.enabled === false) return 1;
    if(p !== null && p !== '' && isFinite(parseFloat(p))) return clampN(parseFloat(p), 0.25, 4);
    const v = viewOf(win);
    const ref = c.ref[v] || c.ref.desktop;
    const vp = viewportSize(win), vw = vp.w, vh = vp.h;
    const fit = c.fit[v], safe = c.safe[v];
    let s;
    if(fit === 'w' && safe)      s = Math.min(vw / ref[0], vh / safe[1]);
    else if(fit === 'h' && safe) s = Math.min(vh / ref[1], vw / safe[0]);
    else {
      const slack = clampN(+c.heightSlack[v] || 0, 0, 0.5);
      s = Math.min(vw / ref[0], vh / (ref[1] * (1 - slack)));
    }
    s = clampN(s, +c.min || 0.25, +c.max || 4);
    s = Math.round(s * 1000) / 1000;
    return Math.abs(s - 1) < 0.005 ? 1 : s;
  }
  function apply(win){
    win = win || window;
    const d = win.document;
    if(!d || !d.documentElement) return 1;
    const s = compute(win), prev = win.__wceUiScale;
    const vp = viewportSize(win), vw = vp.w, vh = vp.h;
    const c = cfgFor(win), v = viewOf(win);
    win.__wceUiScale = s;
    d.documentElement.style.setProperty('--wce-s', String(s));
    const st = d.getElementById(STAGE_ID);
    if(st){
      st.style.width = (vw / s) + 'px';
      st.style.height = (vh / s) + 'px';
      st.style.transform = (s === 1) ? 'none' : 'scale(' + s + ')';
    }
    // The canvas the overlays live in: reference size in a literal axis, otherwise it just fills the stage.
    const cv = d.getElementById(CANVAS_ID);
    if(cv){
      const ref = c.ref[v] || c.ref.desktop, lit = c.literal[v] || [false, false];
      cv.style.width  = lit[0] ? ref[0] + 'px' : (vw / s) + 'px';
      cv.style.height = lit[1] ? ref[1] + 'px' : (vh / s) + 'px';
    }
    d.documentElement.classList.toggle('wce-narrow', (vw / s) < (c.narrowBelow || 768));
    if(prev !== s){
      try{ win.dispatchEvent(new win.CustomEvent('wce-uiscale', {detail: {scale: s}})); }catch(e){}
    }
    return s;
  }
  function init(win){
    win = win || window;
    apply(win);
    if(win.__wceUiScaleWired) return;
    win.__wceUiScaleWired = true;
    const again = function(){ apply(win); };
    win.addEventListener('resize', again);
    win.addEventListener('orientationchange', again);
    // A real phone's own address bar / bottom bar showing or hiding changes what is actually
    // visible without necessarily firing a plain 'resize' -- visualViewport's own resize (and a
    // scroll, which is what often accompanies that chrome animating on iOS) catches those too.
    if(win.visualViewport){
      win.visualViewport.addEventListener('resize', again);
      win.visualViewport.addEventListener('scroll', again);
    }
  }
  // Sound (#sfx-toggle) used to be the one control NOT placed like every other element: pinned 14px from the
  // bottom-left corner in px, while Present / Snapshot / thumbnails are top-left percentages. Until the artist moves
  // it, its stock spot is expressed in the SAME model: a top-left % of this view's reference canvas. In a phone view
  // whose bottom can be cropped it sits above the lowest bleed line so it is never cut off.
  function chromeDefaultPos(win, el, view){
    const c = cfgFor(win), v = view || viewOf(win);
    const ref = c.ref[v] || c.ref.desktop, lit = c.literal[v] || [false, false], safe = c.safe[v];
    const m = 14, h = el.offsetHeight || 30;
    const bottom = (lit[1] && safe) ? safe[1] : ref[1];
    return { x: m / ref[0] * 100, y: (bottom - m - h) / ref[1] * 100 };
  }
  // Per-overlay stacking order: an overlay with a numeric `z` gets it as its z-index (Bring to front / Send to back).
  function applyStacking(doc, overlays){
    const w = doc.defaultView;
    const byId = {};
    doc.querySelectorAll('[data-overlay-id]').forEach(function(e){ (byId[e.getAttribute('data-overlay-id')] = byId[e.getAttribute('data-overlay-id')] || []).push(e); });
    (overlays || []).forEach(function(o){
      if(!o) return;
      (byId[String(o.id)] || []).forEach(function(el){
        if(typeof o.z === 'number') el.style.zIndex = String(o.z);
        // Hidden elements are taken off the page (display:none: nothing drawn, nothing clickable). A profile flips this per
        // state; only what we hid ourselves is shown again.
        if(o.hidden){ el.style.setProperty('display', 'none', 'important'); el.dataset.wceHid = '1'; }
        else if(el.dataset.wceHid){ el.style.removeProperty('display'); delete el.dataset.wceHid; }
      });
    });
  }
  // A profile can sit under a parent (parentId): the effective profile is the chain of parents with the child on top, so a
  // sub-profile only has to say what it CHANGES. Canvas captures are per device (snapshots.desktop / mobileV / mobileH); an
  // older profile with one .snapshot serves every device until it is captured again on that device.
  function resolveProfile(p, profiles, view){
    if(!p) return p;
    const chain = [];
    let cur = p, guard = 0;
    while(cur && guard++ < 12){
      chain.unshift(cur);
      const pid = cur.parentId;
      cur = pid ? (profiles || []).find(function(x){ return x.id === pid; }) : null;
    }
    const eff = Object.assign({}, p);
    eff.__src = p;
    const merged = {colors: {}, thumbnails: {}, textOverrides: {}, groupOverrides: {}}, ov = {};
    let stamp = null, any = false;
    chain.forEach(function(x){
      Object.keys(merged).forEach(function(k){
        const src = x[k] || {};
        Object.keys(src).forEach(function(id){
          const a = merged[k][id], b = src[id];
          merged[k][id] = (a && b && typeof a === 'object' && typeof b === 'object') ? Object.assign({}, a, b) : b;
        });
      });
      if(x.panelBg !== undefined) eff.panelBg = x.panelBg;
      if(x.panelOpacity !== undefined) eff.panelOpacity = x.panelOpacity;
      const s = (x.snapshots && x.snapshots[view]) || x.snapshot;
      if(s && s.overlays){
        any = true; stamp = s.capturedAt || stamp;
        Object.keys(s.overlays).forEach(function(id){ ov[id] = Object.assign({}, ov[id] || {}, s.overlays[id]); });
      }
    });
    eff.colors = merged.colors; eff.thumbnails = merged.thumbnails; eff.textOverrides = merged.textOverrides; eff.groupOverrides = merged.groupOverrides;
    eff.snapshot = any ? {capturedAt: stamp, overlays: ov} : null;
    return eff;
  }
  // ---- Icon overlays (Sound / Present / Snapshot): shape-like buttons, styled like any other element ----
  const ICON_PATHS = {
    present:   '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    snapshot:  '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    sound_on:  '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    sound_off: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
  };
  function iconSvg(kind, px){
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[kind] || '') + '</svg>';
  }
  function hexRgba(hex, a){
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if(!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  // The same style keys shapes use: size, shape, radius, fill colour + opacity, border, opacity -- plus the icon colour.
  function applyIconStyle(el, o, kind){
    const size = o.size || 40, shape = o.shape || 'circle';
    el.classList.add('wce-icon-btn');
    el.innerHTML = iconSvg(kind, Math.round(size * 0.5));
    el.style.width = size + 'px'; el.style.height = size + 'px'; el.style.padding = '0'; el.style.justifyContent = 'center'; el.style.gap = '0';
    el.style.borderRadius = shape === 'circle' ? '50%' : (shape === 'square' || shape === 'none' ? '0' : (o.radius != null ? o.radius : 10) + 'px');
    if(o.color) el.style.background = hexRgba(o.color, (o.fillOpacity != null ? o.fillOpacity : 100) / 100);
    if(o.borderWidth != null) el.style.borderWidth = o.borderWidth + 'px';
    if(o.borderColor) el.style.borderColor = o.borderColor;
    if(o.iconColor) el.style.color = o.iconColor;
    if(o.opacity != null) el.style.opacity = String(o.opacity / 100);
  }
  // Hover effect (any element): only what the artist switched on is written, so an element with no hover settings keeps the page's own hover.
  function applyHover(doc, overlays){
    const w = doc.defaultView;
    const byId = {};
    doc.querySelectorAll('[data-overlay-id]').forEach(function(e){ (byId[e.getAttribute('data-overlay-id')] = byId[e.getAttribute('data-overlay-id')] || []).push(e); });
    (overlays || []).forEach(function(o){
      if(!o) return;
      (byId[String(o.id)] || []).forEach(function(el){
        ['scale', 'lift', 'opacity', 'fill', 'border', 'ring-w', 'glow', 'glow-r', 'speed'].forEach(function(k){ el.style.removeProperty('--wce-hv-' + k); });
        const h = o.hover;
        if(h && typeof h === 'object') el.setAttribute('data-wce-hv', '1'); else el.removeAttribute('data-wce-hv');      // any hover object (even an empty one) replaces the page's default hover
        if(o.type === 'text'){
          el.setAttribute('data-wce-sil', '1');
          const ori = o.orient || 'h';
          el.style.writingMode = (ori === 'v' || ori === 'rv') ? 'vertical-rl' : '';
          el.style.rotate = (ori === 'rh' || ori === 'rv') ? '180deg' : '';       // the CSS rotate PROPERTY: it composes with the hover lift instead of being replaced by it
          el.style.letterSpacing = o.tracking ? o.tracking + 'px' : '';
          el.style.textShadow = (o.shadow === true && (o.shadowStrength == null ? 12 : o.shadowStrength) > 0) ? '0 ' + Math.round((o.shadowStrength == null ? 12 : o.shadowStrength) / 6) + 'px ' + Math.round((o.shadowStrength == null ? 12 : o.shadowStrength) / 2) + 'px rgba(0,0,0,.6)' : '';
          if(o.opacity != null) el.style.opacity = String(o.opacity / 100);
        }
        // text and shapes are click-through on the page; an element that HAS a hover effect must be able to receive the pointer
        if(h && Object.keys(h).length){ el.style.pointerEvents = 'auto'; el.dataset.wceHvPe = '1'; }
        else if(el.dataset.wceHvPe){ el.style.removeProperty('pointer-events'); delete el.dataset.wceHvPe; }
        if(!h) return;
        if(h.scale != null) el.style.setProperty('--wce-hv-scale', String(h.scale / 100));
        if(h.lift) el.style.setProperty('--wce-hv-lift', (-Math.abs(h.lift)) + 'px');
        if(h.opacity != null) el.style.setProperty('--wce-hv-opacity', String(h.opacity / 100));
        if(h.fill) el.style.setProperty('--wce-hv-fill', h.fill);
        if(h.border){ el.style.setProperty('--wce-hv-border', h.border === 'auto' ? 'var(--wce-thumb-active-color, var(--accent))' : h.border); el.style.setProperty('--wce-hv-ring-w', '2px'); }
        if(h.glow){ el.style.setProperty('--wce-hv-glow', h.glow); el.style.setProperty('--wce-hv-glow-r', (h.glowSize != null ? h.glowSize : 14) + 'px'); }
        if(h.speed != null) el.style.setProperty('--wce-hv-speed', h.speed + 'ms');
      });
    });
  }
  return {
    STAGE_ID: STAGE_ID, CANVAS_ID: CANVAS_ID, REF: DEFAULTS.ref, DEFAULTS: DEFAULTS,
    compute: compute, viewOf: viewOf, chromeDefaultPos: chromeDefaultPos, applyStacking: applyStacking, applyHover: applyHover, applyIconStyle: applyIconStyle, iconSvg: iconSvg, resolveProfile: resolveProfile, apply: apply, init: init,
    bleed:   function(view, win){ return (cfgFor(win || window).bleed[view]) || {x: [], y: []}; },
    safe:    function(view, win){ return cfgFor(win || window).safe[view] || null; },
    literal: function(view, win){ return cfgFor(win || window).literal[view] || [false, false]; },
    refSize: function(win){ win = win || window; const c = cfgFor(win); return c.ref[viewOf(win)] || c.ref.desktop; },
    scale: function(win){ return (win || window).__wceUiScale || 1; },
    stage: function(doc){ doc = doc || document; return doc.getElementById(STAGE_ID) || doc.body; }
  };
})();
try{ if(typeof window !== 'undefined' && document.getElementById(WCEUIS.STAGE_ID)) WCEUIS.init(window); }catch(e){}

(function(){
  // WCEG.css: container / shape / scroller rules (kept in the shared block so the UI
  // Designer and the exported page can never disagree about them).
  try{
    const s=document.createElement('style'); s.id='wceg-css'; s.textContent=WCEG.css;
    (document.head||document.documentElement).appendChild(s);
  }catch(e){}
})();

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
  window._wceLive = null;
  if(typeof buildThumbnailOverlays==='function') buildThumbnailOverlays();
}
// ---- Canvas-profile snapshots ------------------------------------------------------------
// While a Canvas profile with a snapshot is active, every overlay the snapshot covers is
// drawn from a LIVE COPY = the real overlay + the snapshot's recorded layout/look. The real
// overlays are never touched, so returning to the normal UI is just dropping the copies.
// The copies persist while the profile stays active, so things the visitor does inside the
// snapshot (opening a group frame, ...) survive re-renders.
function _wceBuildLive(p){
  const snap = p && p.snapshot && p.snapshot.overlays;
  if(!p || p.mode!=='canvas' || !snap) return null;
  const live = {};
  (window.WCE_OVERLAYS||[]).forEach(o=>{
    const s = snap[o.id];
    if(!s) return;                       // added after the snapshot was taken: stays as it is
    const c = Object.assign({}, o, JSON.parse(JSON.stringify(s)));
    if(o.imageScale !== undefined) c.imageScale = o.imageScale; else delete c.imageScale;   // the crop belongs to the image, not the look
    if(o.type==='toggle'){
      // Which state a toggle is showing is app state, not layout: share it with the real one.
      Object.defineProperty(c, 'activeIndex', {get(){ return o.activeIndex; }, set(v){ o.activeIndex = v; }, enumerable:true, configurable:true});
    }
    live[o.id] = c;
  });
  return live;
}
function _wceEffectiveOverlays(){
  const base = window.WCE_OVERLAYS||[];
  const live = window._wceLive;
  if(!live) return base;
  return base.map(o=>live[o.id]||o);
}
function _wceLiveOverlay(id){
  const live = window._wceLive;
  if(live && live[id]) return live[id];
  return (window.WCE_OVERLAYS||[]).find(x=>x.id===id);
}
// A trigger was clicked: switch to the profile, or -- when the profile has "return on 2nd
// click" and is already showing -- put the UI back to normal.
function _wceProfileClick(p){
  const tr = p.transition||'fade';
  const _cur = window._wceActiveProfile;
  if(p.mode==='canvas' && p.returnOnRetrigger && _cur && _cur.__src===p){
    // a sub-profile goes back to its PARENT's state, a top-level profile back to Global
    const _parent = p.parentId ? (window.WCE_PROFILES||[]).find(x=>x.id===p.parentId) : null;
    _wceRunTransition(()=>{ if(_parent) applyProfile(_parent); else applyGlobalPalette(); }, tr, p.duration);
  } else {
    _wceRunTransition(()=>applyProfile(p), tr, p.duration);
  }
}
function applyProfile(p){
  if(!p) return;
  // Canvas-mode profiles never touch global colors/panel styling at all --
  // only Panel-mode profiles do. Calling _wceApplyColors here regardless
  // would reset --panel-bg to black every time a Canvas profile triggers,
  // since its p.colors/p.panelBg are simply never populated.
  // the EFFECTIVE profile: its parents underneath, and the capture made on THIS device
  const _eff = WCEUIS.resolveProfile(p, window.WCE_PROFILES||[], _wceDetectDeviceView());
  if(p.mode!=='canvas') _wceApplyColors(_eff.colors, _eff.panelBg, _eff.panelOpacity);
  window._wceActiveProfile = _eff;
  window._wceLive = _wceBuildLive(_eff);
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
function _wceWireProfileTrigger(el, overlayId, clickFilter){
  // Canvas-mode profiles can be triggered by clicking a thumbnail, toggle
  // group, text label, image, or group frame directly -- not just the
  // fixed set of chrome buttons SELECTABLE_SELECTOR covers. Added as an
  // extra listener (never replacing the element's own onclick), so a
  // toggle still cycles its own state AND applies the profile at once.
  const profiles = window.WCE_PROFILES||[];
  const matched = profiles.find(p=>p.mode==='canvas' && (p.triggerOverlayIds||[]).indexOf(overlayId)!==-1);
  if(matched){
    el.addEventListener('click', (ev)=>{ if(clickFilter && !clickFilter(ev)) return; _wceProfileClick(matched); });
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
      el.addEventListener('click', ()=>_wceProfileClick(p));
    } else {
      // Nothing claimed this button as its own switch (a Panel profile's own trigger), so it
      // used to always fall back to resetting the palette to Global -- even while a Canvas
      // profile (a shape/thumbnail/text-triggered overlay swap) was actively showing, silently
      // throwing that away on every unrelated click (materials, the sound button, anything).
      // Only reset when there is actually a Panel-style state to return from.
      el.addEventListener('click', ()=>{
        if(window._wceActiveProfile && window._wceActiveProfile.mode==='canvas') return;
        _wceRunTransition(applyGlobalPalette, 'fade');
      });
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
// Every free-floating overlay is hosted in the scaled HUD stage (see WCEUIS), not directly in <body>.
function _wceRootHost(){ return document.getElementById('wce-ui-canvas') || document.getElementById('wce-ui-stage') || document.body; }
// Sound / Present / Snapshot overlays are built on the SAME container as thumbnails (.wce-overlay-thumb): the same shapes (circle, hexagon...),
// border, size, opacity, hover and selected ring. Only the icon inside and the click behaviour differ.
function _wceIsIconOverlay(o){ return !!o && (o.type==='sound' || ((o.type==='presentation' || o.type==='snapshot') && o.display==='icon')); }
function _wceIconShapeProps(o, eff){ return Object.assign({}, eff, {kind: undefined, image: undefined, color: o.color || '#1a1a1c'}); }
function _wceDecorateIcon(el, o, sz){
  const kind = o.type==='sound' ? 'sound_on' : (o.type==='presentation' ? 'present' : 'snapshot');
  el.dataset.wceActionKind = o.type;
  el.title = o.label || (o.type==='sound' ? 'Toggle sound effects' : (o.type==='presentation' ? 'Presentation mode' : 'Take a snapshot'));
  const ic = document.createElement('span');
  ic.className = 'wce-thumb-icon';
  ic.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;pointer-events:none;color:' + (o.iconColor || 'var(--text)');
  const px = Math.round(sz * 0.5);
  ic.innerHTML = WCEUIS.iconSvg(kind, px);
  el.appendChild(ic);
  if(o.type==='sound'){
    const s = document.getElementById('sfx-toggle');
    const sync = ()=>{ const off = !!(s && s.classList.contains('off')); el.classList.toggle('off', off); ic.innerHTML = WCEUIS.iconSvg(off ? 'sound_off' : 'sound_on', px); };
    sync();
    el.onclick = ()=>{ const b = document.getElementById('sfx-toggle'); if(b) b.click(); };
    if(window._wceSoundObs){ try{ window._wceSoundObs.disconnect(); }catch(e){} }
    if(s && window.MutationObserver){ window._wceSoundObs = new MutationObserver(sync); window._wceSoundObs.observe(s, {attributes:true, attributeFilter:['class']}); }
  } else if(o.type==='presentation'){
    el.onclick = ()=>{ _wcePresentationActive ? _wceExitPresentationMode() : _wceEnterPresentationMode(o, el); };
  } else {
    el.onclick = ()=>_wceTakeSnapshot();
  }
}
// When a Sound overlay exists it IS the sound button: the fixed chrome button steps aside (its audio logic stays; the overlay clicks it).
function _wceSoundOverlayVisibility(){
  const sfx = document.getElementById('sfx-toggle');
  if(!sfx) return;
  const has = (_wceEffectiveOverlays()||[]).some(function(o){ return o && o.type==='sound' && !o.hidden; });
  if(has){ sfx.style.setProperty('display','none','important'); sfx.dataset.wceSoundOverlay='1'; }
  else if(sfx.dataset.wceSoundOverlay){ sfx.style.removeProperty('display'); delete sfx.dataset.wceSoundOverlay; }
}
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
  // Hide Panel is per device, whether or not the views are mirrored
  if(base.panelHiddenByDevice && base.panelHiddenByDevice[view] !== undefined) base.panelHidden = !!base.panelHiddenByDevice[view];
}
let _wceOrientationListenerAttached = false;
function _wceAttachOrientationListener(){
  if(_wceOrientationListenerAttached) return;
  _wceOrientationListenerAttached = true;
  const mq = window.matchMedia("(orientation:landscape)");
  const onChange = function(){
    if(_wceDetectDeviceView()==="desktop") return;
    _wceApplyDeviceOverrides();
    // rotating: the active profile is re-resolved for the new device (its capture there)
    if(window._wceActiveProfile && window._wceActiveProfile.__src) applyProfile(window._wceActiveProfile.__src);
    if(typeof buildThumbnailOverlays==="function") buildThumbnailOverlays();
    if(typeof _wceApplyChromeOverrides==="function") _wceApplyChromeOverrides();
    if(typeof _wceDeclutterOverlays==="function") _wceDeclutterOverlays();
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
  try{ WCEUIS.apply(window); }catch(e){}
  _wceApplyDeviceOverrides();
  _wceAttachOrientationListener();
  _wceAttachDeclutterResizeListener();
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
  if(document.documentElement.classList.contains('wce-narrow')){pan.classList.add('closed');ptab.textContent='❮';}
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
  try{ _wceSoundOverlayVisibility(); }catch(e){}
  if(typeof _wceDeclutterOverlays==='function') _wceDeclutterOverlays();
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
  // Sound is positioned exactly like Present / Snapshot / thumbnails: top-left % of the canvas (its saved spot, or the
  // stock bottom-left spot expressed in %), never px-from-the-bottom -- see WCEUIS.chromeDefaultPos.
  (function(){
    const el = document.getElementById('sfx-toggle');
    if(!el) return;
    const ov = overrides['#sfx-toggle'];
    const p = (ov && ov.pos) ? ov.pos : WCEUIS.chromeDefaultPos(window, el);
    el.style.left = p.x + '%'; el.style.top = p.y + '%';
    el.style.bottom = 'auto'; el.style.right = 'auto';
    el.dataset.wceBaseLeft = p.x + '%'; el.dataset.wceBaseTop = p.y + '%';   // what the overlap pass resets to
  })();
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
        const btn=mk('button','anim-btn');btn.dataset.anim=def.name;btn.dataset.animId=_wceDefId(def);
        btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
        btn.onclick=()=>triggerAnim(_wceDefId(def));ctrlSec.appendChild(btn);
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
        const btn=mk('button','anim-btn');btn.dataset.anim=def.name;btn.dataset.animId=_wceDefId(def);
        const ms=(def.members||[]).join(' + ')||'—';
        btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
        btn.onclick=()=>triggerAnim(_wceDefId(def));comboSec.appendChild(btn);
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
          const btn=mk('button','anim-btn');btn.dataset.anim=def.name;btn.dataset.animId=_wceDefId(def);
          btn.innerHTML=def.name.replace(/_/g,' ')+'<span class="anim-play-icon">▶</span>';
          btn.onclick=()=>triggerAnim(_wceDefId(def));biSec.appendChild(btn);
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

// A control and a combo can share a name, so each animation button and trigger carries an id: the exported
// def.id ("control:HOOD" / "combo:HOOD"), derived here for configs that predate it.
function _wceDefId(def){ return def.id || ((Array.isArray(def.members) ? 'combo:' : 'control:') + def.name); }

const _seqRunning = {};   // seqName → true while a sequence is executing



function _fireStep(step) {
  const {action_type, action_name, target_state, target_name, target_uid, container_name, container_material, geo_toggle_chain} = step;
  if (action_type === 'flyto') {
    // Dedicated camera fly-to step — no animation, just move the camera.
    if (action_name) flyToCamera(action_name);
  } else if (action_type === 'mat_subset' || action_type === 'global_set') {
    // Resolved against Global Sets first, separately from the regular
    // per-category pool -- so the correct transition-override key is
    // known (Global Sets vs. the subsets own category), and can be
    // passed through to applyMatSubset -- a single merged pool would lose it.
    // Prefer the persistent uid (survives renames, and disambiguates two
    // categories that happen to share an identically-named subset) --
    // falls back to a name-only match for sequences saved before target_uid
    // existed.
    const gset = (target_uid && (CFG.global_mat_sets||[]).find(x => x.uid === target_uid)) || (CFG.global_mat_sets||[]).find(x => x.name === target_name);
    const s = gset || (target_uid && (CFG.mat_subsets||[]).find(x => x.uid === target_uid)) || (CFG.mat_subsets||[]).find(x => x.name === target_name);
    if (s) {
      applyMatSubset(s.state, gset ? '__global_sets__' : s.category); refreshAdvMat(s.state);
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
    if (action_name) flyToAnimState((action_type === 'combo' ? 'combo:' : 'control:') + action_name, target_state ?? 1);
  }
}

async function _runSteps(steps) {
  // Shared step-walking engine: used by executeSequence (a named,
  // independently-triggered Sequence) AND by a Camera Sequence segment's
  // embedded mini-sequence (fired inline from _beginSegmentPlayback in the
  // core engine script) -- same grouping/waiting semantics either way.
  if (!steps || !steps.length) return;
  let i = 0;
    while (i < steps.length) {
      // Collect group: this step + any consecutive Together steps.
      const group = [steps[i]];
      let j = i + 1;
      while (j < steps.length && steps[j].together) {
        group.push(steps[j]); j++;
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
}
window._runSteps = _runSteps;

async function executeSequence(seqName) {
  const seqs = (CFG.animations||{}).sequences || [];
  const seq  = seqs.find(s => s.name === seqName);
  if (!seq || !seq.steps || !seq.steps.length) return;
  if (_seqRunning[seqName]) return;
  _seqRunning[seqName] = true;
  try {
    await _runSteps(seq.steps);
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
  const camSeqs=camCfg.camera_sequences||[];
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

  cinSec.innerHTML = camSeqs.length ? '<div class="st">Camera Sequences</div>' : '';
  camSeqs.forEach(seq=>{
    const segDiv=mk('div');segDiv.style.cssText='font-size:9px;color:var(--muted);letter-spacing:.12em;margin-bottom:6px;line-height:1.9';
    segDiv.innerHTML='<b>'+(seq.label||seq.name).replace(/_/g,' ')+'</b><br>';
    (seq.segments||[]).forEach((s,i)=>{segDiv.innerHTML+=(i+1)+'. '+s.name.replace(/_/g,' ')+'<br>';});
    cinSec.appendChild(segDiv);
    if(seq.trigger==='button'){
      const btn=mk('button','cin-btn camseq-btn');btn.dataset.seq=seq.name;
      btn.innerHTML='<span>'+((seq.label||seq.name).toUpperCase().replace(/_/g,' '))+'</span>';
      btn.onclick=()=>(_camSeq[seq.name]&&_camSeq[seq.name].playing)?_stopCameraSequence(seq.name):_startCameraSequence(seq.name);
      cinSec.appendChild(btn);
    }else if(seq.trigger==='hotspot'){
      const lbl=mk('div','hotspot-lbl');lbl.dataset.hotspotLabel=seq.name;lbl.style.cssText='font-size:10px;color:var(--hot);padding:4px 0;letter-spacing:.1em';
      lbl.textContent='● Hotspot in scene starts '+(seq.label||seq.name).replace(/_/g,' ');cinSec.appendChild(lbl);
    }
    cinSec.appendChild(mk('div'));
  });
}

function _wceOverlayKey(o){
  if(!o.type && o.container && o.material) o.type='material';   // legacy saves before multi-type overlays
  if(o.type==='material') return 'material::'+o.container+'::'+o.material;
  if(o.type==='geo_toggle') return 'geo_toggle::'+o.node;
  if(o.type==='hdri') return 'hdri::'+(o.uid || (o.item&&o.item.file));
  if(o.type==='mat_subset'||o.type==='global_set'||o.type==='geo_subset') return o.type+'::'+(o.uid||o.name);
  if(o.type==='turntable') return 'turntable::singleton';
  if(o.type==='cinematic') return 'cinematic::singleton';
  if(o.type==='camera_sequence') return 'camera_sequence::'+(o.name||'');
  if(o.type==='text' || o.type==='group' || o.type==='section_slider' || o.type==='shape') return o.id || (o.type+'::'+Math.random().toString(36).slice(2));
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
      const gset=(o.uid && (CFG.global_mat_sets||[]).find(x=>x.uid===o.uid)) || (CFG.global_mat_sets||[]).find(x=>x.name===o.name);
      const s=gset || (o.uid && (CFG.mat_subsets||[]).find(x=>x.uid===o.uid)) || (CFG.mat_subsets||[]).find(x=>x.name===o.name) || (o.state ? {state:o.state} : null);
      if(s){ applyMatSubset(s.state, gset ? '__global_sets__' : s.category); refreshAdvMat(s.state); }
    } else if(o.type==='geo_subset'){
      const s=(o.uid && (CFG.geometry_subsets||[]).find(x=>x.uid===o.uid)) || (CFG.geometry_subsets||[]).find(x=>x.name===o.name) || (o.state ? {state:o.state} : null);
      if(s) applyGeoSubset(s.state);
    } else if(o.type==='geo_toggle' && o.node){
      applyGeoToggle(o.node, o.siblings||[]);
    } else if((o.type==='anim_control'||o.type==='anim_combo') && o.name){
      triggerAnim((o.type==='anim_combo' ? 'combo:' : 'control:') + o.name);
    } else if(o.type==='sequence' && o.name){
      executeSequence(o.name);
    } else if(o.type==='camera' && o.name){
      window._wceCamSel=o.name; flyToCamera(o.name);
    } else if(o.type==='turntable'){
      window._turntableActive ? _stopTurntable() : _startTurntable();
    } else if(o.type==='cinematic'){
      // Pre-upgrade Toggle Group / Thumbnail saves: the migration that runs
      // on Sync always names the carried-forward default sequence 'Cinematic',
      // so an old singleton overlay still resolves to something real.
      (_camSeq['Cinematic']&&_camSeq['Cinematic'].playing) ? _stopCameraSequence('Cinematic') : _startCameraSequence('Cinematic');
    } else if(o.type==='camera_sequence' && o.name){
      (_camSeq[o.name]&&_camSeq[o.name].playing) ? _stopCameraSequence(o.name) : _startCameraSequence(o.name);
    } else if(o.type==='hdri'){
      const item=(o.uid && (CFG.hdris||[]).find(h=>h.uid===o.uid)) || (CFG.hdris||[]).find(h=>h.name===o.name) || o.item;
      if(item) _loadHDRIItem(item);
    } else if(o.type==='filter'){
      const fItem=((CFG.post_process&&CFG.post_process.filters)||[]).find(x=>x.name===o.name);
      if(fItem && typeof _wceApplyPPFilter==='function'){
        _wceApplyPPFilter(fItem.filter_type, fItem.intensity, fItem);
        window._wceActivePPFilter=fItem.filter_type;
        qsa('.pb2[data-pf]').forEach(x=>x.classList.toggle('active', x.dataset.pfn===fItem.name));
      }
    } else if(o.type==='mat_anim'||o.type==='geo_anim'){
      const mgKind=o.type==='mat_anim'?'MAT':'GEO';
      const mgList=mgKind==='MAT'?(CFG.mat_animations||[]):(CFG.geo_animations||[]);
      const mgDef=mgList.find(d=>d.source_key===o.name);
      if(mgDef){
        if(mgDef.play_mode==='step'){ if(typeof window._matGeoStep==='function') window._matGeoStep(mgKind, mgDef); }
        else if(typeof window.triggerMatGeoAnim==='function') window.triggerMatGeoAnim(mgKind, mgDef.source_key);
      }
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
    b.onclick=()=>{activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyMatSubset(s.state, '__global_sets__');qsa('.gb').forEach(x=>x.classList.remove('active'));qsa('.pb2[data-sc]').forEach(x=>x.classList.remove('active'));b.classList.add('active');refreshAdvMat(s.state);};
    sec.appendChild(b);
  });
}
function applyGeoToggle(colName,siblingNames){
  const sc=colName.replace(/ /g,'_');
  // Already the visible sibling in this set -- clicking it again should
  // do nothing at all, not replay the dissolve-in/out animation pointlessly.
  if(geoSt[sc]) return;
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
      b.onclick=()=>{activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyMatSubset(s.state, cat);qsa('.gb').forEach(x=>x.classList.remove('active'));qsa('.pb2[data-sc]').forEach(x=>x.classList.remove('active'));b.classList.add('active');refreshAdvMat(s.state);};g.appendChild(b);});
    sec.appendChild(g);
  });
}
function buildAdvMat(){refreshAdvMat({});}
function refreshAdvMat(state){
  _wceQueueThumbSync();
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
    sel.onchange=()=>{if(sel.value){activeV=null;qsa('.vc').forEach(x=>x.classList.remove('active'));applyMat(c,sel.value);matSt[c]=sel.value;_wceQueueThumbSync();}};
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
  // Shared with the Designer (WCEG.paintThumb) so a shape / crop looks identical on the real site.
  WCEG.paintThumb(el, o);
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
    label.style.color=g.titleColor||'';
  }
  WCEG.groupExtras(el, g);   // arrow colour/size, title alignment, transparent container, scroller
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
    header.style.width=Math.max(32,(g.arrowSize!=null?g.arrowSize:9)+18)+'px';
    body.style.height=naturalLen+'px';
    body.style.width=collapsed?'0px':(g.width||180)+'px';
  } else {
    el.style.width=(g.width||180)+'px';
    body.style.height=collapsed?'0px':(g.height||140)+'px';
  }
  WCEG.scheduleRefresh(el);   // the scroller re-measures once the shelf has finished opening/closing
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
    const g = _wceLiveOverlay(gid);
    if(!g) return;
    g.collapsed = !g.collapsed;
    _wceApplyGroupCollapse(groupEl, g);
    arrow.textContent = g.collapsed ? '▸' : '▾';
  }, true);
}
function _wceThumbCategoryStyle(o){
  // Matches each thumbnail type to the SAME category color the equivalent
  // side-panel button already uses (.pb2/.gb/.vc/.tb/.cam-btn/.anim-btn), so
  // a highlighted thumbnail reads consistently with the panel -- and since
  // these are the same --accent/--ok/--a2/--cam custom properties the
  // palette editor already controls, a palette change applies here too,
  // with no separate color config needed.
  const t=o.type;
  if(t==='camera'||t==='turntable'||t==='cinematic'||t==='camera_sequence') return {color:'var(--cam)',bg:'#100a18'};
  if(t==='geo_toggle') return {color:'var(--a2)',bg:'#080f1e'};
  if(t==='mat_subset'||t==='geo_subset'||t==='hdri'||t==='filter'||t==='material') return {color:'var(--ok)',bg:'#071410'};
  return {color:'var(--accent)',bg:'#161208'};
}
// ---- Auto-highlight ----------------------------------------------------------------------
// A thumbnail lights up whenever EVERYTHING it would apply is already applied in the live scene,
// no matter how it got that way (this thumbnail, another thumbnail, a side-panel button, a variant,
// a sequence). Covered: individual materials, material sets, full configs, packages, geometry toggles,
// variants, environments, scene cameras (while the view sits at that camera), animations and combos (only
// while playing), sequences / cinematics / turntable (while running), filters and toggle groups (while one of their
// options is applied). One-shot actions keep the old click-only behaviour.
// Returns true / false, or null when this kind of thumbnail is not tracked.
// ---- Highlight groups ---------------------------------------------------------------------
// A thumbnail with hlGroupId uses that group's ring colour (and optional glow) while it is lit. The four theme
// colours are stored as var(--accent) etc., so a palette change still flows through. No group = category colours.
function _wceHlGroups(){
  const base=window.WCE_THEME||{};
  let src=base;
  try{
    const v=_wceDetectDeviceView(); const ov=(base.deviceOverrides||{})[v];
    if(v!=='desktop' && ov) src=ov;
  }catch(e){}
  return src.highlightGroups || base.highlightGroups || [];
}
function _wceApplyLitVars(el, o){
  const cat=_wceThumbCategoryStyle(o);
  el.style.setProperty('--wce-thumb-active-color', cat.color);
  el.style.setProperty('--wce-thumb-active-bg', cat.bg);
  el.style.removeProperty('--wce-lit-glow'); el.style.removeProperty('--wce-lit-glow-r');
  if(!o || !o.hlGroupId) return;
  const g=_wceHlGroups().find(x=>x.id===o.hlGroupId);
  if(!g) return;
  if(g.color) el.style.setProperty('--wce-thumb-active-color', g.color);
  if(g.glow){
    el.style.setProperty('--wce-lit-glow', g.glowColor || 'var(--wce-thumb-active-color)');
    el.style.setProperty('--wce-lit-glow-r', (g.glowSize!=null ? g.glowSize : 14)+'px');
  }
}
// Is the live view sitting at this scene camera? (same idea as flyToCamera's own "already there" check)
function _wceCamAtName(name){
  try{
    const def=((typeof camCfg!=='undefined' && camCfg && camCfg.static)||[]).find(c=>c.name===name);
    const c=window.cam, t=window._wceCtrl;
    if(!def || !def.position || !c) return false;
    const gap=(a,b)=>Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
    if(gap([c.position.x,c.position.y,c.position.z], def.position) > 0.01) return false;
    // A locked camera (Zoom/Pan lock or Lock in Place) moves the orbit target to a point right in front of the lens the
    // moment it arrives, so for those only the position says whether the view is still there. Free cameras also compare
    // where they look.
    const locked=def.lock ? def.lock!=='free' : !!def.lock_tumble_pan;
    if(!locked && def.target && t && t.target && gap([t.target.x,t.target.y,t.target.z], def.target) > 0.01) return false;
    return true;
  }catch(e){ return false; }
}
// Environments, cameras, animations and sequences change from many places (sequences, hotspots, the side panel,
// the visitor orbiting away...), so besides the instant refreshes there is a light re-check a few times a second.
let _wceThumbPoll=null;
function _wceStartThumbPoll(){
  if(_wceThumbPoll) return;
  _wceThumbPoll=setInterval(()=>{
    if(document.hidden || !(window.WCE_OVERLAYS||[]).length) return;
    try{ _wceSyncThumbHighlights(); }catch(e){}
  }, 200);
}
function _wceThumbCovered(o){
  if(!o.type && o.container && o.material) o.type='material';
  const t=o.type;
  const ms=(typeof matSt!=='undefined' && matSt) || {};
  const gs=(typeof geoSt!=='undefined' && geoSt) || {};
  const gk=v=>String(v).replace(/ /g,'_');
  const allMat=st=>{ const e=Object.entries(st||{}); return e.length>0 && e.every(([c,m])=>ms[c]===m); };
  const allGeo=st=>{ const e=Object.entries(st||{}); return e.length>0 && e.every(([p,c])=>!!gs[gk(c)]); };
  if(t==='material') return !!(o.container && o.material && ms[o.container]===o.material);
  if(t==='geo_toggle') return !!(o.node && gs[gk(o.node)]);
  if(t==='mat_subset' || t==='global_set'){
    // resolved fresh from CFG in the same order applyOverlay uses, so it checks what a click would apply
    const gset=(o.uid && (CFG.global_mat_sets||[]).find(x=>x.uid===o.uid)) || (CFG.global_mat_sets||[]).find(x=>x.name===o.name);
    const s=gset || (o.uid && (CFG.mat_subsets||[]).find(x=>x.uid===o.uid)) || (CFG.mat_subsets||[]).find(x=>x.name===o.name) || (o.state ? {state:o.state} : null);
    return !!s && allMat(s.state);
  }
  if(t==='geo_subset'){
    const s=(o.uid && (CFG.geometry_subsets||[]).find(x=>x.uid===o.uid)) || (CFG.geometry_subsets||[]).find(x=>x.name===o.name) || (o.state ? {state:o.state} : null);
    return !!s && allGeo(s.state);
  }
  if(t==='variant'){
    const d=(typeof varData!=='undefined' && varData) ? varData[o.name] : null;
    if(!d) return false;
    const SKIP=['CAMERA_SETTINGS','MAT_SUBSETS','GLOBAL_MAT_SETS','GEO_SETS','LIGHTS','ENVIRONMENTS'];
    const exposed=CFG.geometry_exposed||{};
    let n=0, ok=true;
    Object.entries(d).forEach(([k,v])=>{
      if(!ok || typeof v!=='string' || !v || v==='NONE') return;
      if(k.startsWith('GEOMETRIES_')){ if(!exposed[k]) return; n++; if(!gs[gk(v)]) ok=false; }
      else if(!SKIP.includes(k)){ n++; if(ms[k]!==v) ok=false; }
    });
    return ok && n>0;
  }
  // ---- things that are "on" without touching materials / geometry ----
  if(t==='hdri'){
    const list=CFG.hdris||[];
    const item=(o.uid && list.find(h=>h.uid===o.uid)) || list.find(h=>h.name===o.name) || o.item;
    if(!item) return false;
    if(window._wceEnvSel!==undefined) return window._wceEnvSel===(item.uid||item.name);
    return !!item.default;   // nothing chosen yet: the environment the page starts with
  }
  if(t==='camera') return _wceCamAtName(o.name) || (window._wceCamSel===o.name && !!(window._isFlyActive && window._isFlyActive()));
  if(t==='sequence') return !!(o.name && _seqRunning[o.name]);
  if(t==='cinematic') return !!(_camSeq['Cinematic'] && _camSeq['Cinematic'].playing);
  if(t==='camera_sequence') return !!(o.name && _camSeq[o.name] && _camSeq[o.name].playing);
  if(t==='turntable') return !!window._turntableActive;
  if(t==='filter'){
    const f=((CFG.post_process&&CFG.post_process.filters)||[]).find(x=>x.name===o.name);
    return !!f && window._wceActivePPFilter===f.filter_type;
  }
  if(t==='anim_control' || t==='anim_combo'){
    // Lit only while it is PLAYING -- the same thing the panel button's "playing" light means (a part of it is still
    // moving, or a looping one is running). A finished animation resting in its end pose is not lit.
    //  - a part (control) also lights while a combo is what moves it;
    //  - a combo lights while any of its parts is moving, whoever started it -- except a part that is only looping on its own.
    const def=(typeof _animDefByRef==='function') ? _animDefByRef((t==='anim_combo' ? 'combo:' : 'control:') + o.name) : null;
    if(!def) return null;
    const id=_wceDefId(def), isCombo=Array.isArray(def.members);
    if(def.builtin==='hover') return !!(window._builtinActive && window._builtinActive.Hover);      // the hover loop, while it runs
    if(def.anim_type==='GEO_FLICKER') return !!(window._geoFlickerTimers && window._geoFlickerTimers[def.name]);
    if(def.anim_type==='GEO_TOGGLE') return ((window.animState||{})[def.name]||0)>0;                // no motion to watch: like its panel button, on while the geometry is shown
    const bk=window._animBtnKeys||{}, kp=window._keepPlayingActive||{}, w=window._segWatch||{};
    const busy=v=>!!(v && (v.size!==undefined ? v.size : v.length)>0);
    const keyOf=n=>{ try{ return _resolveAnimKey(n); }catch(e){ return n; } };
    if(kp[id] || busy(bk[id])) return true;                        // it is playing itself
    if(!isCombo) return !!w[keyOf(def.name)];                      // ...or a combo is moving this part
    return def.members.some(n=>{
      const md=_animDefByRef('control:'+n), mid=md ? _wceDefId(md) : 'control:'+n;
      if(kp[mid]) return false;                                    // a looping part does not light its combo
      return !!w[keyOf(n)] || busy(bk[mid]);
    });
  }
  if(t==='mat_anim' || t==='geo_anim'){
    const list=t==='mat_anim' ? (CFG.mat_animations||[]) : (CFG.geo_animations||[]);
    const def=list.find(d=>d.source_key===o.name);
    if(!def || def.play_mode==='step' || !window._matGeoActive) return null;
    return !!window._matGeoActive[def.source_key];
  }
  if(t==='toggle'){
    // A toggle group holds several options, each one an ordinary thumbnail target. It lights while any of them is applied.
    const res=window._wceResolveToggleState, states=o.states||[];
    if(typeof res!=='function' || !states.length) return null;
    let tracked=false, any=false;
    states.forEach(st=>{ try{ const r=res(st); const c=r ? _wceThumbCovered(r) : null; if(c!==null){ tracked=true; if(c) any=true; } }catch(e){} });
    return tracked ? any : null;
  }
  return null;
}
function _wceSyncThumbHighlights(){
  if(window._wceDesignerEditMode) return;   // Edit mode keeps its own selection outlines
  const list=(typeof _wceEffectiveOverlays==='function') ? _wceEffectiveOverlays() : (window.WCE_OVERLAYS||[]);
  list.forEach(o=>{
    try{
      if(!o || !o.id) return;
      const hit=_wceThumbCovered(o);
      if(hit===null) return;
      const el=document.querySelector('[data-overlay-id="'+o.id+'"]');
      if(el && el.classList.contains('wce-overlay-thumb')) el.classList.toggle('active', hit);
    }catch(e){}
  });
}
let _wceThumbSyncTimer=null;
function _wceQueueThumbSync(){
  // Queued (not immediate) because callers set matSt/geoSt just AFTER calling applyMat/applyGeoToggle.
  if(_wceThumbSyncTimer) return;
  _wceThumbSyncTimer=setTimeout(()=>{ _wceThumbSyncTimer=null; _wceSyncThumbHighlights(); },0);
}
function buildThumbnailOverlays(){
  _wceBuildThumbnailOverlaysCore();
  try{ WCEUIS.applyStacking(document, _wceEffectiveOverlays()); }catch(e){}
  try{ WCEUIS.applyHover(document, _wceEffectiveOverlays()); }catch(e){}
  try{ _wceSoundOverlayVisibility(); }catch(e){}
  _wceSyncThumbHighlights();
  _wceStartThumbPoll();
}
function _wceBuildThumbnailOverlaysCore(){
  // Buttons/labels the artist dragged out of the sidebar (or added freehand) in
  // the UI Designer -- variants, configs, packages, materials, animations,
  // cameras, sequences, environment, plus free-floating text labels and
  // collapsible groups that can nest several of the above together.
  document.querySelectorAll('.wce-overlay-thumb,.wce-overlay-text,.wce-overlay-group,.wce-overlay-shape,.wce-overlay-section-slider,.wce-overlay-action-btn').forEach(el=>el.remove());
  const list=_wceEffectiveOverlays();

  // Declared BEFORE the group loop below, which calls _wceEnsureFontLoaded: as a const
  // declared after the loop it was still in its temporal dead zone at that point, so any
  // group frame with a custom title font threw and aborted the whole overlay build.
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

  // groupEls maps a container id (group frame OR shape) to the element its children are
  // placed in (the frame's content layer / the shape's content layer).
  const groupEls={};
  function _wceRenderGroup(g, forceRoot){
    const el=mk('div','wce-overlay-group');
    el.dataset.overlayId=g.id;
    el.style.left=g.x+'%'; el.style.top=g.y+'%';
    el.innerHTML=WCEG.groupInnerHTML(g);
    const geff=_wceEffectiveGroupProps(g);
    _wceApplyGroupCollapse(el, g);
    _wceApplyGroupStyle(el, geff);
    if(geff.titleFont) _wceEnsureFontLoaded(geff.titleFont);
    _wceWireProfileTrigger(el, g.id);
    (forceRoot ? _wceRootHost() : hostFor(g)).appendChild(el);
    groupEls[g.id]=WCEG.groupHost(el);
    WCEG.scheduleRefresh(el);
    const _arw=el.querySelector('.wce-group-arrow');
    if(g.expandTrigger==='hover'){
      el.addEventListener('mouseenter',()=>{
        if(g.collapsed){ g.collapsed=false; _wceApplyGroupCollapse(el, g); if(_arw) _arw.textContent='\u25be'; }
      });
      el.addEventListener('mouseleave',()=>{
        if(!g.collapsed){ g.collapsed=true; _wceApplyGroupCollapse(el, g); if(_arw) _arw.textContent='\u25b8'; }
      });
    } else if(g.expandTrigger==='header'){
      // "Click header": a click anywhere on the tab toggles the shelf. (A click on the arrow
      // itself is handled — and stopped — by _wceAttachGroupArrowDelegation, so it never
      // reaches this listener and can't toggle twice.)
      const _hdr=el.querySelector('.wce-group-header');
      if(_hdr){
        _hdr.style.cursor='pointer';
        _hdr.addEventListener('click',()=>{
          g.collapsed=!g.collapsed; _wceApplyGroupCollapse(el, g);
          if(_arw) _arw.textContent=g.collapsed?'\u25b8':'\u25be';
        });
      }
    }
  }

  function hostFor(o){
    return (o.groupId && groupEls[o.groupId]) || _wceRootHost();
  }

  // Shapes: a decorative box that is also a container. Nested shapes render parent-first.
  function _wceRenderShape(s, forceRoot){
    const el=WCEG.buildShape(document, s);
    el.style.left=(s.x??10)+'%'; el.style.top=(s.y??10)+'%';
    if((window.WCE_PROFILES||[]).some(p=>p.mode==='canvas' && (p.triggerOverlayIds||[]).indexOf(s.id)!==-1)){
      // A shape picked as a profile trigger has to be clickable (shapes are click-through
      // otherwise). Only clicks on the shape itself count, never clicks on things inside it.
      el.style.pointerEvents='auto'; el.style.cursor='pointer';
      const _content=WCEG.shapeHost(el);
      _wceWireProfileTrigger(el, s.id, ev=>ev.target===el || ev.target===_content);
    }
    if(s.link){ el.classList.add('wce-overlay-linked'); el.addEventListener('click', ev=>{ if(el.contains(ev.target)) window.open(s.link, '_blank'); }); }
    (forceRoot ? _wceRootHost() : hostFor(s)).appendChild(el);
    groupEls[s.id]=WCEG.shapeHost(el);
  }
  // Group frames and shapes are both containers and can hold each other, so ONE parents-first pass renders
  // them: a container is drawn only once its own parent exists.
  (function(){
    const conts=list.filter(o=>o.type==='group' || o.type==='shape');
    const known=new Set(conts.map(c=>c.id));
    const draw=(c,forceRoot)=>{ if(c.type==='group') _wceRenderGroup(c,forceRoot); else _wceRenderShape(c,forceRoot); };
    let pending=conts.slice(), rounds=conts.length+1;
    while(pending.length && rounds-- > 0){
      const later=[];
      pending.forEach(c=>{
        if(c.groupId && known.has(c.groupId) && !groupEls[c.groupId]) later.push(c); else draw(c,false);
      });
      // Nothing placeable this round = a parent cycle; never lose anything.
      if(later.length===pending.length){ later.forEach(c=>draw(c,true)); break; }
      pending=later;
    }
  })();
  _wceAttachGroupArrowDelegation();

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
    if(st.type==='camera'||st.type==='anim_control'||st.type==='anim_combo'||st.type==='sequence'||st.type==='camera_sequence'||st.type==='variant'||st.type==='filter'||st.type==='mat_anim'||st.type==='geo_anim'){
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
    if(st.type==='material'){
      const parts=String(st.target||'').split('::');
      if(parts.length<2) return null;
      return {type:'material', container:parts[0], material:parts.slice(1).join('::')};
    }
    if(st.type==='geo_toggle'){
      let sib=null;
      Object.keys(CFG.geometry_exposed||{}).forEach(function(pn){
        const tree=CFG.geometry_exposed[pn];
        if(!tree||tree.subset_only||sib) return;
        const ch=(tree.children||[]).filter(function(c){ return c.name.toLowerCase().indexOf('common')===-1; });
        if(ch.some(function(c){ return c.name===st.target; })) sib=ch.map(function(c){ return c.name; });
      });
      return sib ? {type:'geo_toggle', node:st.target, siblings:sib} : null;
    }
    if(st.type==='turntable'||st.type==='cinematic'){
      return {type:st.type};
    }
    return null;
  }
  window._wceResolveToggleState=_wceResolveToggleState;   // the highlight check resolves a toggle group's options with it
  function _wceShowTogglePicker(o, el, states){
    const existing=document.getElementById('wce-toggle-picker');
    if(existing) existing.remove();
    const rect=el.getBoundingClientRect();
    const pop=document.createElement('div');
    pop.id='wce-toggle-picker';
    const _dpTheme=(window.WCE_THEME&&window.WCE_THEME.dropdownPicker)||{};
    const _dpBg=_wceHexToRgba(_dpTheme.bgColor||'#0a0a0c', 0.95), _dpBorder=_dpTheme.borderColor||'#c8a96e';
    pop.style.cssText='position:fixed;z-index:10002;background:'+_dpBg+';border:1px solid '+_dpBorder+';border-radius:4px;padding:6px;min-width:120px;overflow-y:auto;box-sizing:border-box';
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
    const _uiS = window.__wceUiScale || 1;
    if(_uiS !== 1){ pop.style.transformOrigin = '0 0'; pop.style.transform = 'scale(' + _uiS + ')'; }
    // Keep the whole list on screen: open below the thumbnail when there is room, flip above when
    // there is not, cap the height to the space available (it scrolls), and stay inside the window.
    (function(){
      const pad=8, vw=window.innerWidth, vh=window.innerHeight;
      pop.style.maxHeight=(Math.max(120,vh-2*pad)/_uiS)+'px';
      const pr=pop.getBoundingClientRect();
      const below=vh-rect.bottom-pad-6, above=rect.top-pad-6;
      const openUp = pr.height>below && above>below;
      const avail=Math.max(120, openUp?above:below);
      const h=Math.min(pr.height, avail);
      pop.style.maxHeight=(h/_uiS)+'px';
      pop.style.top=(openUp ? Math.max(pad, rect.top-6-h) : rect.bottom+6)+'px';
      pop.style.left=Math.max(pad, Math.min(rect.left, vw-pr.width-pad))+'px';
    })();
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

list.filter(o=>o.type==='presentation' && o.display!=='icon').forEach(o=>{
    const el=mk('button','wce-overlay-action-btn');
    el.dataset.overlayId=o.id;
    el.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span>'+(o.label||'Present')+'</span>';
    el.style.left=o.x+'%'; el.style.top=o.y+'%';
    el.onclick=()=>{ _wcePresentationActive ? _wceExitPresentationMode() : _wceEnterPresentationMode(o, el); };
    _wceWireProfileTrigger(el, o.id);
    hostFor(o).appendChild(el);
  });
list.filter(o=>o.type==='snapshot' && o.display!=='icon').forEach(o=>{
    const el=mk('button','wce-overlay-action-btn');
    el.dataset.overlayId=o.id;
    el.dataset.wceActionKind='snapshot';
    el.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span>'+(o.label||'Snapshot')+'</span>';
    el.style.left=o.x+'%'; el.style.top=o.y+'%';
    el.onclick=()=>_wceTakeSnapshot();
    _wceWireProfileTrigger(el, o.id);
    hostFor(o).appendChild(el);
  });

  list.filter(o=>o.type!=='group' && o.type!=='shape' && o.type!=='text' && o.type!=='section_slider' && (o.type!=='presentation' || o.display==='icon') && (o.type!=='snapshot' || o.display==='icon')).forEach(o=>{
    if(!o.type && o.container && o.material) o.type='material';
    const el=mk('div','wce-overlay-thumb');
    if(o.id) el.dataset.overlayId=o.id;
    _wceApplyLitVars(el, o);
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
        imageAspect: cur.imageAspect, imageFit: cur.imageFit, imageX: cur.imageX, imageY: cur.imageY,
        imageScale: cur.imageScale != null ? cur.imageScale : eff.imageScale,
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
      _wceApplyThumbShape(el, _wceIsIconOverlay(o) ? _wceIconShapeProps(o, eff) : o);
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
          _wceSyncThumbHighlights(); _wceQueueThumbSync();
        };
      }
    }
    if(_wceIsIconOverlay(o)) _wceDecorateIcon(el, o, sz);
    _wceWireProfileTrigger(el, o.id);
    hostFor(o).appendChild(el);
  });

  _wceDeclutterOverlays();
}
function _wceDeclutterOverlays(){
  // Every thumbnail/text/toggle/action-button is positioned as a
  // percentage of its container, but sized in fixed pixels the artist
  // chose once -- so the same relative gap the artist designed at one
  // screen size shrinks in absolute terms on a smaller one while the
  // element itself doesn't, eventually clashing. This pass measures
  // every one's real, current on-screen box after normal CSS layout has
  // already placed it, and nudges any pair that overlaps (or falls under
  // a small buffer) apart -- purely a rendered offset layered on top of
  // the stored percentage position via left/top calc(), never touching
  // the artist's actual placement data. Skipped entirely while actively
  // dragging in the Designer's Edit mode, where precise, undisturbed
  // placement matters more than avoiding a clash a real visitor's screen
  // size might never even hit -- it still runs in Preview and the real
  // exported page, on load and on resize.
  if(window._wceDesignerEditMode) return;
  const SELECTOR = '.wce-overlay-thumb,.wce-overlay-text,.wce-overlay-action-btn,#sfx-toggle';
  const MIN_GAP = 4;
  const _s = window.__wceUiScale || 1;   // screen px -> stage px
  const _hid = new Set((_wceEffectiveOverlays() || []).filter(function(x){ return x && x.hidden; }).map(function(x){ return String(x.id); }));

  // Items inside a Group are positioned relative to that group's own
  // body, not the viewport -- so they can only ever clash with siblings
  // in the SAME group, never against free-floating items sitting in a
  // completely different coordinate space.
  const contexts = new Map();
  document.querySelectorAll(SELECTOR).forEach(el=>{
    if(el.id === 'sfx-toggle' && !el.dataset.wceBaseLeft) return;   // not placed yet (see _wceApplyChromeOverrides)
    if(el.dataset.overlayId && _hid.has(el.dataset.overlayId)) return;   // hidden elements are not part of the layout
    const groupBody = el.closest('.wce-shape-content,.wce-group-body');
    const key = groupBody || _wceRootHost();
    if(!contexts.has(key)) contexts.set(key, []);
    contexts.get(key).push(el);
  });

  contexts.forEach((els, key)=>{
    if(els.length < 2) return;
    // Capture each element's true, un-nudged percentage position exactly
    // once (right when it's fresh from buildThumbnailOverlays()) -- a
    // resize can re-run this on the SAME elements with no rebuild in
    // between, so this is what lets every pass start back from the
    // artist's real placement instead of compounding drift from the
    // previous pass's calc() offset.
    els.forEach(el=>{
      // The cached base is only valid until something else moves the element (the Designer after a drag, a theme
      // re-apply). A plain inline value that differs from the cache is the NEW placement -- only our own calc()
      // nudges are temporary. Without this, every pass in Preview snapped a dragged Sound back to where it began.
      const _curL = el.style.left, _curT = el.style.top;
      if(el.dataset.wceBaseLeft===undefined || (_curL && _curL.indexOf('calc(')!==0 && _curL !== el.dataset.wceBaseLeft)) el.dataset.wceBaseLeft = _curL;
      if(el.dataset.wceBaseTop===undefined  || (_curT && _curT.indexOf('calc(')!==0 && _curT !== el.dataset.wceBaseTop))  el.dataset.wceBaseTop  = _curT;
      // action buttons have transition:all -- without this the rect measured just below is still the old, nudged
      // position mid-animation, and each resize would compound the nudge
      el.style.transition = 'none';
      el.style.left = el.dataset.wceBaseLeft;
      el.style.top  = el.dataset.wceBaseTop;
    });

    // Where would each box sit in the Designer's own layout (the reference canvas)? Two that already overlapped THERE
    // were overlapped on purpose (elements can be layered), so they are left alone -- only a pair that was apart in
    // the Designer and collides on this screen gets pushed apart.
    const _refSz = (key && key !== _wceRootHost()) ? [key.offsetWidth, key.offsetHeight] : WCEUIS.refSize(window);
    const boxes = els.map(el=>{
      const r = el.getBoundingClientRect();
      const bl = el.dataset.wceBaseLeft, bt = el.dataset.wceBaseTop;
      const okRef = /%$/.test(bl || '') && /%$/.test(bt || '');
      return {el, x:r.left, y:r.top, w:r.width, h:r.height, dx:0, dy:0,
              rx: okRef ? parseFloat(bl) / 100 * _refSz[0] : NaN, ry: okRef ? parseFloat(bt) / 100 * _refSz[1] : NaN,
              rw: el.offsetWidth, rh: el.offsetHeight};
    });
    const _wasOverlappingInDesigner = function(a, b){
      if(!(isFinite(a.rx) && isFinite(b.rx))) return false;
      return Math.min(a.rx + a.rw, b.rx + b.rw) - Math.max(a.rx, b.rx) > 0 &&
             Math.min(a.ry + a.rh, b.ry + b.rh) - Math.max(a.ry, b.ry) > 0;
    };

    // A handful of relaxation passes -- resolving one overlapping pair
    // can introduce a new one with a neighbor, so this repeats until
    // nothing moved (or a small cap, so a pathological layout can never
    // loop indefinitely).
    for(let pass=0; pass<6; pass++){
      let moved = false;
      for(let i=0;i<boxes.length;i++){
        for(let j=i+1;j<boxes.length;j++){
          const a=boxes[i], b=boxes[j];
          if(_wasOverlappingInDesigner(a, b)) continue;   // layered on purpose in the Designer
          const ax1=a.x+a.dx, ay1=a.y+a.dy, ax2=ax1+a.w, ay2=ay1+a.h;
          const bx1=b.x+b.dx, by1=b.y+b.dy, bx2=bx1+b.w, by2=by1+b.h;
          const overlapX = Math.min(ax2,bx2) - Math.max(ax1,bx1);
          const overlapY = Math.min(ay2,by2) - Math.max(ay1,by1);
          if(overlapX > -MIN_GAP && overlapY > -MIN_GAP){
            // Push apart along whichever axis needs the smaller nudge to
            // clear -- the natural separation direction a person
            // decluttering these by hand would reach for.
            const needX = overlapX + MIN_GAP;
            const needY = overlapY + MIN_GAP;
            const acx=ax1+a.w/2, acy=ay1+a.h/2, bcx=bx1+b.w/2, bcy=by1+b.h/2;
            if(needX < needY){
              const dir = acx <= bcx ? -1 : 1;
              a.dx += dir*needX/2; b.dx -= dir*needX/2;
            } else {
              const dir = acy <= bcy ? -1 : 1;
              a.dy += dir*needY/2; b.dy -= dir*needY/2;
            }
            moved = true;
          }
        }
      }
      if(!moved) break;
    }

    boxes.forEach(b=>{
      if(b.dx || b.dy){
        b.el.style.left = 'calc(' + b.el.dataset.wceBaseLeft + ' + ' + (b.dx / _s).toFixed(1) + 'px)';
        b.el.style.top  = 'calc(' + b.el.dataset.wceBaseTop  + ' + ' + (b.dy / _s).toFixed(1) + 'px)';
      }
    });
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ els.forEach(el=>{ el.style.transition=''; }); }));
  });
}
let _wceDeclutterResizeAttached = false;
function _wceAttachDeclutterResizeListener(){
  if(_wceDeclutterResizeAttached) return;
  _wceDeclutterResizeAttached = true;
  let t = null;
  window.addEventListener('resize', ()=>{
    clearTimeout(t);
    t = setTimeout(_wceDeclutterOverlays, 150);
  });
}
function refreshActive(){
  qsa('.vc').forEach(b=>b.classList.toggle('active',b.dataset.v===activeV));
  qsa('.tb').forEach(b=>b.classList.remove('active'));
  Object.keys(geoSt).forEach(k=>{if(geoSt[k]){const btn=document.querySelector(`.tb[data-col="${k}"]`);if(btn)btn.classList.add('active');}  });
  _wceQueueThumbSync();
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
    // toBlob(), not toDataURL(): a data: URI base64-encodes the whole
    // image into one string, and mobile Safari/Chrome have historically
    // failed that download silently past a fairly small size ceiling --
    // exactly what showed up specifically on phone, on detailed/narrow-
    // FOV (interior, high focal length) shots, since those simply encode
    // to a bigger PNG than a plain wide exterior shot. A Blob holds the
    // raw binary directly with no such ceiling.
    renderer.domElement.toBlob(function(blob){
      if(!blob){ console.error('[WCE] Snapshot failed: toBlob returned null'); return; }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download='snapshot-'+Date.now()+'.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }catch(e){ console.error('[WCE] Snapshot failed:', e); }
}
let _wcePresentationActive=false;
let _wcePresentationIconHost=null;
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
          '.wce-overlay-group','.wce-overlay-shape','.wce-overlay-section-slider','.wce-overlay-action-btn'];
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
      _wcePresentationIconHost=_wcePresentationTriggerEl.querySelector('.wce-thumb-icon')||_wcePresentationTriggerEl;
      _wcePresentationTriggerOrigHTML=_wcePresentationIconHost.innerHTML;
      _wcePresentationIconHost.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg><span>Close</span>';
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
    (_wcePresentationIconHost||_wcePresentationTriggerEl).innerHTML=_wcePresentationTriggerOrigHTML; _wcePresentationIconHost=null;
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
