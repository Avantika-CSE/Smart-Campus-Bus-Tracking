const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const Notification = require('../models/Notification');
const Progress = require('../models/Progress');
const { REAL_ROUTES, ROUTE_PATH } = require('./constants');

async function seedIfEmpty() {
  // The demo data is only for a brand-new, empty database. (Students are no
  // longer seeded: they sign in with an email OTP and are created on first login.)
  const existing = (await User.countDocuments()) + (await Bus.countDocuments());
  if (existing > 0) {
    console.log('ℹ️  Database already has data - skipping seed.');
    return;
  }

  console.log('🌱 Seeding initial demo data...');

  await Bus.create({
    busId: 'B1', no: 'MH 31 AB 1234', routeId: 'R1', routeName: 'Route 1',
    routeDesc: 'College - Civil Lines - Main Stop', driverName: 'Ramesh Kumar',
    contact: '+91 98765 43210', departure: '8:00 AM', status: 'On Time', location: 'Near Civil Lines',
    stops: ROUTE_PATH.map(p => ({ name: p.name, time: '' })),
    startLabel: 'College', destLabel: 'Main Stop'
  });
  await Route.create({
    routeId: 'R1', name: 'Route 1', title: 'College - Civil Lines - Main Stop',
    stops: ROUTE_PATH.map(p => ({ name: p.name, time: '' })),
    perf: { onTime: 88, delayed: 10, cancelled: 2 }, active: true, real: false
  });
  await Progress.create({ busId: 'B1', stopIndex: 0, status: 'idle' });

  for (const r of REAL_ROUTES) {
    await Bus.create({
      busId: 'B_' + r.id, no: r.busNo, routeId: r.id, routeName: r.name, routeDesc: r.title,
      driverName: r.driverName, contact: '+91 ' + r.driverPhone, departure: r.departure, arrival: r.arrival,
      status: 'On Time', location: r.startPoint, stops: r.stops,
      startLabel: r.startPoint, destLabel: r.endPoint + ' College'
    });
    await Route.create({
      routeId: r.id, name: r.name, title: r.title, stops: r.stops,
      driverName: r.driverName, driverPhone: r.driverPhone, busNo: r.busNo,
      startPoint: r.startPoint, endPoint: r.endPoint, departure: r.departure, arrival: r.arrival,
      perf: { onTime: 85, delayed: 12, cancelled: 3 }, active: true, real: true
    });
    await Progress.create({ busId: 'B_' + r.id, stopIndex: 0, status: 'idle' });
  }

  await Notification.insertMany([
    { forRole: 'student', title: 'Bus Arrived', desc: 'Your bus has reached Civil Lines stop.', type: 'success', time: '08:05 AM' },
    { forRole: 'student', title: 'Live Location Updated', desc: 'Bus is currently near Civil Lines.', type: 'info', time: '07:45 AM' },
    { forRole: 'student', title: 'Delay Alert', desc: 'Bus is delayed by 10 minutes due to traffic.', type: 'warning', time: '07:20 AM' },
    { forRole: 'student', title: 'Route Changed', desc: 'College will remain closed on 15th Sept.', type: 'purple', time: 'Yesterday' },
    { forRole: 'admin', title: 'Routes 5, 6 & 8 loaded', desc: 'Real JIT route + driver data seeded.', type: 'info', time: 'Just now' },
    { forRole: 'driver', title: 'Route Reminder', desc: 'Please follow the route and maintain proper time.', type: 'info', time: '08:05 AM' }
  ]);

  console.log('✅ Seed complete.');
}

module.exports = seedIfEmpty;
