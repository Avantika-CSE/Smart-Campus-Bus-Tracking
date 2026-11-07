const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  roll: { type: String, required: true, trim: true }, // roll number (student) or unique ID (admin/driver)
  role: { type: String, enum: ['student', 'admin', 'driver'], required: true },
  password: { type: String, default: '' }, // legacy only: students no longer use a password; admin/driver never had one
  phone: { type: String, default: '' },
  dept: { type: String, default: '' },

  // ---- student e-mail OTP login (admin/driver records never use these) ----
  emailVerified: { type: Boolean, default: false },   // proved ownership of the e-mail with an OTP
  profileComplete: { type: Boolean, default: true },  // false until the student has filled the profile
  authVersion: { type: Number },                      // 2 = email-OTP account, missing = legacy password account
  onboardingResetAt: { type: Date },                  // when an old account's onboarding was reset
  previousProfile: { type: mongoose.Schema.Types.Mixed }, // the old profile, kept so the reset can be undone
  lastLoginAt: { type: Date }
}, { timestamps: true });

userSchema.index({ role: 1, roll: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
