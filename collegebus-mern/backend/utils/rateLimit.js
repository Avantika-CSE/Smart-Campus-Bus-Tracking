// Small in-memory rate limiter (sliding window). Good for one server process;
// the numbers reset when the server restarts. The wrong-guess counter for each
// OTP is stored in MongoDB, so that protection survives restarts.
const buckets = new Map();

// Records a hit and returns 0 if allowed, else how many seconds to wait.
//   gapMs     - minimum time between two hits (optional)
//   max       - max hits inside windowMs
function hit(key, { windowMs, max, gapMs = 0 }) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (gapMs && list.length && now - list[list.length - 1] < gapMs) {
    buckets.set(key, list);
    return Math.ceil((gapMs - (now - list[list.length - 1])) / 1000);
  }
  if (list.length >= max) {
    buckets.set(key, list);
    return Math.ceil((windowMs - (now - list[0])) / 1000);
  }
  list.push(now);
  buckets.set(key, list);
  return 0;
}

// Checks without recording (used to test several keys before counting any).
function wait(key, { windowMs, max, gapMs = 0 }) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (gapMs && list.length && now - list[list.length - 1] < gapMs) return Math.ceil((gapMs - (now - list[list.length - 1])) / 1000);
  if (list.length >= max) return Math.ceil((windowMs - (now - list[0])) / 1000);
  return 0;
}
function record(key, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
}

// Housekeeping so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of buckets) {
    if (!list.length || now - list[list.length - 1] > 3600 * 1000) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

// Takes back the most recent hit (used when an OTP e-mail could not be sent,
// so a delivery problem doesn't also lock the student out for the cooldown).
function undo(key) { const l = buckets.get(key); if (l && l.length) l.pop(); }

function reset() { buckets.clear(); }

module.exports = { hit, wait, record, undo, reset };
