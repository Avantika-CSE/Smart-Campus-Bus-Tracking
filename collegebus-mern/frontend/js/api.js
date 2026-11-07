/* ===================== API CLIENT ===================== */
/* Every call goes to the same origin the frontend is served from (the
   Express backend serves both), so no base URL is needed. */

function apiToken() { return localStorage.getItem('bts_token'); }

async function apiCall(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = apiToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    const err = new Error('Could not reach the server. Please check your connection and that the backend is running.');
    err.network = true;
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body is fine */ }

  if (!res.ok) {
    // A signed-in person whose session is no longer valid (expired, or an old
    // password-era student session) is sent back to the login page.
    if (res.status === 401 && token && typeof DB !== 'undefined') {
      DB.clearSession();
      if (!/index\.html$|\/$/.test(window.location.pathname)) {
        window.location.href = 'index.html';
      }
    }
    const err = new Error((data && data.message) || ('Request failed (' + res.status + ')'));
    err.status = res.status;
    err.field = data && data.field;
    throw err;
  }
  return data || {};
}

function apiGet(path) { return apiCall('GET', path); }
function apiPost(path, body) { return apiCall('POST', path, body); }
function apiPut(path, body) { return apiCall('PUT', path, body); }
function apiDelete(path) { return apiCall('DELETE', path); }
