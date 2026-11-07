const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('\n❌ MONGODB_URI is not set.');
    console.error('   Copy backend/.env.example to backend/.env and paste your MongoDB connection URL into MONGODB_URI.\n');
    process.exit(1);
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ MongoDB connected:', mongoose.connection.name);
  } catch (err) {
    console.error('\n❌ Could not connect to MongoDB.');
    console.error('   Reason:', err.message);
    console.error('   Check that MONGODB_URI in backend/.env is correct, and that your IP is allowed');
    console.error('   in MongoDB Atlas Network Access (if using Atlas).\n');
    process.exit(1);
  }
}

module.exports = connectDB;
