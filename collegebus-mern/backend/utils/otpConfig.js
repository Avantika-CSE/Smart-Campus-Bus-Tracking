// All OTP numbers are configurable in backend/.env (sensible defaults below).
function num(name, def, min, max) {
  const n = parseInt(process.env[name], 10);
  if (!isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function otpConfig() {
  return {
    ttlMinutes: num('OTP_TTL_MINUTES', 5, 1, 30),                 // how long an OTP stays valid
    maxWrongTries: num('OTP_MAX_ATTEMPTS', 5, 1, 10),             // wrong guesses before the OTP is thrown away
    resendCooldownSeconds: num('OTP_RESEND_COOLDOWN_SECONDS', 60, 10, 600),
    maxPerHourPerEmail: num('OTP_MAX_PER_HOUR', 5, 1, 20),        // OTP e-mails per address per hour
    maxPerHourPerIp: num('OTP_MAX_PER_HOUR_PER_IP', 20, 1, 200),
    verifyPer15MinPerEmail: num('OTP_VERIFY_PER_15_MIN', 10, 3, 100),
    verifyPer15MinPerIp: num('OTP_VERIFY_PER_15_MIN_PER_IP', 40, 5, 500)
  };
}

module.exports = { otpConfig };
