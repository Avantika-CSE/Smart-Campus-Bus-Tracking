const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  busId: { type: String, required: true, unique: true },
  stopIndex: { type: Number, default: 0 },
  status: { type: String, enum: ['idle', 'running', 'completed'], default: 'idle' }
}, { timestamps: true });

module.exports = mongoose.model('Progress', progressSchema);
