const mongoose = require('mongoose');

// Remembers the real road path between a set of stops, so the road-routing
// service is only asked once per unique route.
const routeGeometrySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  path: { type: mongoose.Schema.Types.Mixed, default: null } // [[lat, lng], ...]
}, { timestamps: true });

module.exports = mongoose.model('RouteGeometry', routeGeometrySchema);
