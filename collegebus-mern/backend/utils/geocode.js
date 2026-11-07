const https = require('https');
const Geocode = require('../models/Geocode');

let overrides = {};
try { overrides = require('./stopCoordinates'); } catch (e) { overrides = {}; }

// Nagpur-ish search box (west, north, east, south) so "Ram Nagar" means the
// one near Nagpur and not some other Ram Nagar in India.
const VIEWBOX = '78.80,21.40,79.35,20.85';

// Names that mean the college itself.
function aliasFor(name) {
  const n = keyOf(name);
  if (n === 'jit' || n === 'jit college' || n === 'college' || n === 'jit college (destination)') {
    return 'Jhulelal Institute of Technology';
  }
  return name;
}

function keyOf(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Nagpur area limits, used to reject a loose match that landed in another city.
const BOX = { south: 20.85, north: 21.40, west: 78.80, east: 79.35 };
function insideNagpur(p) { return p && p.lat >= BOX.south && p.lat <= BOX.north && p.lng >= BOX.west && p.lng <= BOX.east; }

// OpenStreetMap allows about 1 request per second. Every lookup (background
// stop search and the admin's Map Setup search) waits for its turn here.
let nextSlotAt = 0;
async function throttle() {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + 1100;
  if (at > now) await sleep(at - now);
}

function nominatimRaw(query, bounded, limit) {
  return new Promise((resolve, reject) => {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=' + (limit || 1) + '&countrycodes=in' +
      '&viewbox=' + VIEWBOX + '&bounded=' + (bounded ? '1' : '0') + '&q=' + encodeURIComponent(query);
    const req = https.get(url, { headers: { 'User-Agent': 'CollegeBusTracking/1.0 (college project)' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Geocoder status ' + res.statusCode));
        try {
          const arr = JSON.parse(data);
          resolve(Array.isArray(arr) ? arr.map(a => ({ name: a.display_name, lat: parseFloat(a.lat), lng: parseFloat(a.lon) })) : []);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Geocoder timeout')));
  });
}

async function nominatim(query, bounded) {
  await throttle();
  const list = await nominatimRaw(query, bounded, 1);
  return list[0] ? { lat: list[0].lat, lng: list[0].lng } : null;
}

// Free-text place search for the admin's Map Setup page (up to 6 matches).
async function searchPlaces(q) {
  const text = String(q || '').trim();
  if (text.length < 2) return [];
  await throttle();
  const withCity = /nagpur/i.test(text) ? text : text + ', Nagpur';
  return nominatimRaw(withCity, false, 6);
}

const queue = [];
const queued = new Set();
const failed = new Set(); // lookups that errored this run (e.g. no internet) - not saved as "missing"
let working = false;

function enqueue(names) {
  (names || []).forEach(n => {
    const k = keyOf(n);
    if (!k || overrides[k] || queued.has(k) || failed.has(k)) return;
    queued.add(k);
    queue.push(n);
  });
  if (!working && queue.length) work();
}

async function work() {
  working = true;
  while (queue.length) {
    const name = queue.shift();
    const k = keyOf(name);
    try {
      const cached = await Geocode.findOne({ key: k });
      if (!cached) {
        let hit = await nominatim(aliasFor(name) + ', Nagpur', true);
        if (!hit) {
          const loose = await nominatim(aliasFor(name) + ', Nagpur, Maharashtra', false);
          if (insideNagpur(loose)) hit = loose;
        }
        await Geocode.create({ key: k, name, lat: hit ? hit.lat : null, lng: hit ? hit.lng : null, found: !!hit });
      }
    } catch (err) {
      if (err && err.code === 11000) { /* saved by someone else meanwhile */ }
      else { failed.add(k); console.warn('Map lookup failed for "' + name + '":', err.message); }
    }
    queued.delete(k);
  }
  working = false;
}

// status: ok (lat/lng ready) | pending (being looked up) | missing (not found)
async function resolve(names) {
  const results = [];
  const toQueue = [];
  for (const name of names) {
    const k = keyOf(name);
    if (overrides[k]) { results.push({ name, lat: overrides[k].lat, lng: overrides[k].lng, status: 'ok', manual: true }); continue; }
    const doc = await Geocode.findOne({ key: k });
    if (doc) {
      results.push(doc.found ? { name, lat: doc.lat, lng: doc.lng, status: 'ok', manual: !!doc.manual } : { name, status: 'missing' });
    } else if (failed.has(k)) {
      results.push({ name, status: 'missing' });
    } else {
      toQueue.push(name);
      results.push({ name, status: 'pending' });
    }
  }
  if (toQueue.length) enqueue(toQueue);
  return results;
}

// Admin placed a stop on the map by hand.
async function setPosition(name, lat, lng) {
  const k = keyOf(name);
  await Geocode.findOneAndUpdate({ key: k }, { key: k, name, lat, lng, found: true, manual: true }, { upsert: true, new: true });
  failed.delete(k);
}

// Forget a stop's saved position so it is searched again automatically.
async function resetPosition(name) {
  const k = keyOf(name);
  await Geocode.deleteOne({ key: k });
  failed.delete(k);
  queued.delete(k);
}

module.exports = { resolve, enqueue, searchPlaces, setPosition, resetPosition };
