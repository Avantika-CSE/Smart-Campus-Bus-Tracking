const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  forRole: { type: String, enum: ['student', 'admin', 'driver'], required: true },
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  type: { type: String, default: 'info' },
  time: { type: String, default: '' },
  readBy: { type: [String], default: [] } // ids of the users who have read it
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
