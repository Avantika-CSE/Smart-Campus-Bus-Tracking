const mongoose = require('mongoose');

// One-time password for "forgot password". Only a scrambled (hashed) copy of
// the code is stored, never the code itself.
const otpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },      // wrong tries so far
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// MongoDB removes the record by itself once it has expired.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
