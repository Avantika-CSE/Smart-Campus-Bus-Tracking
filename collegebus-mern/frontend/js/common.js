/* ===================== SHARED UTILITIES ===================== */

function toast(message, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/* Redirects to login if not authenticated, or if role doesn't match.
   Call at the top of every dashboard page. */
function requireRole(role) {
  const user = DB.currentUser();
  if (!user || user.role !== role) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

function logout() {
  DB.clearSession();
  window.location.href = 'index.html';
}

function initials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ================= Professional animated route-performance chart =================
   Dependency-free canvas chart: grouped bars (On Time / Delayed / Cancelled),
   axis + gridlines, legend, hover tooltip, smooth entrance animation, and a
   subtle periodic "live data" pulse - all offline, no external libraries. */
function clampPct(v) { return Math.max(0, Math.min(100, v)); }

function shortRouteLabel(name) { return name.split(' (')[0]; }

function makeBarChart(canvas, routes) {
  const ctx = canvas.getContext('2d');
  const wrapper = canvas.parentElement;
  wrapper.style.position = 'relative';

  let tip = wrapper.querySelector('.chart-tooltip');
  if (!tip) { tip = el('<div class="chart-tooltip"></div>'); wrapper.appendChild(tip); }

  let dpr = window.devicePixelRatio || 1;
  let W = 0, H = 220;
  let labels = routes.map(r => shortRouteLabel(r.name));
  let target = routes.map(r => ({ onTime: r.perf.onTime, delayed: r.perf.delayed, cancelled: r.perf.cancelled }));
  let display = target.map(() => ({ onTime: 0, delayed: 0, cancelled: 0 })); // entrance animation starts at 0

  function resize() {
    const rect = wrapper.getBoundingClientRect();
    W = Math.max(rect.width, 260);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function roundRect(x, y, w, h, r) {
    if (h <= 0) h = 0.001;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const padL = 36, padR = 10, padT = 8, padB = 26;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const chartW = W - padL - padR, chartH = H - padT - padB;

    ctx.strokeStyle = '#e6ebf3';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(v => {
      const y = padT + chartH - (v / 100) * chartH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(v + '%', padL - 8, y);
    });

    const groupW = chartW / Math.max(labels.length, 1);
    const barW = Math.min(16, groupW / 5);

    labels.forEach((lab, i) => {
      const gx = padL + groupW * i + groupW / 2;
      const d = display[i];
      const bars = [['onTime', '#16a34a'], ['delayed', '#e8940c'], ['cancelled', '#e23b3b']];
      bars.forEach(([key, color], bi) => {
        const val = d[key];
        const bh = (val / 100) * chartH;
        const bx = gx - (barW * 1.5) + bi * (barW + 4);
        ctx.fillStyle = color;
        roundRect(bx, padT + chartH - bh, barW, bh, 3);
        ctx.fill();
      });
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '11px Segoe UI, Arial, sans-serif';
      ctx.fillText(lab, gx, padT + chartH + 8);
    });
  }

  function tick() {
    display.forEach((d, i) => {
      ['onTime', 'delayed', 'cancelled'].forEach(k => {
        const diff = (target[i] ? target[i][k] : 0) - d[k];
        d[k] += Math.abs(diff) > 0.08 ? diff * 0.14 : diff;
      });
    });
    draw();
    canvas.__raf = requestAnimationFrame(tick);
  }
  tick();

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const chartW = W - padL - padR;
    const groupW = chartW / Math.max(labels.length, 1);
    const idx = Math.floor((x - padL) / groupW);
    if (idx < 0 || idx >= labels.length) { tip.style.display = 'none'; return; }
    const d = target[idx];
    tip.innerHTML = '<b>' + labels[idx] + '</b><br>On Time: ' + Math.round(d.onTime) + '%<br>Delayed: ' + Math.round(d.delayed) + '%<br>Cancelled: ' + Math.round(d.cancelled) + '%';
    tip.style.left = Math.min(x + 12, W - 130) + 'px';
    tip.style.top = '4px';
    tip.style.display = 'block';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  return {
    update(newRoutes) {
      labels = newRoutes.map(r => shortRouteLabel(r.name));
      const newTarget = newRoutes.map(r => ({ onTime: r.perf.onTime, delayed: r.perf.delayed, cancelled: r.perf.cancelled }));
      if (display.length !== newTarget.length) display = newTarget.map(() => ({ onTime: 0, delayed: 0, cancelled: 0 }));
      target = newTarget;
    }
  };
}

/* Builds (or reuses) the chart inside `container`, and wires a periodic
   subtle jitter so the graph feels like it's receiving live data, then
   settles back to the real figures - all purely visual, data is untouched. */
function renderPerfChart(container, routes) {
  if (!container.__chart) {
    container.innerHTML =
      '<div class="chart-legend-row">' +
        '<span class="lg"><span class="sw" style="background:#16a34a;"></span>On Time</span>' +
        '<span class="lg"><span class="sw" style="background:#e8940c;"></span>Delayed</span>' +
        '<span class="lg"><span class="sw" style="background:#e23b3b;"></span>Cancelled</span>' +
        '<span class="live"><span class="live-pulse-dot"></span>Live</span>' +
      '</div>' +
      '<canvas></canvas>';
    const canvas = container.querySelector('canvas');
    container.__chart = makeBarChart(canvas, routes);
    container.__baseRoutes = routes;

    container.__pulseTimer = setInterval(() => {
      const base = container.__baseRoutes;
      const jittered = base.map(r => ({
        name: r.name,
        perf: {
          onTime: clampPct(r.perf.onTime + (Math.random() * 4 - 2)),
          delayed: clampPct(r.perf.delayed + (Math.random() * 2 - 1)),
          cancelled: clampPct(r.perf.cancelled + (Math.random() * 1 - 0.5))
        }
      }));
      container.__chart.update(jittered);
      setTimeout(() => { if (container.__chart) container.__chart.update(container.__baseRoutes); }, 900);
    }, 6000);
  } else {
    container.__baseRoutes = routes;
    container.__chart.update(routes);
  }
}

/* ===================== LIVE MAP (Leaflet + OpenStreetMap) =====================
   Real street map of Nagpur.
   - Every stop is a NUMBERED dot (same numbers as the stop list). Hover or
     tap a dot to see the stop name. Start and destination are always labelled.
   - The blue line follows the real ROADS between the stops.
   - The bus marker JUMPS from stop to stop (no sliding) as the server advances
     it, and returns to the first stop when the route is ended.
   - Map positions are found automatically from the stop names, so a new
     driver / route / stop shows up on the map by itself. A stop whose
     position can't be found is skipped (and listed in a note on the map).
   Same function names as before so every page keeps working:
     buildMapHTML(id, ...)  -> returns the map's container markup
     updateMapBus(id, stopIndex, statusText, pathArray, status)           */
const LIVE_MAPS = {};
const NAGPUR_CENTER = [21.1458, 79.0882];

function buildMapHTML(id, destinationLabel, pathArray) {
  const path = pathArray || ROUTE_PATH;
  // The container doesn't exist until the caller sets innerHTML, so start
  // the map on the next tick.
  setTimeout(() => initLiveMap(id, path), 0);
  return '<div class="live-map" id="' + id + '"></div>';
}

function hasLiveMap(id) { return !!LIVE_MAPS[id]; }

let leafletLoading = null;
function loadLeafletFallback() {
  if (typeof L !== 'undefined') return Promise.resolve(true);
  if (!leafletLoading) {
    leafletLoading = new Promise(resolve => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      js.onload = () => resolve(typeof L !== 'undefined');
      js.onerror = () => resolve(false);
      document.head.appendChild(js);
      setTimeout(() => resolve(typeof L !== 'undefined'), 12000);
    });
  }
  return leafletLoading;
}

function escHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initLiveMap(id, path) {
  const box = document.getElementById(id);
  if (!box) return;
  if (typeof L === 'undefined') {
    // The map library did not load (some networks block one CDN): try a second one.
    box.innerHTML = '<div class="empty-note" style="padding:24px;">Loading map…</div>';
    loadLeafletFallback().then(ok => {
      if (ok) return initLiveMap(id, path);
      box.innerHTML = '<div class="empty-note" style="padding:24px;">Map could not load. Please check your internet connection. ' +
        '<a href="#" class="link-blue" data-retry-map="1">Try again</a></div>';
      const a = box.querySelector('[data-retry-map]');
      if (a) a.addEventListener('click', e => { e.preventDefault(); leafletLoading = null; initLiveMap(id, path); });
    });
    return;
  }
  if (LIVE_MAPS[id]) { try { LIVE_MAPS[id].map.remove(); } catch (e) { /* old map already gone */ } delete LIVE_MAPS[id]; }

  const map = L.map(box, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(NAGPUR_CENTER, 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const entry = {
    id, map,
    names: path.map(p => p.name),
    coords: path.map(() => null),
    missing: [],              // names whose position could not be found
    layers: [], line: null, busMarker: null, noteCtl: null,
    roadPath: null, roadSig: '', roadBusy: false,
    state: { stopIndex: 0, text: '', status: 'idle' },
    fitted: false, width: 0, tries: 0, sig: ''
  };
  LIVE_MAPS[id] = entry;
  loadStopPositions(entry);
  redrawLiveMap(entry);
}

async function loadStopPositions(entry) {
  if (LIVE_MAPS[entry.id] !== entry) return; // map was replaced
  try {
    const results = await DB.resolveStops(entry.names);
    if (LIVE_MAPS[entry.id] !== entry) return;
    let pending = false;
    entry.missing = [];
    results.forEach((r, i) => {
      if (r.status === 'ok') entry.coords[i] = { lat: r.lat, lng: r.lng };
      else if (r.status === 'pending') pending = true;
      else entry.missing.push(r.name);
    });
    loadRoadPath(entry);
    redrawLiveMap(entry);
    if (pending && ++entry.tries < 40) setTimeout(() => loadStopPositions(entry), 4000);
  } catch (e) {
    if (++entry.tries < 5) setTimeout(() => loadStopPositions(entry), 5000);
  }
}

// Asks the backend for the road path through all stops that have a position.
async function loadRoadPath(entry) {
  const pts = entry.coords.filter(c => !!c);
  const sig = pts.map(c => c.lat.toFixed(5) + ',' + c.lng.toFixed(5)).join('|');
  if (pts.length < 2 || sig === entry.roadSig || entry.roadBusy) return;
  entry.roadBusy = true;
  try {
    const out = await apiPost('/api/geo/route', { points: pts });
    if (LIVE_MAPS[entry.id] !== entry) return;
    entry.roadSig = sig;
    entry.roadPath = (out && out.path && out.path.length > 1) ? out.path : null;
    entry.sig = ''; // force a redraw
    redrawLiveMap(entry);
  } catch (e) { /* keep the straight fallback line */ }
  finally { entry.roadBusy = false; }
}

function liveMapStopReached(entry, i) {
  const st = entry.state;
  return st.status === 'completed' || (st.status === 'running' && i <= st.stopIndex);
}

function busPositionFor(entry) {
  const n = entry.coords.length;
  let i = Math.min(entry.state.stopIndex, n - 1);
  while (i >= 0 && !entry.coords[i]) i--;          // nearest earlier stop we have a position for
  if (i < 0) i = entry.coords.findIndex(c => !!c);  // else the first one we do have
  return i >= 0 ? entry.coords[i] : null;
}

function liveMapNote(entry) {
  const text = entry.missing.length
    ? 'Not shown on map (position not found): ' + entry.missing.map(escHtml).join(', ')
    : '';
  if (!text) { if (entry.noteCtl) { entry.map.removeControl(entry.noteCtl); entry.noteCtl = null; } return; }
  if (!entry.noteCtl) {
    entry.noteCtl = L.control({ position: 'bottomleft' });
    entry.noteCtl.onAdd = () => { const d = L.DomUtil.create('div', 'map-note'); entry.noteEl = d; return d; };
    entry.noteCtl.addTo(entry.map);
  }
  if (entry.noteEl) entry.noteEl.innerHTML = text;
}

function redrawLiveMap(entry) {
  const map = entry.map;
  const box = map.getContainer();

  // The map is built while its tab can still be hidden (size 0); fix the
  // size once it becomes visible.
  if (box.offsetWidth > 0 && entry.width !== box.offsetWidth) {
    entry.width = box.offsetWidth;
    map.invalidateSize();
    entry.fitted = false;
  }

  // Only rebuild the stop dots + line when something about them changed
  // (new positions found, a stop reached, route started/ended, map resized),
  // so hover tooltips don't flicker on every 2-second refresh.
  const sig = entry.coords.map(c => (c ? 1 : 0)).join('') + '|' + entry.state.status + '|' +
    (entry.state.status === 'running' ? entry.state.stopIndex : 0) + '|' + entry.width + '|' +
    (entry.roadPath ? entry.roadPath.length : 0) + '|' + entry.missing.length;
  const rebuild = sig !== entry.sig;
  entry.sig = sig;

  const pts = entry.coords.filter(c => !!c).map(c => [c.lat, c.lng]);

  if (rebuild) {
    entry.layers.forEach(l => map.removeLayer(l));
    entry.layers = [];
    if (entry.line) { map.removeLayer(entry.line); entry.line = null; }

    // the route line: real roads when available, otherwise a dashed straight line
    if (pts.length > 1) {
      entry.line = entry.roadPath
        ? L.polyline(entry.roadPath, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map)
        : L.polyline(pts, { color: '#2563eb', weight: 3, opacity: 0.55, dashArray: '6 8' }).addTo(map);
    }

    // numbered stop dots (drawn above the line)
    const lastIdx = entry.coords.length - 1;
    entry.coords.forEach((c, i) => {
      if (!c) return;
      const isEnd = i === 0 || i === lastIdx;
      const reached = liveMapStopReached(entry, i);
      const cls = 'stop-dot' + (isEnd ? ' end' : '') + (reached ? ' reached' : '');
      const icon = L.divIcon({ className: '', html: '<div class="' + cls + '">' + (i + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      const label = (i + 1) + '. ' + entry.names[i] + (i === 0 ? ' (Start)' : (i === lastIdx ? ' (Destination)' : ''));
      const m = L.marker([c.lat, c.lng], { icon, zIndexOffset: isEnd ? 400 : 200 }).addTo(map);
      m.bindTooltip(escHtml(label), { direction: 'top', offset: [0, -12], permanent: isEnd, className: 'stop-tip' });
      m.bindPopup('<b>' + escHtml(label) + '</b>');
      entry.layers.push(m);
    });
    liveMapNote(entry);
  }

  if (!entry.fitted && pts.length > 1 && box.offsetWidth > 0) {
    map.fitBounds(L.latLngBounds(entry.roadPath || pts), { padding: [30, 30], animate: false });
    entry.fitted = true;
  }

  const pos = busPositionFor(entry);
  if (!pos) return;
  const running = entry.state.status === 'running';
  const icon = L.divIcon({
    className: 'bus-pin' + (running ? '' : ' idle'),
    html: '<div class="bus-pin-icon">🚌</div>', iconSize: [34, 34], iconAnchor: [17, 17]
  });
  if (!entry.busMarker) {
    entry.busMarker = L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    entry.busMarker.bindTooltip(entry.state.text || 'Bus', { permanent: true, direction: 'top', offset: [0, -18], className: 'bus-tip' });
  } else {
    entry.busMarker.setLatLng([pos.lat, pos.lng]);   // instant jump, no sliding
    entry.busMarker.setIcon(icon);
    entry.busMarker.setTooltipContent(entry.state.text || 'Bus');
  }
}

function updateMapBus(id, stopIndex, statusText, pathArray, status) {
  const entry = LIVE_MAPS[id];
  if (!entry) return;
  let st = status;
  if (!st) st = /not started|idle/i.test(statusText || '') ? 'idle' : (/arrived/i.test(statusText || '') ? 'completed' : 'running');
  entry.state = { stopIndex, text: statusText || '', status: st };
  redrawLiveMap(entry);
}

/* Kept for compatibility with the pages: a route's stops -> map waypoints. */
function buildRouteWaypoints(stops) {
  return stops.map(s => ({ name: s.name }));
}


const NOTIF_COLORS = { success: '#16a34a', info: '#2563eb', warning: '#e8940c', orange: '#e8940c', purple: '#8544d6', danger: '#e23b3b' };
const NOTIF_ICONS = { success: '✓', info: 'ℹ', warning: '⚠', orange: '⚠', purple: '⇄', danger: '!' };

function notifRowHtml(n) {
  const color = NOTIF_COLORS[n.type] || '#2563eb';
  const ic = NOTIF_ICONS[n.type] || 'ℹ';
  return '<div class="notif-row' + (n.read === false ? ' unread' : '') + '">' +
    '<div class="notif-dot" style="background:' + color + '">' + ic + '</div>' +
    '<div><div class="t">' + escHtml(n.title) + '</div><div class="d">' + escHtml(n.desc) + '</div></div>' +
    '<div class="time">' + escHtml(n.time) + '</div></div>';
}

// The red numbers on the bell and the menu count only UNREAD notifications
// and disappear when there is nothing new.
function setNotifBadges(list) {
  const n = (list || []).filter(x => x.read === false).length;
  ['sideNotifBadge', 'topNotifBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : n;
    el.style.display = n ? '' : 'none';
  });
}

// Opening the Notifications page marks everything as read after a few
// seconds (so the new ones are still highlighted for a moment).
let notifReadTimer = null;
function scheduleMarkRead(rerender) {
  clearTimeout(notifReadTimer);
  notifReadTimer = setTimeout(async () => {
    try { await DB.markNotificationsRead(); } catch (e) { return; }
    if (rerender) rerender();
  }, 3000);
}
function cancelMarkRead() { clearTimeout(notifReadTimer); }


/* ===== Phone menu =====
   On small screens the left menu is hidden until the ☰ button is pressed.
   Added automatically to every page that has a .sidebar and a .topbar
   (student, driver, admin dashboards). */
(function () {
  function initMobileMenu() {
    const side = document.querySelector('.sidebar');
    const bar = document.querySelector('.topbar');
    if (!side || !bar || document.getElementById('menuBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'menuBtn'; btn.className = 'menu-btn'; btn.type = 'button';
    btn.setAttribute('aria-label', 'Open menu'); btn.setAttribute('aria-expanded', 'false');
    btn.textContent = '☰';
    bar.insertBefore(btn, bar.firstChild);

    const back = document.createElement('div');
    back.id = 'sidebarBackdrop'; back.className = 'sidebar-backdrop';
    document.body.appendChild(back);

    function setOpen(open) {
      side.classList.toggle('open', open);
      back.classList.toggle('show', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? '✕' : '☰';
    }
    btn.addEventListener('click', () => setOpen(!side.classList.contains('open')));
    back.addEventListener('click', () => setOpen(false));
    side.addEventListener('click', e => { if (e.target.closest && e.target.closest('.nav-item')) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    window.addEventListener('resize', () => { if (window.innerWidth > 980) setOpen(false); });

    // Wide tables scroll sideways inside their card on a phone: say so (shown only on small screens).
    document.querySelectorAll('.card table').forEach(t => {
      if (t.previousElementSibling && t.previousElementSibling.classList.contains('table-hint')) return;
      const h = document.createElement('div');
      h.className = 'table-hint'; h.textContent = '← Swipe sideways to see all columns →';
      t.parentNode.insertBefore(h, t);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMobileMenu);
  else initMobileMenu();
})();
