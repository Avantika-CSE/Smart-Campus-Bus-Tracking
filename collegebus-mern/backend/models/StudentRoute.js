const mongoose = require('mongoose');

const studentRouteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  routeId: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('StudentRoute', studentRouteSchema);
