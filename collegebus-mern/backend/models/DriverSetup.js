const mongoose = require('mongoose');

const driverSetupSchema = new mongoose.Schema({
  collegeName: { type: String, required: true },
  collegeAddress: { type: String, required: true },
  collegePin: { type: String, required: true },
  startingPoint: { type: String, required: true },
  endingPoint: { type: String, default: 'JIT' },
  driverName: { type: String, required: true },
  driverUniqueId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  driverEmail: { type: String, required: true, lowercase: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('DriverSetup', driverSetupSchema);
