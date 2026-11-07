const jwt = require('jsonwebtoken');

// `extra` lets a login flow add claims. Student tokens carry `ov: 2`
// ("signed in with the email-OTP flow"); the auth middleware refuses student
// tokens without it, so sessions from the old password login stop working.
function signToken(user, extra) {
  return jwt.sign(
    Object.assign({ id: user._id.toString(), role: user.role, name: user.name, roll: user.roll }, extra || {}),
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
