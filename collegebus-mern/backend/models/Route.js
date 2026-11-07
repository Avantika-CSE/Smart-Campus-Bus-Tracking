const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  time: { type: String, default: '' }
}, { _id: false });

const routeSchema = new mongoose.Schema({
  routeId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  title: { type: String, default: '' },
  stops: { type: [stopSchema], default: [] },
  driverName: { type: String, default: '' },
  driverPhone: { type: String, default: '' },
  busNo: { type: String, default: '' },
  startPoint: { type: String, default: '' },
  endPoint: { type: String, default: '' },
  departure: { type: String, default: '' },
  arrival: { type: String, default: '' },
  perf: {
    onTime: { type: Number, default: 85 },
    delayed: { type: Number, default: 12 },
    cancelled: { type: Number, default: 3 }
  },
  active: { type: Boolean, default: true },
  real: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema);
