const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  time: { type: String, default: '' }
}, { _id: false });

const busSchema = new mongoose.Schema({
  busId: { type: String, required: true, unique: true }, // stable client-facing id: "B1", "B_RT8", "B_DRV_<UID>"
  no: { type: String, required: true },
  routeId: { type: String, default: '' },
  routeName: { type: String, default: '' },
  routeDesc: { type: String, default: '' },
  driverId: { type: String, default: '' }, // the driver's Unique ID that "owns" this bus (claim), if any
  driverName: { type: String, default: '' },
  contact: { type: String, default: '' },
  departure: { type: String, default: '' },
  arrival: { type: String, default: '' },
  status: { type: String, default: 'On Time' },
  location: { type: String, default: '' },
  inMaintenance: { type: Boolean, default: false },
  stops: { type: [stopSchema], default: [] },
  startLabel: { type: String, default: 'College' },
  destLabel: { type: String, default: 'Main Stop' }
}, { timestamps: true });

module.exports = mongoose.model('Bus', busSchema);
