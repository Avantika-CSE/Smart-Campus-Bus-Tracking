const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pinRe = /^[1-9][0-9]{5}$/;
const phoneRe = /^[+]?[\d\s-]{7,15}$/;

function isValidEmail(v) { return emailRe.test(String(v || '').trim()); }
function isValidPin(v) { return pinRe.test(String(v || '').trim()); }
function isValidPhone(v) { return phoneRe.test(String(v || '').trim()); }
function normText(v) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase(); }
function normUid(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

module.exports = { isValidEmail, isValidPin, isValidPhone, normText, normUid };
