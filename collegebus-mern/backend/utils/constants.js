// Unique IDs are now UNLIMITED: any number after the prefix is valid
// (JIT-ADM-1, JIT-ADM-101, JIT-ADM-5000 ... and JIT-DRV-1, JIT-DRV-206 ...).
// Admin IDs start at JIT-ADM-101 and drivers at JIT-DRV-201, with no upper limit.
const ADMIN_ID_MIN = 101;
const DRIVER_ID_MIN = 201;
function idNumber(uid, prefix) {
  const m = String(uid || '').trim().toUpperCase().match(new RegExp('^' + prefix + '-(\\d+)$'));
  return m ? parseInt(m[1], 10) : null;
}
function isValidAdminId(uid) { const n = idNumber(uid, 'JIT-ADM'); return n !== null && n >= ADMIN_ID_MIN; }
function isValidDriverId(uid) { const n = idNumber(uid, 'JIT-DRV'); return n !== null && n >= DRIVER_ID_MIN; }

// Route waypoints for the demo Route 1 live-map animation (percentage positions).
const ROUTE_PATH = [
  { name: 'College', x: 16, y: 86 },
  { name: 'Sadar', x: 34, y: 62 },
  { name: 'Lakdganj', x: 47, y: 47 },
  { name: 'Civil Lines', x: 56, y: 24 },
  { name: 'Main Stop', x: 82, y: 14 }
];

// Real JIT college route data (AY 2026-27) - Routes 5, 6 and 8 as provided.
// Bus numbers were not given in the source PDF, so they are placeholder
// plate numbers assigned for this demo only.
const REAL_ROUTES = [
  {
    id: 'RT8', name: 'Route 8', title: 'Teka Naka to JIT', busNo: 'MH 31 RT 0801',
    driverName: 'Mayur Bhagat', driverPhone: '7776930639',
    startPoint: 'Teka Naka', endPoint: 'JIT', departure: '7:45 AM', arrival: '8:45 AM',
    stops: [
      { name: 'Teka Naka', time: '7:45' },
      { name: 'Kamal Chowk', time: '7:55' },
      { name: 'Indora Chowk', time: '8:00' },
      { name: 'Indora Ground', time: '8:05' },
      { name: 'Bara (12) Kholi', time: '8:15' },
      { name: 'Bhim Chowk', time: '8:20' },
      { name: 'Jaripatka Police Station', time: '8:30' },
      { name: 'Koradi Naka', time: '-' },
      { name: 'JIT College', time: '8:45' }
    ]
  },
  {
    id: 'RT5', name: 'Route 5', title: 'Dabha to JIT', busNo: 'MH 31 RT 0502',
    driverName: 'Jagdish Chelani', driverPhone: '8766668136',
    startPoint: 'Dabha', endPoint: 'JIT', departure: '7:30 AM', arrival: '8:55 AM',
    stops: [
      { name: 'Dabha', time: '7:30' },
      { name: 'Wadi', time: '7:33' },
      { name: 'University Campus', time: '7:38' },
      { name: 'Subhash Nagar', time: '7:42' },
      { name: 'IT Park', time: '7:45' },
      { name: 'Abhyankar Nagar Chowk', time: '7:50' },
      { name: 'Ram Nagar', time: '7:54' },
      { name: 'Ravi Nagar', time: '7:58' },
      { name: 'Law College Chowk', time: '8:01' },
      { name: 'Ladies Club Chowk', time: '8:04' },
      { name: 'Liberty Chowk', time: '8:10' },
      { name: 'Paratha Shop', time: '8:13' },
      { name: 'Sadar Bus Stop', time: '8:16' },
      { name: 'Chawni Hostel', time: '8:20' },
      { name: 'Pagalkhana Chowk', time: '8:23' },
      { name: 'Mankapur Stadium', time: '8:25' },
      { name: 'Mankapur Chowk', time: '8:27' },
      { name: 'Faras', time: '8:30' },
      { name: 'JIT College', time: '8:55' }
    ]
  },
  {
    id: 'RT6', name: 'Route 6', title: 'Katol Toll Tax to JIT', busNo: 'MH 31 RT 0601',
    driverName: 'Sunil', driverPhone: '9595512760',
    startPoint: 'Katol Toll Tax', endPoint: 'JIT', departure: '7:40 AM', arrival: '8:45 AM',
    stops: [
      { name: 'Gorewada Chowk Ring Rd', time: '7:40' },
      { name: 'Katol Toll Tax', time: '7:45' },
      { name: 'Fire College', time: '7:48' },
      { name: 'Hajari Pahad', time: '7:52' },
      { name: 'Friends Colony', time: '7:56' },
      { name: 'Gitti Khadan', time: '8:00' },
      { name: 'Borgaon Dinshaw Factory', time: '8:03' },
      { name: 'Shyam Lawn', time: '8:10' },
      { name: 'Zingabai Takli', time: '8:15' },
      { name: 'Pandurang Mangal Karyalay', time: '8:18' },
      { name: 'Shri Krishna Sabhagruh', time: '8:22' },
      { name: 'Ganpati Nagar', time: '8:25' },
      { name: 'Raj Tower', time: '8:28' },
      { name: 'IDBI Bank Godhani Rd', time: '8:30' },
      { name: 'Divya Nagri', time: '8:33' },
      { name: 'Godhani Bus Stop', time: '8:36' },
      { name: 'JIT College', time: '8:45' }
    ]
  }
];

module.exports = { ADMIN_ID_MIN, DRIVER_ID_MIN, isValidAdminId, isValidDriverId, ROUTE_PATH, REAL_ROUTES };
