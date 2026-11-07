const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const { signToken } = require('../utils/token');
const { isValidEmail } = require('../utils/validators');
const { isMailConfigured, sendLoginOtpMail } = require('../utils/mailer');
const { otpConfig } = require('../utils/otpConfig');
const limiter = require('../utils/rateLimit');
const { resetStudentDoc, needsReset, emailLocalPart, newPlaceholderRoll } = require('../utils/studentReset');
const { PLACEHOLDER_ROLL } = require('../utils/studentReset');

/* ============ Student sign-in: email + one-time password ============
   POST /otp/request  { email }        -> mails a 6-digit OTP
   POST /otp/verify   { email, otp }   -> checks it, signs the student in
   (a student's first sign-in also creates their account)
   Admin and driver sign-in are NOT touched by this file.                */

const router = express.Router();
const BAD_OTP = { message: 'Incorrect or expired OTP. Please try again, or request a new OTP.' };

function normEmail(v) { return String(v || '').trim().toLowerCase(); }

function hashOtp(email, code) {
  return crypto.createHmac('sha256', String(process.env.JWT_SECRET || 'collegebus')).update(email + ':' + code).digest('hex');
}

function safeStudent(user) {
  return {
    id: user._id, name: user.name, email: user.email,
    roll: PLACEHOLDER_ROLL.test(user.roll || '') ? '' : user.roll,
    role: user.role, phone: user.phone, dept: user.dept,
    emailVerified: !!user.emailVerified, profileComplete: user.profileComplete === true
  };
}

router.post('/otp/request', async (req, res) => {
  try {
    const email = normEmail(req.body && req.body.email);
    if (!email || email.length > 254 || !isValidEmail(email)) {
      return res.status(400).json({ field: 'email', message: 'Enter a valid email address.' });
    }
    if (!isMailConfigured()) {
      return res.status(503).json({ message: 'Email OTP is not set up on this server yet. Please contact the admin.' });
    }

    const cfg = otpConfig();
    const emailKey = 'otp-req-email:' + email, ipKey = 'otp-req-ip:' + (req.ip || '');
    const rules = [
      [emailKey, { windowMs: 3600 * 1000, max: cfg.maxPerHourPerEmail, gapMs: cfg.resendCooldownSeconds * 1000 }],
      [ipKey, { windowMs: 3600 * 1000, max: cfg.maxPerHourPerIp }]
    ];
    const wait = Math.max(...rules.map(([k, r]) => limiter.wait(k, r)));
    if (wait > 0) return res.status(429).json({ message: 'Please wait ' + wait + ' seconds before asking for another OTP.', retryAfterSeconds: wait });
    rules.forEach(([k, r]) => limiter.record(k, r.windowMs));

    const code = String(crypto.randomInt(100000, 1000000));
    await EmailOtp.deleteMany({ email, purpose: 'student-login' });   // a new OTP replaces any earlier one
    await EmailOtp.create({ email, purpose: 'student-login', codeHash: hashOtp(email, code), expiresAt: new Date(Date.now() + cfg.ttlMinutes * 60 * 1000) });
    try {
      await sendLoginOtpMail(email, code, cfg.ttlMinutes);
    } catch (mailErr) {
      await EmailOtp.deleteMany({ email, purpose: 'student-login' });
      rules.forEach(([k]) => limiter.undo(k));   // a failed delivery must not use up the student's tries
      console.error('Login OTP e-mail could not be sent:', mailErr.message);
      return res.status(502).json({ message: 'Could not send the email right now. Please try again in a minute.' });
    }

    // The answer is the same for every address, so it never reveals whether an account exists.
    res.json({ sent: true, expiresInMinutes: cfg.ttlMinutes, cooldownSeconds: cfg.resendCooldownSeconds,
      message: 'We have sent a 6-digit OTP to ' + email + '. It is valid for ' + cfg.ttlMinutes + ' minutes. Please also check your Spam folder.' });
  } catch (err) {
    console.error('OTP request failed:', err.message);
    res.status(500).json({ message: 'Could not send the OTP right now. Please try again.' });
  }
});

router.post('/otp/verify', async (req, res) => {
  try {
    const email = normEmail(req.body && req.body.email);
    const otp = String((req.body && req.body.otp) || '').trim();
    if (!email || email.length > 254 || !isValidEmail(email) || !/^\d{6}$/.test(otp)) return res.status(400).json(BAD_OTP);

    const cfg = otpConfig();
    const rules = [
      ['otp-ver-email:' + email, { windowMs: 15 * 60 * 1000, max: cfg.verifyPer15MinPerEmail }],
      ['otp-ver-ip:' + (req.ip || ''), { windowMs: 15 * 60 * 1000, max: cfg.verifyPer15MinPerIp }]
    ];
    const wait = Math.max(...rules.map(([k, r]) => limiter.wait(k, r)));
    if (wait > 0) return res.status(429).json({ message: 'Too many attempts. Please wait a few minutes and try again.', retryAfterSeconds: wait });
    rules.forEach(([k, r]) => limiter.record(k, r.windowMs));

    const record = await EmailOtp.findOne({ email, purpose: 'student-login', usedAt: null }).sort({ createdAt: -1 });
    if (!record || record.expiresAt < new Date()) return res.status(400).json(BAD_OTP);
    if ((record.attempts || 0) >= cfg.maxWrongTries) { await EmailOtp.deleteMany({ email, purpose: 'student-login' }); return res.status(400).json(BAD_OTP); }

    const given = Buffer.from(hashOtp(email, otp));
    const real = Buffer.from(String(record.codeHash));
    const same = given.length === real.length && crypto.timingSafeEqual(given, real);
    if (!same) {
      const updated = await EmailOtp.findOneAndUpdate({ _id: record._id }, { $inc: { attempts: 1 } }, { new: true });
      if (updated && updated.attempts >= cfg.maxWrongTries) await EmailOtp.deleteMany({ email, purpose: 'student-login' });
      return res.status(400).json(BAD_OTP);
    }

    // Single use: only the request that flips usedAt gets to sign in.
    const claimed = await EmailOtp.findOneAndUpdate({ _id: record._id, usedAt: null }, { usedAt: new Date() }, { new: true });
    if (!claimed) return res.status(400).json(BAD_OTP);
    await EmailOtp.deleteMany({ email, purpose: 'student-login' });

    let user = await User.findOne({ role: 'student', email });
    if (!user) {
      user = await User.create({
        name: emailLocalPart(email), email, roll: newPlaceholderRoll(), role: 'student',
        emailVerified: true, profileComplete: false, authVersion: 2, lastLoginAt: new Date()
      });
    } else {
      if (needsReset(user)) resetStudentDoc(user);        // old password account: start onboarding again (nothing is deleted)
      user.emailVerified = true;
      user.lastLoginAt = new Date();
      await user.save();
    }

    res.json({ token: signToken(user, { ov: 2 }), user: safeStudent(user) });
  } catch (err) {
    console.error('OTP verify failed:', err.message);
    res.status(500).json({ message: 'Could not verify the OTP right now. Please try again.' });
  }
});

module.exports = router;
module.exports.safeStudent = safeStudent;
