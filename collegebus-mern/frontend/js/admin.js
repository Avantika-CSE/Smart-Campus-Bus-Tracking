(function () {
  const user = requireRole('admin');
  if (!user) return;

  const BUS_ID = 'B1';
  let trackedBusId = 'B1';
  let busesCache = [];

  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });
  document.querySelectorAll('[data-goto]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.goto));
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);

  function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    if (name === 'tracking') renderTrackingMap();
    if (name === 'mapsetup' && window.MapSetup) window.MapSetup.show();
    if (name === 'notifications') scheduleMarkRead(render); else cancelMarkRead();
  }

  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('dateLabel').textContent = todayLabel();

  function renderMapInto(holderId, mapId) {
    const holder = document.getElementById(holderId);
    if (holder && !holder.dataset.built) {
      holder.innerHTML = buildMapHTML(mapId, 'Main Stop');
      holder.dataset.built = '1';
    }
  }
  renderMapInto('mapHolder', 'map');

  // ---------- Live Tracking (every bus - demo Route 1 + every driver's own bus) ----------
  const trackSelect = document.getElementById('trackRouteSelect');

  function populateTrackSelect() {
    trackSelect.innerHTML = '';
    busesCache.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.busId;
      opt.textContent = b.routeName + (b.busId === 'B1' ? ' (Demo)' : '') + ' - ' + b.driverName;
      trackSelect.appendChild(opt);
    });
    trackSelect.value = trackedBusId;
  }

  trackSelect.addEventListener('change', () => {
    trackedBusId = trackSelect.value;
    const holder = document.getElementById('mapHolderBig');
    holder.innerHTML = '';
    delete holder.dataset.built;
    renderTrackingMap();
  });

  async function renderTrackingMap() {
    const bus = busesCache.find(b => b.busId === trackedBusId);
    if (!bus) return;
    const path = bus.busId === 'B1' ? ROUTE_PATH : buildRouteWaypoints(bus.stops);
    const destLabel = bus.destLabel + '<br>(Destination)';
    const startLabel = bus.startLabel + '<br>(Start)';

    const holder = document.getElementById('mapHolderBig');
    if (!holder.dataset.built) {
      holder.innerHTML = buildMapHTML('mapBig', destLabel, path, startLabel);
      holder.dataset.built = '1';
    }
    const progress = await DB.progressFor(bus.busId);
    const curPoint = bus.stops[Math.min(progress.stopIndex, bus.stops.length - 1)];
    const label = progress.status === 'idle' ? 'Bus - Not started' : progress.status === 'completed' ? 'Bus - Arrived' : 'Bus (' + bus.no + ') - Near ' + curPoint.name;
    updateMapBus('mapBig', progress.stopIndex, label, path, progress.status);
  }

  // ---------- Modals ----------
  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.open)));
  document.getElementById('openAddBus').addEventListener('click', () => openModal('modalAddBus'));
  document.getElementById('openAddRoute').addEventListener('click', () => openModal('modalAddRoute'));
  document.getElementById('openAddDriver').addEventListener('click', () => openModal('modalAddDriver'));
  document.getElementById('openSendNotif').addEventListener('click', () => openModal('modalSendNotif'));
  document.getElementById('markAllRead').addEventListener('click', async () => { try { await DB.markNotificationsRead(); } catch (e) { /* ignore */ } render(); });

  document.getElementById('saveNewBus').addEventListener('click', async () => {
    const no = document.getElementById('nbNo').value.trim();
    const routeName = document.getElementById('nbRoute').value.trim();
    const departure = document.getElementById('nbDeparture').value.trim();
    const driverName = document.getElementById('nbDriver').value.trim();
    const contact = document.getElementById('nbContact').value.trim();
    const errEl = document.getElementById('nbErr');
    errEl.textContent = '';
    if (!no || !routeName) { errEl.textContent = 'Bus number and route name are required.'; return; }
    try {
      await DB.addBus({ no, routeName, departure, driverName, contact });
      ['nbNo', 'nbRoute', 'nbDeparture', 'nbDriver', 'nbContact'].forEach(id => document.getElementById(id).value = '');
      closeModal('modalAddBus');
      toast('Bus added.', 'success');
      render();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('saveNewDriver').addEventListener('click', async () => {
    const val = id => document.getElementById(id).value.trim();
    const errEl = document.getElementById('dvErr');
    errEl.textContent = '';
    const btn = document.getElementById('saveNewDriver');
    btn.disabled = true;
    try {
      const d = await DB.addDriver({
        driverName: val('dvName'), driverEmail: val('dvEmail'), phone: val('dvPhone'),
        driverUniqueId: val('dvUid'), busNo: val('dvBusNo'), routeName: val('dvRoute'),
        departure: val('dvDeparture'), stops: val('dvStops')
      });
      ['dvName', 'dvEmail', 'dvPhone', 'dvUid', 'dvBusNo', 'dvRoute', 'dvDeparture', 'dvStops'].forEach(id => document.getElementById(id).value = '');
      closeModal('modalAddDriver');
      const note = document.getElementById('driverAddedNote');
      note.style.display = 'block';
      note.innerHTML = '<b>Driver added.</b> Give the driver these sign-in details:<br>' +
        'Name: <b>' + d.name + '</b> &nbsp;|&nbsp; Unique ID: <b>' + d.uid + '</b> &nbsp;|&nbsp; Email: <b>' + d.email + '</b>';
      toast('Driver added: ' + d.uid, 'success');
      render();
    } catch (err) {
      errEl.textContent = err.message;
    }
    btn.disabled = false;
  });

  document.getElementById('saveNewRoute').addEventListener('click', async () => {
    const name = document.getElementById('nrName').value.trim();
    const stopsRaw = document.getElementById('nrStops').value.trim();
    const errEl = document.getElementById('nrErr');
    errEl.textContent = '';
    if (!name || !stopsRaw) { errEl.textContent = 'Route name and stops are required.'; return; }
    try {
      await DB.addRoute({ name, stops: stopsRaw });
      document.getElementById('nrName').value = ''; document.getElementById('nrStops').value = '';
      closeModal('modalAddRoute');
      toast('Route added.', 'success');
      render();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('saveNewNotif').addEventListener('click', async () => {
    const role = document.getElementById('snRole').value;
    const title = document.getElementById('snTitle').value.trim();
    const desc = document.getElementById('snDesc').value.trim();
    const errEl = document.getElementById('snErr');
    errEl.textContent = '';
    if (!title || !desc) { errEl.textContent = 'Title and message are required.'; return; }
    try {
      await DB.sendNotification({ role, title, desc });
      document.getElementById('snTitle').value = ''; document.getElementById('snDesc').value = '';
      closeModal('modalSendNotif');
      toast('Notification sent to ' + role + 's.', 'success');
      render();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  window.removeBus = async function (id) {
    if (!confirm('Remove this bus?')) return;
    try { await DB.removeBus(id); render(); } catch (err) { toast(err.message, 'error'); }
  };
  window.removeRoute = async function (id) {
    if (!confirm('Remove this route?')) return;
    try { await DB.removeRoute(id); render(); } catch (err) { toast(err.message, 'error'); }
  };
  window.removeDriver = async function (uid) {
    if (!confirm('Remove this driver together with their bus and route?')) return;
    try { await DB.removeDriver(uid); render(); } catch (err) { toast(err.message, 'error'); }
  };
  window.removeUser = async function (id) {
    if (!confirm('Remove this user?')) return;
    try { await DB.removeUser(id); render(); } catch (err) { toast(err.message, 'error'); }
  };

  // ---------- Settings ----------
  async function loadSettings() {
    const s = await DB.settings();
    document.getElementById('setCollegeName').value = s.collegeName;
    document.getElementById('setOfficeContact').value = s.officeContact;
    document.getElementById('setInterval').value = s.interval;
  }
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    try {
      await DB.saveSettings({
        collegeName: document.getElementById('setCollegeName').value.trim(),
        officeContact: document.getElementById('setOfficeContact').value.trim(),
        interval: Number(document.getElementById('setInterval').value) || 6
      });
      toast('Settings saved.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // ---------- Map status of stops (so the admin knows what the map could not find) ----------
  let stopStatus = {};   // lower-case stop name -> 'ok' | 'pending' | 'missing'
  const keyOfStop = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function mapNote(stops) {
    const names = (stops || []).map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
    if (!names.length) return '';
    let ok = 0, pending = 0; const missing = [];
    names.forEach(n => {
      const st = stopStatus[keyOfStop(n)];
      if (st === 'ok') ok++; else if (st === 'missing') missing.push(n); else pending++;
    });
    if (pending && !missing.length) return '<div class="table-note">🗺️ Finding stops on the map… (' + ok + '/' + names.length + ' found)</div>';
    if (!missing.length) return '<div class="table-note" style="color:var(--green);">🗺️ All ' + names.length + ' stops are on the map</div>';
    return '<div class="table-note" style="color:var(--orange);">🗺️ ' + ok + '/' + names.length + ' stops on the map. Not found: <b>' + missing.join(', ') +
      '</b>. Open <b>Map Setup</b> (left menu) to place them.</div>';
  }

  async function refreshStopStatus(buses, routes, drivers) {
    const names = new Set();
    (buses || []).forEach(b => (b.stops || []).forEach(s => names.add(s.name)));
    (routes || []).forEach(r => (r.stops || []).forEach(s => names.add(s.name)));
    (drivers || []).forEach(d => (d.stops || []).forEach(n => names.add(n)));
    const list = Array.from(names).filter(Boolean);
    for (let i = 0; i < list.length; i += 60) {
      try {
        const res = await DB.resolveStops(list.slice(i, i + 60));
        res.forEach(r => { stopStatus[keyOfStop(r.name)] = r.status; });
      } catch (e) { /* try again on the next refresh */ }
    }
  }
  let stopStatusBusy = false, lastStopStatusAt = 0;
  function maybeRefreshStopStatus(buses, routes, drivers) {
    const anyPending = [...(buses || []).flatMap(b => (b.stops || []).map(s => s.name)), ...(drivers || []).flatMap(d => d.stops || [])]
      .some(n => !stopStatus[keyOfStop(n)] || stopStatus[keyOfStop(n)] === 'pending');
    const wait = anyPending ? 4000 : 30000;
    if (stopStatusBusy || Date.now() - lastStopStatusAt < wait) return;
    stopStatusBusy = true;
    refreshStopStatus(buses, routes, drivers).finally(() => { stopStatusBusy = false; lastStopStatusAt = Date.now(); });
  }

  // ---------- Jump here from the search box ----------
  let hlKey = null, hlUntil = 0, hlScrolled = false;
  function applyHighlight() {
    document.querySelectorAll('tr.row-hl').forEach(r => { if (r.dataset.hl !== hlKey || Date.now() > hlUntil) r.classList.remove('row-hl'); });
    if (!hlKey || Date.now() > hlUntil) return;
    const row = Array.from(document.querySelectorAll('[data-hl]')).find(r => r.dataset.hl === hlKey);
    if (!row) return;
    row.classList.add('row-hl');
    if (!hlScrolled) { hlScrolled = true; row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  window.adminGoTo = function (section, key) {
    hlKey = key || null; hlUntil = Date.now() + 8000; hlScrolled = false;
    showSection(section);
    setTimeout(applyHighlight, 50);
  };

  // ---------- Render ----------
  async function render() {
    const [buses, routes, users, progress, adminNotifs, drivers] = await Promise.all([
      DB.buses(), DB.routes(), DB.users(), DB.progressFor(BUS_ID), DB.notifications('admin'), DB.drivers()
    ]);
    busesCache = buses;
    populateTrackSelect();
    maybeRefreshStopStatus(buses, routes, drivers);

    const bus1 = buses.find(b => b.busId === BUS_ID);

    document.getElementById('statTotalBuses').textContent = buses.length;
    document.getElementById('statBusesSub').textContent = 'Active: ' + buses.filter(b => b.status !== 'Offline' && !b.inMaintenance).length + ' | Maintenance: ' + buses.filter(b => b.inMaintenance).length;
    document.getElementById('statTotalRoutes').textContent = routes.length;
    document.getElementById('statRoutesSub').textContent = 'Active: ' + routes.filter(r => r.active).length + ' | Inactive: ' + routes.filter(r => !r.active).length;
    document.getElementById('statTotalStudents').textContent = users.filter(u => u.role === 'student').length;
    document.getElementById('statTotalDrivers').textContent = users.filter(u => u.role === 'driver').length;
    document.getElementById('statDriversSub').textContent = 'On Duty: ' + (progress.status === 'running' ? 1 : 0) + ' | Off Duty: ' + (users.filter(u => u.role === 'driver').length - (progress.status === 'running' ? 1 : 0));

    if (bus1 && hasLiveMap('map')) {
      const curPoint = ROUTE_PATH[Math.min(progress.stopIndex, ROUTE_PATH.length - 1)];
      const lbl = progress.status === 'idle' ? 'Bus 1 (' + bus1.no + ') - Not started' : progress.status === 'completed' ? 'Bus 1 - Arrived' : 'Bus 1 (' + bus1.no + ') - Near ' + curPoint.name;
      updateMapBus('map', progress.stopIndex, lbl, undefined, progress.status);
    }
    renderTrackingMap();

    renderPerfChart(document.getElementById('perfChart'), routes);
    renderPerfChart(document.getElementById('perfChartBig'), routes);

    document.getElementById('busesOverviewBody').innerHTML = buses.slice(0, 8).map(b =>
      '<tr><td><b>' + b.no + '</b></td><td>' + b.routeName + '</td><td><span class="pill ' + b.status.toLowerCase().replace(' ', '-') + '">' + b.status + '</span></td><td>' + b.location + '</td></tr>'
    ).join('');

    document.getElementById('busesTableBody').innerHTML = buses.map(b =>
      '<tr data-hl="bus:' + b.busId + '"><td><b>' + b.no + '</b></td><td>' + b.routeName + '</td><td>' + b.driverName + '</td>' +
      '<td><span class="pill ' + b.status.toLowerCase().replace(' ', '-') + '">' + b.status + (b.inMaintenance ? ' (Maint.)' : '') + '</span></td><td>' + b.location + '</td>' +
      '<td><button class="btn-secondary btn-small" onclick="removeBus(\'' + b.busId + '\')">Remove</button></td></tr>'
    ).join('');

    document.getElementById('routesTableBody').innerHTML = routes.map(r =>
      '<tr data-hl="route:' + r.routeId + '"><td><b>' + r.name + '</b></td><td>' + r.stops.map(s => s.name).join(' → ') + mapNote(r.stops) + '</td>' +
      '<td><span class="pill ' + (r.active ? 'on-time' : 'offline') + '">' + (r.active ? 'Active' : 'Inactive') + '</span></td>' +
      '<td><button class="btn-secondary btn-small" onclick="removeRoute(\'' + r.routeId + '\')">Remove</button></td></tr>'
    ).join('');

    document.getElementById('driversTableBody').innerHTML = drivers.map(d =>
      '<tr data-hl="driver:' + d.uid + '"><td><b>' + d.name + '</b></td><td>' + d.uid + '</td><td>' + d.email + '</td><td>' + (d.phone || '-') + '</td>' +
      '<td>' + (d.busNo || '-') + '</td><td>' + (d.routeName || '-') + (d.stops.length ? '<div class="table-note">' + d.stops.join(' → ') + '</div>' + mapNote(d.stops) : '') + '</td>' +
      '<td><button class="btn-secondary btn-small" onclick="removeDriver(\'' + d.uid + '\')">Remove</button></td></tr>'
    ).join('') || '<tr><td colspan="7"><div class="empty-note">No drivers yet. Click "Add Driver".</div></td></tr>';

    document.getElementById('usersTableBody').innerHTML = users.map(u =>
      '<tr data-hl="user:' + u.id + '"><td><b>' + u.name + '</b></td><td style="text-transform:capitalize;">' + u.role + '</td><td>' + (u.roll || '<span class="table-note">Profile pending</span>') + '</td><td>' + u.email + '</td><td>' + (u.phone || '-') + '</td>' +
      '<td><button class="btn-secondary btn-small" onclick="removeUser(\'' + u.id + '\')">Remove</button></td></tr>'
    ).join('');

    document.getElementById('reportsTableBody').innerHTML = routes.map(r =>
      '<tr><td><b>' + r.name + '</b></td><td>' + r.perf.onTime + '%</td><td>' + r.perf.delayed + '%</td><td>' + r.perf.cancelled + '%</td></tr>'
    ).join('');

    document.getElementById('recentActivities').innerHTML = adminNotifs.slice(0, 5).map(notifRowHtml).join('') || '<div class="empty-note">No activity yet.</div>';
    document.getElementById('allNotifs').innerHTML = adminNotifs.map(notifRowHtml).join('') || '<div class="empty-note">No notifications yet.</div>';
    setNotifBadges(adminNotifs);
    applyHighlight();
  }

  let socket;

  async function init() {
    try {
      await loadSettings();
      await render();
      setInterval(render, 2000);

      if (window.io) {
        socket = io();
        socket.emit('join', 'admin');
        socket.on('progress:update', render);
        socket.on('notification:new', render);
      }
    } catch (err) {
      toast(err.message || 'Could not load the dashboard.', 'error');
    }
  }

  init();
})();
