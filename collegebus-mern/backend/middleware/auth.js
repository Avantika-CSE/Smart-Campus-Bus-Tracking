const { verifyToken } = require('../utils/token');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authenticated. Please log in again.' });

    const payload = verifyToken(token);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Account not found. Please log in again.' });

    // Students must come from the email-OTP login. Tokens from the old password
    // system carry no `ov` claim, so they are refused and the student signs in again.
    if (user.role === 'student' && !(payload.ov === 2 && user.authVersion === 2)) {
      return res.status(401).json({ message: 'Please sign in again with your email OTP.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Session expired or invalid. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not authorized to perform this action.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
