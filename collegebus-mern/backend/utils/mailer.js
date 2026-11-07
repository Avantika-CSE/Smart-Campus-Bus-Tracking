// Sends e-mail through Brevo's official transactional e-mail API.
//   POST https://api.brevo.com/v3/smtp/email   (header: api-key)
//
// Configure in backend/.env (never in frontend code):
//   BREVO_API_KEY       the API key from Brevo (SMTP & API -> API Keys)
//   BREVO_SENDER_EMAIL  a sender address you have VERIFIED in Brevo
//   BREVO_SENDER_NAME   shown as the sender name (default: College Bus Management)
//
// Uses only Node's built-in https module (no extra package). The API key is
// sent only in the request header and is never logged, returned or thrown.
const https = require('https');

const API_HOST = 'api.brevo.com';
const API_PATH = '/v3/smtp/email';
const TIMEOUT_MS = 12000;

function settings() {
  return {
    apiKey: String(process.env.BREVO_API_KEY || '').trim(),
    senderEmail: String(process.env.BREVO_SENDER_EMAIL || '').trim(),
    senderName: String(process.env.BREVO_SENDER_NAME || 'College Bus Management').trim() || 'College Bus Management'
  };
}

function isMailConfigured() {
  const s = settings();
  return !!(s.apiKey && s.senderEmail);
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Turns a Brevo error reply into a short, safe message for the SERVER log
// (it tells the owner what to fix; the student only ever sees a generic message).
function describeFailure(status, body) {
  let detail = '';
  try { detail = (JSON.parse(body) || {}).message || ''; } catch (e) { detail = ''; }
  detail = String(detail).slice(0, 300);
  let hint = '';
  if (status === 401) {
    hint = /ip/i.test(detail)
      ? 'Brevo blocked this computer\'s IP address. In Brevo open Security -> Authorised IPs and add this IP or turn the restriction off.'
      : 'The Brevo API key is wrong, was deleted, or has a stray space/quote in backend/.env (BREVO_API_KEY).';
  } else if (status === 400 && /sender/i.test(detail)) {
    hint = 'BREVO_SENDER_EMAIL is not a verified sender in Brevo (Senders, Domains & Dedicated IPs -> Senders).';
  } else if (status === 403) {
    hint = 'Brevo refused the request. The account may still need activation or approval from Brevo.';
  } else if (status === 429) {
    hint = 'Brevo says you are sending too fast, or the daily limit of the plan is used up.';
  } else if (status >= 500) {
    hint = 'Brevo had a problem on its side. Try again in a minute.';
  }
  const err = new Error('Brevo replied ' + status + (detail ? ' - ' + detail : '') + (hint ? ' | ' + hint : ''));
  err.status = status;
  return err;
}

function postToBrevo(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      host: API_HOST, path: API_PATH, method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json', 'content-length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let id = '';
          try { id = (JSON.parse(body) || {}).messageId || ''; } catch (e) { id = ''; }
          resolve({ messageId: id });
        } else reject(describeFailure(res.statusCode, body));
      });
    });
    req.on('error', e => reject(new Error('Could not reach Brevo (' + (e.code || e.message) + '). Check the internet connection.')));
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

async function send({ to, subject, text, html, tag }) {
  const s = settings();
  if (!isMailConfigured()) throw new Error('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL).');
  return postToBrevo({
    sender: { name: s.senderName, email: s.senderEmail },
    to: [{ email: to }],
    subject, textContent: text, htmlContent: html,
    tags: tag ? [tag] : undefined
  }, s.apiKey);
}

async function sendLoginOtpMail(to, code, ttlMinutes) {
  const s = settings();
  const spaced = String(code).split('').join(' ');

  const text =
    'Hi,\n\n' +
    'Use this OTP to sign in to College Bus Management:\n\n' +
    spaced + '\n\n' +
    'This code is valid for ' + ttlMinutes + ' minutes and can be used only once. Please do not share it with anyone.\n\n' +
    'If you did not try to sign in, you can ignore this email.\n\n' +
    s.senderName;

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:auto;color:#1f2937;">' +
    '<p>Hi,</p>' +
    '<p>Use this OTP to sign in to College Bus Management:</p>' +
    '<div style="font-size:30px;font-weight:700;letter-spacing:6px;text-align:center;background:#eaf1ff;color:#1d4ed8;border-radius:10px;padding:16px 8px;margin:18px 0;">' + esc(spaced) + '</div>' +
    '<p>This code is valid for <b>' + esc(ttlMinutes) + ' minutes</b> and can be used only once. Please do not share it with anyone.</p>' +
    '<p style="color:#6b7280;font-size:13px;">If you did not try to sign in, you can ignore this email.</p>' +
    '<p style="color:#6b7280;font-size:13px;">' + esc(s.senderName) + '</p>' +
    '</div>';

  return send({ to, subject: 'Your login code: ' + code, text, html, tag: 'student-login-otp' });
}

// Used by `npm run test-email` to check the Brevo set-up without any OTP.
async function sendTestMail(to) {
  const s = settings();
  return send({
    to, tag: 'setup-test',
    subject: 'Test email from ' + s.senderName,
    text: 'If you can read this, Brevo is connected to your College Bus Management backend.',
    html: '<p>If you can read this, <b>Brevo is connected</b> to your College Bus Management backend.</p>'
  });
}

module.exports = { isMailConfigured, sendLoginOtpMail, sendTestMail };
