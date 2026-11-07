/* ===================== DATA LAYER (API-backed) =====================
   Session (who's logged in) is cached in localStorage after login so
   pages can check "am I logged in, and as whom" synchronously, exactly
   like before. Every other piece of data (buses, routes, notifications,
   live tracking, users, settings) now lives in MongoDB and is fetched
   through the backend API.
======================================================================= */

const DB = {
  KEYS: { token: 'bts_token', user: 'bts_user' },

  // ---- Session (sync, cached) ----
  setSession({ token, user }) {
    localStorage.setItem(this.KEYS.token, token);
    localStorage.setItem(this.KEYS.user, JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem(this.KEYS.token);
    localStorage.removeItem(this.KEYS.user);
  },
  currentUser() {
    try {
      const raw = localStorage.getItem(this.KEYS.user);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  updateCachedUser(patch) {
    const u = this.currentUser();
    if (!u) return;
    Object.assign(u, patch);
    localStorage.setItem(this.KEYS.user, JSON.stringify(u));
  },

  // ---- Real JIT routes (fetched once, cached in memory) ----
  _realRoutesCache: null,
  async getRealRoutes() {
    if (!this._realRoutesCache) this._realRoutesCache = (await apiGet('/api/routes/real')).routes;
    return this._realRoutesCache;
  },

  // ---- Buses ----
  async buses() { return (await apiGet('/api/buses')).buses; },
  async addBus(payload) { return (await apiPost('/api/buses', payload)).bus; },
  async removeBus(busId) { return apiDelete('/api/buses/' + encodeURIComponent(busId)); },

  // ---- Routes (admin-managed list) ----
  async routes() { return (await apiGet('/api/routes')).routes; },
  async addRoute(payload) { return (await apiPost('/api/routes', payload)).route; },
  async removeRoute(routeId) { return apiDelete('/api/routes/' + encodeURIComponent(routeId)); },

  // ---- Notifications ----
  async notifications(role) { return (await apiGet('/api/notifications?role=' + encodeURIComponent(role))).notifications; },
  async sendNotification(payload) { return (await apiPost('/api/notifications', payload)).notification; },

  // ---- Live tracking ----
  async progressFor(busId) { return (await apiGet('/api/progress/' + encodeURIComponent(busId))).progress; },
  async startRoute(busId) { return (await apiPost('/api/progress/' + encodeURIComponent(busId) + '/start')).progress; },
  async endRoute(busId) { return (await apiPost('/api/progress/' + encodeURIComponent(busId) + '/end')).progress; },
  async myDriverBus() { return apiGet('/api/progress/me/bus'); }, // {bus, route}

  // ---- Drivers (admin adds drivers + their bus/route/stops) ----
  async drivers() { return (await apiGet('/api/drivers')).drivers; },
  async addDriver(payload) { return (await apiPost('/api/drivers', payload)).driver; },
  async removeDriver(uid) { return apiDelete('/api/drivers/' + encodeURIComponent(uid)); },

  // ---- Map positions of stops ----
  async markNotificationsRead() { return apiPost('/api/notifications/read-all', {}); },
  async resolveStops(names) { return (await apiPost('/api/geo/resolve', { names })).results; },
  async searchPlaces(q) { return (await apiGet('/api/geo/search?q=' + encodeURIComponent(q))).results; },
  async setStopPosition(name, lat, lng) { return apiPost('/api/geo/set', { name, lat, lng }); },
  async resetStopPosition(name) { return apiPost('/api/geo/reset', { name }); },

  // ---- Users (admin) ----
  async users() { return (await apiGet('/api/users')).users; },
  async removeUser(id) { return apiDelete('/api/users/' + encodeURIComponent(id)); },
  async updateMyProfile(payload) { return (await apiPut('/api/users/me', payload)).user; },
  async changeMyPassword(currentPassword, newPassword) { return apiPut('/api/users/me/password', { currentPassword, newPassword }); },
  async studentMe() { return (await apiGet('/api/students/me')).user; },
  async saveStudentProfile(payload) { return (await apiPut('/api/students/me/profile', payload)).user; },

  // ---- Settings ----
  async settings() { return (await apiGet('/api/settings')).settings; },
  async saveSettings(payload) { return (await apiPost('/api/settings', payload)).settings; },

  // ---- Student's own route selection ----
  async myRouteSelection() { return (await apiGet('/api/students/me/route')).routeId; },
  async saveRouteSelection(routeId) { return apiPost('/api/students/me/route', { routeId }); },

  // ---- Auth flows ----
  async studentRequestOtp(email) { return apiPost('/api/auth/student/otp/request', { email }); },
  async studentVerifyOtp(email, otp) { return apiPost('/api/auth/student/otp/verify', { email, otp }); },

  async adminSearch(q, type, page) { return apiGet('/api/admin/search?q=' + encodeURIComponent(q) + (type ? '&type=' + encodeURIComponent(type) + '&page=' + (page || 1) : '')); },
  async adminStatus() { return apiGet('/api/auth/admin/status'); },
  async adminSetup(payload) { return apiPost('/api/auth/admin/setup', payload); },
  async adminLogin(payload) { return apiPost('/api/auth/admin/login', payload); },

  async driverStatus() { return apiGet('/api/auth/driver/status'); },
  async driverSetup(payload) { return apiPost('/api/auth/driver/setup', payload); },
  async driverLogin(payload) { return apiPost('/api/auth/driver/login', payload); }
};

/* Route waypoints for the demo Route 1 live-map animation. This is fixed
   UI/animation data (not user data), so it stays a plain client-side
   constant rather than something fetched from the backend. */
const ROUTE_PATH = [
  { name: 'College', key: 'college', x: 16, y: 86 },
  { name: 'Sadar', key: 'sadar', x: 34, y: 62 },
  { name: 'Lakdganj', key: 'lakdganj', x: 47, y: 47 },
  { name: 'Civil Lines', key: 'civillines', x: 56, y: 24 },
  { name: 'Main Stop', key: 'mainstop', x: 82, y: 14 }
];
