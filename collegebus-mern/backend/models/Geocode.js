const mongoose = require('mongoose');

// Remembers where each stop name is on the map, so the internet lookup
// only ever happens once per stop.
const geocodeSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  found: { type: Boolean, default: false },
  manual: { type: Boolean, default: false } // set by the admin on the map
}, { timestamps: true });

module.exports = mongoose.model('Geocode', geocodeSchema);
