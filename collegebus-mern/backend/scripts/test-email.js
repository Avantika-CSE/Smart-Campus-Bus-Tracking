#!/usr/bin/env node
/* Sends ONE test e-mail through Brevo so you can check your set-up
   without going through the student OTP screens.

     cd backend
     npm run test-email -- you@example.com

   It prints the result only; the API key is never shown. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { isMailConfigured, sendTestMail } = require('../utils/mailer');

(async () => {
  const to = (process.argv[2] || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { console.error('Usage: npm run test-email -- you@example.com'); process.exit(1); }
  if (!isMailConfigured()) {
    console.error('Brevo is not configured. Add BREVO_API_KEY and BREVO_SENDER_EMAIL to backend/.env (see .env.example).');
    process.exit(1);
  }
  try {
    const r = await sendTestMail(to);
    console.log('Brevo accepted the email for ' + to + (r.messageId ? ' (message id ' + r.messageId + ')' : '') + '.');
    console.log('Now check that inbox (and Spam). Delivery details: https://app.brevo.com/transactional/email/logs');
  } catch (err) {
    console.error('Could not send: ' + err.message);
    process.exit(1);
  }
})();
