const crypto = require('crypto');

// Student accounts from the old (password) system are never deleted. Instead
// their onboarding is reset IN PLACE: the same database record (so the id that
// StudentRoute and others point to stays valid) keeps its email, while the
// profile fields are replaced by placeholders until the student signs in with
// an email OTP and fills the profile again. The old profile is kept inside the
// record (previousProfile) so the reset can be undone.
//
//   authVersion 2  = the account belongs to the email-OTP system
//   missing        = a legacy account from the password system

const PLACEHOLDER_ROLL = /^PENDING-/;

function emailLocalPart(email) {
  const local = String(email || '').split('@')[0] || 'Student';
  return local.slice(0, 40) || 'Student';
}

function newPlaceholderRoll() {
  return 'PENDING-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function needsReset(user) {
  return !!user && user.role === 'student' && user.authVersion !== 2;
}

// Resets one student document in place. Returns true if it changed anything.
// Calling it again on an already-reset account does nothing.
function resetStudentDoc(user, now) {
  if (!needsReset(user)) return false;
  user.previousProfile = {
    name: user.name, roll: user.roll, phone: user.phone || '', dept: user.dept || '',
    password: user.password || '', resetAt: (now || new Date()).toISOString()
  };
  user.markModified('previousProfile');
  user.name = emailLocalPart(user.email);
  user.roll = newPlaceholderRoll();
  user.phone = '';
  user.dept = '';
  user.password = '';              // students no longer sign in with a password
  user.profileComplete = false;
  user.emailVerified = false;
  user.authVersion = 2;
  user.onboardingResetAt = now || new Date();
  return true;
}

module.exports = { PLACEHOLDER_ROLL, emailLocalPart, newPlaceholderRoll, needsReset, resetStudentDoc };
