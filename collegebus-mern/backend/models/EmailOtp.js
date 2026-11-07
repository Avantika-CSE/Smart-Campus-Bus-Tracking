const mongoose = require('mongoose');

// One-time code for the student e-mail login. The code itself is never stored,
// only a keyed hash of it. MongoDB deletes the record after it has expired.
const emailOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  purpose: { type: String, default: 'student-login' },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },      // wrong tries so far
  usedAt: { type: Date, default: null },       // set the moment the OTP is accepted (single use)
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
