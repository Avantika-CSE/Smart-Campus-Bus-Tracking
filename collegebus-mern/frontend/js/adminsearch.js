/* ===================== ADMIN SEARCH BOX =====================
   Searches real records (students, drivers, buses, routes) through
   GET /api/admin/search. Waits 300 ms after typing stops, ignores answers
   that arrive late, shows loading / empty / error states, and lets the admin
   click a result to jump to that record in its table (highlighted).        */
(function () {
  const input = document.getElementById('adminSearch');
  const panel = document.getElementById('searchPanel');
  const clearBtn = document.getElementById('searchClear');
  const wrap = document.getElementById('searchWrap');
  if (!input || !panel) return;

  const MIN_CHARS = 2, DEBOUNCE_MS = 300;
  const TITLES = { students: 'Students', drivers: 'Drivers', buses: 'Buses', routes: 'Routes' };
  const ORDER = ['students', 'drivers', 'buses', 'routes'];

  let timer = null, seq = 0, moreSeq = 0;
  let current = null;       // { query, results: { type: { total, items } } }
  const pages = {};         // pages already loaded per type

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const open = html => { panel.innerHTML = html; panel.style.display = 'block'; };
  const close = () => { panel.style.display = 'none'; };
  const note = (msg, cls) => '<div class="sr-note ' + (cls || '') + '">' + msg + '</div>';

  function itemHtml(type, it) {
    let title, sub;
    if (type === 'students') {
      title = it.name;
      sub = escHtml([it.email, it.roll ? 'Roll ' + it.roll : '', it.phone].filter(Boolean).join(' · ')) + (it.profilePending ? ' · <i>profile pending</i>' : '');
    } else if (type === 'drivers') {
      title = it.name;
      sub = escHtml([it.uid, it.email, it.busNo ? 'Bus ' + it.busNo : '', it.routeName].filter(Boolean).join(' · '));
    } else if (type === 'buses') {
      title = it.busNo;
      sub = escHtml([it.routeName, it.driverName ? 'Driver ' + it.driverName : '', it.status].filter(Boolean).join(' · '));
    } else {
      title = it.name;
      sub = escHtml([it.title, it.busNo ? 'Bus ' + it.busNo : '', it.driverName ? 'Driver ' + it.driverName : '', it.stops + ' stops'].filter(Boolean).join(' · '));
    }
    return '<div class="sr-item" data-section="' + escHtml(it.section) + '" data-key="' + escHtml(it.key) + '">' +
      '<div class="sr-title">' + escHtml(title) + '</div><div class="sr-sub">' + sub + '</div></div>';
  }

  function renderResults(data) {
    let any = false, html = '';
    ORDER.forEach(type => {
      const r = data.results[type];
      if (!r || !r.items.length) return;
      any = true;
      html += '<div class="sr-head">' + TITLES[type] + ' <span>(' + r.total + ')</span></div>';
      html += r.items.map(it => itemHtml(type, it)).join('');
      if (r.total > r.items.length) html += '<button type="button" class="sr-more" data-type="' + type + '">Show more (' + (r.total - r.items.length) + ' more)</button>';
    });
    open(any ? html : note('No results for “' + escHtml(data.query) + '”. Try a name, email, roll number, bus number or route name.', 'empty'));
  }

  function showError(err, q) {
    open(note(escHtml(err.message || 'Search failed.') + ' <button type="button" class="sr-retry" data-q="' + escHtml(q) + '">Try again</button>', 'err'));
  }

  async function run(q) {
    const mine = ++seq;
    try {
      const out = await DB.adminSearch(q);
      if (mine !== seq) return;           // a newer search has started: ignore this old answer
      current = out; ORDER.forEach(t => { pages[t] = 1; });
      renderResults(out);
    } catch (err) {
      if (mine !== seq) return;
      showError(err, q);
    }
  }

  function onType() {
    clearTimeout(timer);
    clearBtn.style.display = input.value ? '' : 'none';
    const q = clean(input.value);
    if (!q) { seq++; current = null; close(); return; }
    if (q.length < MIN_CHARS) { seq++; open(note('Type at least ' + MIN_CHARS + ' characters to search.')); return; }
    open(note('Searching…'));
    timer = setTimeout(() => run(q), DEBOUNCE_MS);
  }

  async function loadMore(type) {
    if (!current) return;
    const q = current.query, mine = ++moreSeq;
    try {
      const out = await DB.adminSearch(q, type, (pages[type] || 1) + 1);
      if (mine !== moreSeq || !current || current.query !== q) return;
      pages[type] = out.page;
      current.results[type].items = current.results[type].items.concat(out.results[type].items);
      current.results[type].total = out.results[type].total;
      renderResults(current);
    } catch (err) { toast(err.message, 'error'); }
  }

  function clearAll() {
    clearTimeout(timer); seq++; moreSeq++;
    input.value = ''; current = null; clearBtn.style.display = 'none'; close();
  }

  function go(el) {
    close();
    if (window.adminGoTo) window.adminGoTo(el.dataset.section, el.dataset.key);
  }

  input.addEventListener('input', onType);
  input.addEventListener('focus', () => { if (current) renderResults(current); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { clearAll(); input.blur(); }
    else if (e.key === 'Enter') { const first = panel.querySelector('.sr-item'); if (first) { e.preventDefault(); go(first); } }
  });
  clearBtn.addEventListener('click', () => { clearAll(); input.focus(); });

  panel.addEventListener('click', e => {
    const t = e.target;
    const item = t.closest && t.closest('.sr-item');
    if (item) return go(item);
    const more = t.closest && t.closest('.sr-more');
    if (more) return loadMore(more.dataset.type);
    const retry = t.closest && t.closest('.sr-retry');
    if (retry) { open(note('Searching…')); run(retry.dataset.q); }
  });

  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
})();
