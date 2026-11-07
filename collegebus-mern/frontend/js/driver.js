(function () {
  const user = requireRole('driver');
  if (!user) return;

  let BUS_ID, ROUTE_NAME, ROUTE_DESC, STOPS, MAP_PATH, DESTINATION_LABEL, START_LABEL, busCache;

  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('markAllRead').addEventListener('click', async () => { try { await DB.markNotificationsRead(); } catch (e) { /* ignore */ } render(); });

  function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    if (name === 'live') renderMapInto('mapHolderBig', 'mapBig');
    if (name === 'notifications') scheduleMarkRead(render); else cancelMarkRead();
  }

  document.getElementById('userAvatar').textContent = initials(user.name);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('helloName').textContent = 'Good Morning, ' + user.name + '! 👋';
  document.getElementById('dateLabel').textContent = todayLabel();

  function renderMapInto(holderId, mapId) {
    const holder = document.getElementById(holderId);
    if (holder && !holder.dataset.built) {
      holder.innerHTML = buildMapHTML(mapId, DESTINATION_LABEL, MAP_PATH, START_LABEL);
      holder.dataset.built = '1';
    }
  }

  async function startRoute() {
    document.getElementById('startRouteBtn').disabled = true;
    try {
      await DB.startRoute(BUS_ID);
      toast('Route started!', 'success');
      await render();
    } catch (err) {
      toast(err.message, 'error');
      document.getElementById('startRouteBtn').disabled = false;
    }
  }

  async function endRoute() {
    try {
      await DB.endRoute(BUS_ID);
      toast('Route ended.', 'info');
      await render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('startRouteBtn').addEventListener('click', startRoute);
  document.getElementById('endRouteBtn').addEventListener('click', endRoute);

  async function render() {
    const [progress, notifs] = await Promise.all([
      DB.progressFor(BUS_ID),
      DB.notifications('driver')
    ]);
    const stopIdx = progress.stopIndex;
    const curPoint = STOPS[Math.min(stopIdx, STOPS.length - 1)];
    const nextPoint = STOPS[Math.min(stopIdx + 1, STOPS.length - 1)];

    document.getElementById('statBusNo').textContent = busCache.no;
    document.getElementById('statRouteStatus').textContent = progress.status === 'idle' ? 'Not Started' : progress.status === 'completed' ? 'Completed' : 'On Route';
    document.getElementById('statRoute').textContent = ROUTE_NAME;
    document.getElementById('statRouteDesc').textContent = ROUTE_DESC;
    document.getElementById('statLocation').textContent = 'Near ' + curPoint.name;
    document.getElementById('statNextStop').textContent = progress.status === 'completed' ? '-' : nextPoint.name;
    document.getElementById('statNextDist').textContent = progress.status === 'completed' ? 'Route finished' : ((stopIdx + 1) * 2.1).toFixed(1) + ' km away';

    renderMapInto('mapHolder', 'map');
    ['map', 'mapBig'].forEach(id => {
      if (hasLiveMap(id)) {
        const label = progress.status === 'idle' ? 'Bus - Idle at ' + STOPS[0].name : progress.status === 'completed' ? 'Bus - Arrived' : 'You are here (Near ' + curPoint.name + ')';
        updateMapBus(id, stopIdx, label, MAP_PATH, progress.status);
      }
    });
    document.getElementById('routeActivePill').textContent = progress.status === 'running' ? 'Route Active' : progress.status === 'completed' ? 'Completed' : 'Not Started';
    document.getElementById('routeActivePill').className = 'pill ' + (progress.status === 'running' ? 'on-route' : progress.status === 'completed' ? 'on-time' : 'delayed');

    document.getElementById('controlStatusLabel').textContent = progress.status === 'running' ? 'Route Running' : progress.status === 'completed' ? 'Route Completed' : 'Route Not Started';
    document.getElementById('startRouteBtn').disabled = progress.status === 'running';
    document.getElementById('endRouteBtn').disabled = progress.status !== 'running';

    document.getElementById('tripRoute').textContent = ROUTE_NAME;
    document.getElementById('tripTo').textContent = STOPS[STOPS.length - 1].name;
    document.getElementById('tripNextEta').textContent = progress.status === 'completed' ? 'Arrived' : '2.1 km (5 mins)';
    document.getElementById('tripDeparture').textContent = busCache.departure;
    document.getElementById('tripCurrentTime').textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const stopsHtml = STOPS.map((p, i) => {
      const reached = i < stopIdx || (i === stopIdx && progress.status !== 'idle') || progress.status === 'completed';
      const timeTag = p.time && p.time !== '-' ? ' <span style="color:var(--muted);font-weight:400;">(' + p.time + ')</span>' : '';
      return '<div class="stop-row">' +
        '<div class="stop-dot ' + (i === stopIdx && progress.status === 'running' ? 'current' : '') + '"></div>' +
        '<div><div class="stop-name">' + (i + 1) + '. ' + p.name + timeTag + (i === 0 ? ' (Departure)' : (i === STOPS.length - 1 ? ' (Destination)' : '')) + '</div></div>' +
        '<div class="stop-right"><span class="pill ' + (reached ? 'reached' : 'upcoming') + '">' + (reached ? 'Reached' : 'Upcoming') + '</span></div>' +
        '</div>';
    }).join('');
    document.getElementById('upcomingStops').innerHTML = stopsHtml;
    document.getElementById('stopsFullList').innerHTML = stopsHtml;

    document.getElementById('msgTime').textContent = '08:05 AM';

    document.getElementById('allNotifs').innerHTML = notifs.map(notifRowHtml).join('') || '<div class="empty-note">No notifications yet.</div>';
    setNotifBadges(notifs);
  }

  document.getElementById('pfName').value = user.name;
  document.getElementById('pfRoll').value = user.roll;
  document.getElementById('pfEmail').value = user.email;
  document.getElementById('pfPhone').value = user.phone || '';

  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    try {
      const updated = await DB.updateMyProfile({
        name: document.getElementById('pfName').value.trim(),
        phone: document.getElementById('pfPhone').value.trim()
      });
      DB.updateCachedUser({ name: updated.name, phone: updated.phone });
      document.getElementById('userName').textContent = updated.name;
      document.getElementById('helloName').textContent = 'Good Morning, ' + updated.name + '! 👋';
      toast('Profile updated.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('changePassBtn').addEventListener('click', async () => {
    const cur = document.getElementById('pfCurPass').value;
    const next = document.getElementById('pfNewPass').value;
    const errEl = document.getElementById('pfPassErr');
    errEl.textContent = '';
    try {
      await DB.changeMyPassword(cur, next);
      document.getElementById('pfCurPass').value = '';
      document.getElementById('pfNewPass').value = '';
      toast('Password changed successfully.', 'success');
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  let socket, pollTimer;

  async function init() {
    try {
      const { bus, route } = await DB.myDriverBus();
      busCache = bus;
      BUS_ID = bus.busId;
      ROUTE_NAME = bus.routeName;
      ROUTE_DESC = bus.routeDesc;
      STOPS = bus.stops;
      MAP_PATH = buildRouteWaypoints(STOPS);
      DESTINATION_LABEL = bus.destLabel + '<br>(Destination)';
      START_LABEL = bus.startLabel + '<br>(Start)';

      await render();

      pollTimer = setInterval(render, 2000);

      if (window.io) {
        socket = io();
        socket.emit('join', 'driver');
        socket.on('progress:update', (data) => { if (data.busId === BUS_ID) render(); });
      }
    } catch (err) {
      toast(err.message || 'Could not load your route.', 'error');
    }
  }

  init();
})();
