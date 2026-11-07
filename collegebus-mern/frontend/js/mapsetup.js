/* ===================== ADMIN: MAP SETUP =====================
   Lets the admin put every bus stop in the right place on the map.
   - Pick a route (one by one: Route 1, 2, 3 ...), see its stops in a list.
   - Pick a stop, then: search a place, paste a position from Google Maps,
     or just click on the map. Saved for good in the database.
   - Drag any dot to correct it. The blue line follows the real roads.
   Students and drivers never see this page; they only see the final map. */
(function () {
  const NAGPUR = [21.1458, 79.0882];
  let inited = false, items = [], cur = 0, statusList = [], selected = -1;
  let map = null, layers = [], line = null, tmpMarker = null;
  let pollTimer = null, refreshSeq = 0, roadSeq = 0, needFit = true, lastSearch = [];

  const $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stopName = i => (items[cur] && items[cur].stops[i]) || '';

  // Accepts "21.1234, 79.0123" and also what Google shows: "21.2477° N, 79.0502° E".
  function parseLatLng(text) {
    const m = String(text || '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?/);
    if (!m) return null;
    let lat = +m[1], lng = +m[3];
    if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
    if (m[4] && /w/i.test(m[4])) lng = -Math.abs(lng);
    if (!(lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98)) return null;
    return { lat, lng };
  }
  const nearNagpur = p => p.lat >= 20.5 && p.lat <= 21.8 && p.lng >= 78.5 && p.lng <= 79.6;

  // ---------- routes ----------
  async function loadRoutes() {
    const [buses, routes] = await Promise.all([DB.buses(), DB.routes()]);
    const byKey = new Map();
    const add = (label, stops) => {
      const names = (stops || []).map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
      if (names.length < 2) return;
      const key = names.join('|').toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { labels: [], stops: names });
      const e = byKey.get(key);
      if (label && !e.labels.includes(label)) e.labels.push(label);
    };
    buses.forEach(b => add(b.routeName || b.no, b.stops));
    routes.forEach(r => add(r.name, r.stops));
    items = Array.from(byKey.values()).map(e => ({ label: e.labels.join(' / ') || 'Route', stops: e.stops }));
    if (cur >= items.length) cur = 0;
    $('msRoute').innerHTML = items.map((it, i) =>
      '<option value="' + i + '">' + esc(it.label) + ' - ' + esc(it.stops[0]) + ' to ' + esc(it.stops[it.stops.length - 1]) + ' (' + it.stops.length + ' stops)</option>').join('');
    $('msRoute').value = String(cur);
  }

  function selectRoute(i) {
    if (!items.length) return;
    cur = Math.max(0, Math.min(items.length - 1, i));
    $('msRoute').value = String(cur);
    $('msCount').textContent = 'Route ' + (cur + 1) + ' of ' + items.length;
    selected = -1; needFit = true; statusList = [];
    if (tmpMarker && map) { map.removeLayer(tmpMarker); tmpMarker = null; }
    renderList(); renderMap(); refreshStatuses();
  }

  async function refreshStatuses() {
    const item = items[cur];
    if (!item) return;
    const seq = ++refreshSeq;
    clearTimeout(pollTimer);
    try {
      const res = await DB.resolveStops(item.stops);
      if (seq !== refreshSeq) return;
      statusList = res;
    } catch (e) {
      if (seq !== refreshSeq) return;
      toast('Could not load stop positions: ' + e.message, 'error');
      return;
    }
    if (selected < 0) selected = firstMissing(-1);
    renderList(); renderMap();
    if (statusList.some(r => r.status === 'pending')) pollTimer = setTimeout(refreshStatuses, 4000);
  }

  const isSet = i => statusList[i] && statusList[i].status === 'ok';
  function firstMissing(after) {
    const n = statusList.length;
    for (let k = 1; k <= n; k++) {
      const i = (after + k + n) % n;
      if (statusList[i] && statusList[i].status !== 'ok' && statusList[i].status !== 'pending') return i;
    }
    return -1;
  }

  // ---------- list ----------
  function renderList() {
    const box = $('msStops');
    const item = items[cur];
    if (!item) { box.innerHTML = '<div class="empty-note">No routes yet. Add a driver or a route first.</div>'; return; }
    let okCount = 0;
    box.innerHTML = item.stops.map((name, i) => {
      const r = statusList[i];
      let state, cls;
      if (!r || r.status === 'pending') { state = '… Searching'; cls = 'pend'; }
      else if (r.status === 'ok') { okCount++; state = r.manual ? '✔ Set by you' : '✔ Found automatically'; cls = 'ok'; }
      else { state = '✖ Not found - set it'; cls = 'miss'; }
      const btns = '<button class="btn-secondary btn-small" data-act="pick" data-i="' + i + '">' + (r && r.status === 'ok' ? 'Move' : 'Set on map') + '</button>' +
        (r && r.status === 'ok' && r.manual ? ' <button class="btn-secondary btn-small" data-act="reset" data-i="' + i + '" title="Forget my position and search again">Auto</button>' : '');
      return '<div class="ms-row' + (i === selected ? ' sel' : '') + '" data-act="pick" data-i="' + i + '">' +
        '<span class="ms-num">' + (i + 1) + '</span>' +
        '<div class="ms-name">' + esc(name) + '<small class="ms-state ' + cls + '">' + state + '</small></div>' +
        '<div class="ms-btns">' + btns + '</div></div>';
    }).join('');
    const total = item.stops.length;
    $('msSummary').innerHTML = statusList.length
      ? '<b>' + okCount + ' of ' + total + '</b> stops are on the map.' + (okCount < total ? ' Set the rest below.' : ' <span style="color:var(--green);">All set ✔</span>')
      : 'Loading…';
    $('msHint').innerHTML = selected >= 0
      ? 'Now place <b>' + (selected + 1) + '. ' + esc(stopName(selected)) + '</b>: search a place, paste a position from Google Maps, or click on the map.'
      : (statusList.length && okCount === total ? 'Every stop of this route is on the map. Drag a dot to correct it, or pick the next route.' : 'Pick a stop from the list.');
    renderResults();
  }

  function select(i) {
    selected = i;
    renderList();
    const r = statusList[i];
    if (r && r.status === 'ok' && map) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 15), { animate: false });
  }

  // ---------- map ----------
  function ensureMap() {
    if (map) return true;
    if (typeof L === 'undefined') {
      $('msMap').innerHTML = '<div class="empty-note" style="padding:24px;">Map could not load. Check your internet connection and refresh.</div>';
      return false;
    }
    map = L.map($('msMap'), { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(NAGPUR, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    map.on('click', e => onMapClick(e.latlng));
    return true;
  }

  function onMapClick(ll) {
    if (selected < 0) { toast('First pick a stop from the list on the left.', 'info'); return; }
    savePosition(selected, ll.lat, ll.lng, true);
  }

  function renderMap() {
    if (!map) return;
    layers.forEach(l => map.removeLayer(l));
    layers = [];
    if (line) { map.removeLayer(line); line = null; }
    const pts = [];
    statusList.forEach((r, i) => {
      if (!r || r.status !== 'ok') return;
      pts.push({ lat: r.lat, lng: r.lng });
      const last = i === statusList.length - 1;
      const cls = 'stop-dot' + (i === 0 || last ? ' end' : '') + (r.manual ? ' manual' : '') + (i === selected ? ' sel' : '');
      const icon = L.divIcon({ className: '', html: '<div class="' + cls + '">' + (i + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      const m = L.marker([r.lat, r.lng], { icon, draggable: true, zIndexOffset: i === selected ? 600 : 200 }).addTo(map);
      m.bindTooltip(esc((i + 1) + '. ' + stopName(i)), { direction: 'top', offset: [0, -12], className: 'stop-tip' });
      m.on('click', () => select(i));
      m.on('dragend', () => { const p = m.getLatLng(); savePosition(i, p.lat, p.lng, false); });
      layers.push(m);
    });
    if (needFit && pts.length) {
      if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 15, { animate: false });
      else map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [30, 30], animate: false });
      needFit = false;
    }
    drawLine(pts);
  }

  async function drawLine(pts) {
    if (pts.length < 2) return;
    const seq = ++roadSeq;
    let road = null;
    try { const out = await apiPost('/api/geo/route', { points: pts }); road = out && out.path && out.path.length > 1 ? out.path : null; } catch (e) { /* straight fallback */ }
    if (seq !== roadSeq || !map) return;
    if (line) map.removeLayer(line);
    line = road
      ? L.polyline(road, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map)
      : L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#2563eb', weight: 3, opacity: 0.55, dashArray: '6 8' }).addTo(map);
    if (line.bringToBack) line.bringToBack();
  }

  // ---------- saving ----------
  async function savePosition(i, lat, lng, advance) {
    const name = stopName(i);
    if (!name) return;
    try {
      await DB.setStopPosition(name, lat, lng);
      toast('Saved: ' + name, 'success');
      if (tmpMarker && map) { map.removeLayer(tmpMarker); tmpMarker = null; }
      if (advance) {
        // optimistic: show it as set, then jump to the next missing stop
        statusList[i] = { name, lat, lng, status: 'ok', manual: true };
        const next = firstMissing(i);
        selected = next;
      }
      await refreshStatuses();
    } catch (err) { toast(err.message, 'error'); await refreshStatuses(); }
  }

  async function resetStop(i) {
    try {
      await DB.resetStopPosition(stopName(i));
      toast('Searching automatically again for: ' + stopName(i), 'info');
      await refreshStatuses();
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- search ----------
  async function doSearch() {
    const q = $('msSearch').value.trim();
    if (q.length < 2) { toast('Type a place name to search.', 'info'); return; }
    $('msResults').innerHTML = '<div class="ms-note">Searching…</div>';
    try { lastSearch = await DB.searchPlaces(q); }
    catch (err) { lastSearch = []; $('msResults').innerHTML = '<div class="ms-note" style="color:var(--red);">' + esc(err.message) + '</div>'; return; }
    renderResults(true);
  }

  function renderResults(fromSearch) {
    const box = $('msResults');
    if (!lastSearch.length) { if (fromSearch) box.innerHTML = '<div class="ms-note">Nothing found. Try another spelling, or paste the position from Google Maps below.</div>'; return; }
    box.innerHTML = lastSearch.map((r, k) =>
      '<div class="ms-res"><span class="ms-res-name">' + esc(r.name) + '</span>' +
      '<button class="btn-secondary btn-small" data-act="view" data-k="' + k + '">Show</button> ' +
      '<button class="btn btn-primary btn-small" data-act="use" data-k="' + k + '"' + (selected < 0 ? ' disabled' : '') + '>Use for stop</button></div>').join('');
  }

  function showResult(k) {
    const r = lastSearch[k];
    if (!r || !ensureMap()) return;
    map.setView([r.lat, r.lng], 17, { animate: false });
    if (tmpMarker) map.removeLayer(tmpMarker);
    tmpMarker = L.marker([r.lat, r.lng]).addTo(map);
    tmpMarker.bindTooltip('Search result', { permanent: true, direction: 'top' });
  }

  function useLatLng() {
    if (selected < 0) { toast('First pick a stop from the list on the left.', 'info'); return; }
    const p = parseLatLng($('msLatLng').value);
    if (!p) { toast('Could not read that position. Paste it like 21.1234, 79.0123 or 21.1234° N, 79.0123° E (right-click the place in Google Maps and click the numbers to copy).', 'error'); return; }
    if (!nearNagpur(p) && !confirm('This position is far from Nagpur. Use it anyway?')) return;
    $('msLatLng').value = '';
    savePosition(selected, p.lat, p.lng, true);
  }

  // ---------- wiring ----------
  function wire() {
    $('msRoute').addEventListener('change', () => selectRoute(parseInt($('msRoute').value, 10)));
    $('msPrev').addEventListener('click', () => selectRoute(cur - 1));
    $('msNext').addEventListener('click', () => selectRoute(cur + 1));
    $('msSearchBtn').addEventListener('click', doSearch);
    $('msSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    $('msUseLatLng').addEventListener('click', useLatLng);
    $('msLatLng').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); useLatLng(); } });
    $('msStops').addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const i = parseInt(el.dataset.i, 10);
      if (el.dataset.act === 'reset') { e.stopPropagation(); resetStop(i); }
      else select(i);
    });
    $('msResults').addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const k = parseInt(el.dataset.k, 10);
      if (el.dataset.act === 'view') showResult(k);
      else if (el.dataset.act === 'use' && selected >= 0 && lastSearch[k]) savePosition(selected, lastSearch[k].lat, lastSearch[k].lng, true);
    });
  }

  async function show() {
    try {
      if (!inited) { wire(); inited = true; }
      await new Promise(r => setTimeout(r, 30)); // let the page become visible first
      if (!ensureMap()) return;
      map.invalidateSize();
      await loadRoutes();
      selectRoute(cur);
    } catch (err) { toast('Map Setup could not load: ' + err.message, 'error'); }
  }

  window.MapSetup = { show, parseLatLng };
})();
