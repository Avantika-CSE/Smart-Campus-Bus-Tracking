const https = require('https');
const RouteGeometry = require('../models/RouteGeometry');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'CollegeBusTracking/1.0 (college project)' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Routing status ' + res.statusCode));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('Routing timeout')));
  });
}

// Road path through the given stops (in order), via the free OSRM service.
// Long routes are split into chunks so the public server accepts them.
async function fetchRoadPath(points) {
  const CHUNK = 20;
  const full = [];
  for (let start = 0; start < points.length - 1; start += CHUNK - 1) {
    const slice = points.slice(start, start + CHUNK);
    if (slice.length < 2) break;
    const coords = slice.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const data = await getJson('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson');
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error('No road route found');
    const line = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    if (full.length) line.shift(); // avoid duplicating the joint point
    full.push(...line);
  }
  return full;
}

// Returns [[lat,lng], ...] following the roads, or null if it can't be found.
async function roadPathFor(points) {
  if (!points || points.length < 2) return null;
  const key = points.map(p => p.lat.toFixed(5) + ',' + p.lng.toFixed(5)).join('|');
  const cached = await RouteGeometry.findOne({ key });
  if (cached && cached.path) return cached.path;
  const path = await fetchRoadPath(points);
  if (path.length > 1) {
    try { await RouteGeometry.create({ key, path }); } catch (e) { /* saved by another request meanwhile */ }
    return path;
  }
  return null;
}

module.exports = { roadPathFor };
