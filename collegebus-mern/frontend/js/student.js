(function () {
  const user = requireRole('student');
  if (!user) return;

  // A student who has verified the email but not filled the profile yet sees
  // only the profile form (onboarding) until it is saved.
  const onboarding = user.profileComplete !== true;

  const BUS_ID = 'B1'; // the demo Route 1 bus shown on the main Dashboard
  let realRoutes = [];
  let selectedRouteId = null;
  let busesCache = [];

  // ---------- Sidebar navigation ----------
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });
  document.querySelectorAll('[data-goto]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.goto));
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('contactDriverBtn').addEventListener('click', () => {
    const bus = busesCache.find(b => b.busId === BUS_ID);
    toast('Calling driver ' + bus.driverName + ' (' + bus.contact + ')...', 'info');
  });

  document.getElementById('markAllRead').addEventListener('click', async () => { try { await DB.markNotificationsRead(); } catch (e) { /* ignore */ } render(); });

  function showSection(name) {
    if (onboarding && name !== 'profile') {
      toast('Please complete your profile first.', 'info');
      name = 'profile';
    }
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    if (name === 'tracking') renderMapInto('mapHolderBig', 'mapBig');
    if (name === 'notifications') scheduleMarkRead(render); else cancelMarkRead();
  }

  // ---------- Header ----------
  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('helloName').textContent = 'Hello, ' + user.name.split(' ')[0] + '! 👋';
  document.getElementById('dateLabel').textContent = todayLabel();

  // ---------- Map ----------
  function renderMapInto(holderId, mapId) {
    const holder = document.getElementById(holderId);
    if (holder && !holder.dataset.built) {
      holder.innerHTML = buildMapHTML(mapId, 'College<br>(Your Destination)');
      holder.dataset.built = '1';
    }
  }
  renderMapInto('mapHolder', 'map');

  // ---------- My Route (student picks one of the real routes) ----------
  const myRouteSelect = document.getElementById('myRouteSelect');

  myRouteSelect.addEventListener('change', async () => {
    selectedRouteId = myRouteSelect.value || null;
    try { await DB.saveRouteSelection(selectedRouteId); } catch (err) { toast(err.message, 'error'); }
    const holder = document.getElementById('myRouteMapHolder');
    holder.innerHTML = '';
    delete holder.dataset.built;
    renderMyRoute();
  });

  // Finds this route's live bus among the buses the server already tracks
  // (every real route always has one, created when its driver first set up).
  function findRouteBus(route) {
    const canonicalId = 'B_' + route.id;
    const matches = busesCache.filter(b => b.routeId === route.id);
    return matches.find(b => b.busId === canonicalId) || matches[0] || null;
  }

  function renderMyRoute() {
    const emptyEl = document.getElementById('myRouteEmpty');
    const contentEl = document.getElementById('myRouteContent');
    const route = selectedRouteId ? realRoutes.find(r => r.id === selectedRouteId) : null;
    if (!route) { emptyEl.style.display = 'block'; contentEl.style.display = 'none'; return; }

    const bus = findRouteBus(route);
    if (!bus) { emptyEl.style.display = 'block'; emptyEl.textContent = 'This route has no bus assigned yet.'; contentEl.style.display = 'none'; return; }
    emptyEl.style.display = 'none';
    contentEl.style.display = 'block';

    const progress = progressCache[bus.busId] || { stopIndex: 0, status: 'idle' };
    const stopIdx = progress.stopIndex;
    const mapPath = buildRouteWaypoints(route.stops);
    const curPoint = route.stops[Math.min(stopIdx, route.stops.length - 1)];

    const holder = document.getElementById('myRouteMapHolder');
    if (!holder.dataset.built) {
      holder.innerHTML = buildMapHTML('myRouteMap', route.endPoint + ' College<br>(Destination)', mapPath, route.startPoint + '<br>(Start)');
      holder.dataset.built = '1';
    }
    const label = progress.status === 'idle' ? 'Bus - Not started' : progress.status === 'completed' ? 'Bus - Arrived' : 'Bus (' + bus.no + ') - Near ' + curPoint.name;
    updateMapBus('myRouteMap', stopIdx, label, mapPath, progress.status);

    document.getElementById('myRouteName').textContent = route.name + ' (' + route.title + ')';
    document.getElementById('myRouteBusNo').textContent = bus.no;
    document.getElementById('myRouteDriver').textContent = route.driverName;
    document.getElementById('myRouteContact').textContent = bus.contact;
    document.getElementById('myRouteDeparture').textContent = route.departure;
    document.getElementById('myRouteArrival').textContent = route.arrival;

    const banner = document.getElementById('myRouteStatusBanner');
    if (progress.status === 'running') { banner.className = 'status-banner'; banner.textContent = '🟢 Bus is On the Way'; }
    else if (progress.status === 'completed') { banner.className = 'status-banner'; banner.textContent = '🟢 Bus has Arrived'; }
    else { banner.className = 'status-banner late'; banner.textContent = '🟡 Route Not Started Yet'; }

    document.getElementById('myRouteStops').innerHTML = route.stops.map((s, i) => {
      const reached = i < stopIdx || (i === stopIdx && progress.status !== 'idle') || progress.status === 'completed';
      const timeTag = s.time && s.time !== '-' ? ' <span style="color:var(--muted);font-weight:400;">(' + s.time + ')</span>' : '';
      return '<div class="stop-row">' +
        '<div class="stop-dot ' + (i === stopIdx && progress.status === 'running' ? 'current' : '') + '"></div>' +
        '<div><div class="stop-name">' + (i + 1) + '. ' + s.name + timeTag + '</div></div>' +
        '<div class="stop-right"><span class="pill ' + (reached ? 'reached' : 'upcoming') + '">' + (reached ? 'Reached' : 'Upcoming') + '</span></div>' +
        '</div>';
    }).join('');
  }

  // ---------- Render everything from current data ----------
  let progressCache = {}; // busId -> progress, refreshed each cycle

  async function render() {
    const [buses, mainProgress, notifs] = await Promise.all([
      DB.buses(),
      DB.progressFor(BUS_ID),
      DB.notifications('student')
    ]);
    busesCache = buses;

    // Refresh progress for whichever bus the student is currently watching
    // on "My Route" too, so both views stay live.
    progressCache = { [BUS_ID]: mainProgress };
    if (selectedRouteId) {
      const route = realRoutes.find(r => r.id === selectedRouteId);
      const bus = route ? findRouteBus(route) : null;
      if (bus) progressCache[bus.busId] = await DB.progressFor(bus.busId);
    }

    const bus = buses.find(b => b.busId === BUS_ID);
    const progress = mainProgress;
    const stopIdx = progress.stopIndex;
    const curPoint = ROUTE_PATH[Math.min(stopIdx, ROUTE_PATH.length - 1)];
    const remaining = ROUTE_PATH.length - 1 - stopIdx;
    const etaMins = Math.max(remaining * 6, progress.status === 'completed' ? 0 : 2);

    document.getElementById('statBusNo').textContent = bus.no;
    document.getElementById('statBusStatus').textContent = bus.status;
    document.getElementById('statBusStatus').className = 'pill ' + bus.status.toLowerCase().replace(' ', '-');
    document.getElementById('statLocation').textContent = progress.status === 'completed' ? curPoint.name + ' (Arrived)' : 'Near ' + curPoint.name;
    document.getElementById('statDistance').textContent = '(' + (remaining * 2.3).toFixed(1) + ' km away)';
    document.getElementById('statEta').textContent = progress.status === 'idle' ? 'Not started' : (progress.status === 'completed' ? 'Arrived' : etaMins + ' mins');

    ['map', 'mapBig'].forEach(id => {
      if (hasLiveMap(id)) {
        const label = progress.status === 'idle' ? 'Bus - Not started' : progress.status === 'completed' ? 'Bus - Arrived' : 'Bus (' + bus.no + ') - Near ' + curPoint.name;
        updateMapBus(id, stopIdx, label, undefined, progress.status);
      }
    });

    document.getElementById('upcomingStops').innerHTML = ROUTE_PATH.map((p, i) => {
      const isCurrent = i === stopIdx;
      const km = (i * 2.1).toFixed(1);
      const eta = i <= stopIdx ? '' : ((i - stopIdx) * 6) + ' mins';
      return '<div class="stop-row">' +
        '<div class="stop-dot ' + (isCurrent ? 'current' : '') + '"></div>' +
        '<div><div class="stop-name">' + p.name + (isCurrent ? ' <span style="color:var(--green);font-size:11px;">(Current)</span>' : '') + '</div><div class="stop-sub">' + km + ' km</div></div>' +
        '<div class="stop-right">' + (i < stopIdx || progress.status === 'completed' ? '<b style="color:var(--green);">Reached</b>' : '<b>' + eta + '</b>ETA') + '</div>' +
        '</div>';
    }).join('');

    document.getElementById('detBusNo').textContent = bus.no;
    document.getElementById('detRoute').textContent = bus.routeDesc;
    document.getElementById('detDriver').textContent = bus.driverName;
    document.getElementById('detContact').textContent = bus.contact;
    document.getElementById('detDeparture').textContent = bus.departure;
    document.getElementById('detArrival').textContent = progress.status === 'completed' ? 'Arrived' : etaMins + ' mins (at your stop)';
    const banner = document.getElementById('detStatusBanner');
    if (bus.status === 'Delayed') { banner.className = 'status-banner late'; banner.textContent = '🟠 Bus is Delayed'; }
    else { banner.className = 'status-banner'; banner.textContent = progress.status === 'completed' ? '🟢 Bus has Arrived' : '🟢 Bus is On Time'; }

    document.getElementById('recentNotifs').innerHTML = notifs.slice(0, 4).map(notifRowHtml).join('') || '<div class="empty-note">No notifications yet.</div>';
    document.getElementById('allNotifs').innerHTML = notifs.map(notifRowHtml).join('') || '<div class="empty-note">No notifications yet.</div>';
    setNotifBadges(notifs);

    document.getElementById('routesTableBody').innerHTML = buses.map(b =>
      '<tr><td><b>' + b.no + '</b></td><td>' + b.routeName + '</td><td>' + b.departure + '</td>' +
      '<td><span class="pill ' + b.status.toLowerCase().replace(' ', '-') + '">' + b.status + '</span></td><td>' + b.location + '</td></tr>'
    ).join('');

    renderMyRoute();
  }

  // ---------- Profile section ----------
  document.getElementById('pfEmail').value = user.email;
  document.getElementById('pfName').value = onboarding ? '' : user.name;
  document.getElementById('pfRoll').value = user.roll || '';
  document.getElementById('pfPhone').value = user.phone || '';

  if (onboarding) {
    document.getElementById('pfTitle').textContent = 'Complete your profile';
    document.getElementById('pfSub').textContent = 'One last step before you can see your bus and route.';
    document.getElementById('pfBanner').style.display = 'block';
    document.getElementById('saveProfileBtn').textContent = 'Save & Continue';
    document.querySelectorAll('.nav-item[data-section]').forEach(n => { if (n.dataset.section !== 'profile') n.style.opacity = '0.45'; });
    setNotifBadges([]);   // nothing to count yet: hide the red "0"
    showSection('profile');
  }

  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    ['pfNameErr', 'pfRollErr', 'pfPhoneErr'].forEach(id => { document.getElementById(id).textContent = ''; });
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true;
    try {
      const updated = await DB.saveStudentProfile({
        name: document.getElementById('pfName').value.trim(),
        roll: document.getElementById('pfRoll').value.trim(),
        phone: document.getElementById('pfPhone').value.trim()
      });
      DB.updateCachedUser({ name: updated.name, roll: updated.roll, phone: updated.phone, profileComplete: true });
      if (onboarding) {
        toast('Profile saved. Welcome, ' + updated.name.split(' ')[0] + '!', 'success');
        setTimeout(() => { window.location.href = 'student.html'; }, 600);
        return;
      }
      document.getElementById('userName').textContent = updated.name;
      document.getElementById('helloName').textContent = 'Hello, ' + updated.name.split(' ')[0] + '! 👋';
      toast('Profile updated.', 'success');
    } catch (err) {
      const target = { name: 'pfNameErr', roll: 'pfRollErr', phone: 'pfPhoneErr' }[err.field];
      if (target) document.getElementById(target).textContent = err.message; else toast(err.message, 'error');
    }
    btn.disabled = false;
  });

  let socket;

  // Keeps this page's idea of "profile complete" in step with the server
  // (for example the profile was finished on another device).
  async function profileStateChanged() {
    try {
      const me = await DB.studentMe();
      DB.updateCachedUser({ name: me.name, roll: me.roll, phone: me.phone, profileComplete: me.profileComplete });
      return (me.profileComplete === true) === onboarding;   // true when the page must reload
    } catch (e) { return false; }
  }

  async function init() {
    if (await profileStateChanged()) { window.location.reload(); return; }
    if (onboarding) return;   // nothing else to load until the profile is saved
    try {
      realRoutes = await DB.getRealRoutes();
      realRoutes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name + ' (' + r.title + ')';
        myRouteSelect.appendChild(opt);
      });
      selectedRouteId = await DB.myRouteSelection();
      if (selectedRouteId) myRouteSelect.value = selectedRouteId;

      await render();
      setInterval(render, 2000);

      if (window.io) {
        socket = io();
        socket.emit('join', 'student');
        socket.on('progress:update', render);
        socket.on('notification:new', render);
      }
    } catch (err) {
      toast(err.message || 'Could not load your dashboard.', 'error');
    }
  }

  init();
})();
