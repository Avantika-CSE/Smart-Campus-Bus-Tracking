const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  collegeName: { type: String, default: 'Heavenly City College' },
  officeContact: { type: String, default: '' },
  interval: { type: Number, default: 6 }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
