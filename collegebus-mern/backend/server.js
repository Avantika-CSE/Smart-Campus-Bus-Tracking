require('dotenv').config();
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');
const seedIfEmpty = require('./utils/seed');
const { initSocket } = require('./sockets');

const authRoutes = require('./routes/auth');
const studentAuthRoutes = require('./routes/studentAuth');
const adminSearchRoutes = require('./routes/adminSearch');
const busRoutes = require('./routes/buses');
const routeRoutes = require('./routes/routes');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const progressRoutes = require('./routes/progress');
const settingsRoutes = require('./routes/settings');
const studentRoutes = require('./routes/students');
const driverRoutes = require('./routes/drivers');
const geoRoutes = require('./routes/geo');
const Bus = require('./models/Bus');
const User = require('./models/User');
const { enqueue: enqueueGeocode } = require('./utils/geocode');
const { isMailConfigured } = require('./utils/mailer');

const PORT = process.env.PORT || 5050;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || ('http://localhost:' + PORT);

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Behind a hosting proxy (Render etc.) set TRUST_PROXY=1 so rate limits see each visitor's real IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || 1);

app.use('/api/auth/student', studentAuthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin/search', adminSearchRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/geo', geoRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'), (err) => { if (err) next(); });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

function openInChrome(url) {
  const platform = process.platform;
  let commands = [];
  if (platform === 'darwin') commands = ['open -a "Google Chrome" ' + url, 'open ' + url];
  else if (platform === 'win32') commands = ['start chrome ' + url, 'start ' + url];
  else commands = ['google-chrome ' + url, 'google-chrome-stable ' + url, 'chromium-browser ' + url, 'xdg-open ' + url];

  const tryNext = (i) => {
    if (i >= commands.length) { console.log('Could not auto-open a browser. Please open ' + url + ' manually.'); return; }
    exec(commands[i], (err) => { if (err) tryNext(i + 1); });
  };
  tryNext(0);
}

// Extra indexes. Each one is created safely: if it can't be built (for example
// because old data has a duplicate), the server only prints a warning.
async function ensureIndexes() {
  const tries = [
    ['one student per e-mail', () => User.collection.createIndex({ email: 1 }, { unique: true, name: 'uniq_student_email', partialFilterExpression: { role: 'student' } })],
    ['bus by driver', () => Bus.collection.createIndex({ driverId: 1 }, { name: 'bus_driverId' })]
  ];
  for (const [label, run] of tries) {
    try { await run(); } catch (err) { console.warn('  Note: could not create index (' + label + '):', err.message); }
  }
}

(async function start() {
  await connectDB();
  await seedIfEmpty();
  await ensureIndexes();

  const server = http.createServer(app);
  initSocket(server, CLIENT_ORIGIN);

  server.listen(PORT, () => {
    const url = 'http://localhost:' + PORT;
    console.log('');
    console.log('  CollegeBus Tracking System (MERN) is running!');
    console.log('  ' + url);
    console.log('');
    console.log('  Students sign in with their email: an OTP is mailed to them (no password).');
    console.log('  Admin Unique ID format:  JIT-ADM-101 or higher (no upper limit)');
    console.log('  Drivers are added by the admin (Manage Drivers) and get a JIT-DRV-201+ ID.');
    if (!isMailConfigured()) {
      console.log('  \u26a0\ufe0f  BREVO_API_KEY / BREVO_SENDER_EMAIL are not set in backend/.env - students cannot sign in until the OTP email is configured.');
    }
    if (!String(process.env.ADMIN_SECRET_CODE || '').trim()) {
      console.log('  \u26a0\ufe0f  ADMIN_SECRET_CODE is not set in backend/.env - new admins cannot be registered until you add it.');
    }
    console.log('');
    openInChrome(url);

    // Look up map positions for every known stop in the background.
    Bus.find().select('stops').then(buses => {
      const names = [];
      buses.forEach(b => b.stops.forEach(s => names.push(s.name)));
      enqueueGeocode(names);
    }).catch(() => {});
  });
})();
