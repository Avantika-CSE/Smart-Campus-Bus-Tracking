const mongoose = require('mongoose');

const adminSetupSchema = new mongoose.Schema({
  collegeName: { type: String, required: true },
  collegeAddress: { type: String, required: true },
  collegePin: { type: String, required: true },
  adminName: { type: String, required: true },
  adminUniqueId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  adminEmail: { type: String, required: true, lowercase: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('AdminSetup', adminSetupSchema);
