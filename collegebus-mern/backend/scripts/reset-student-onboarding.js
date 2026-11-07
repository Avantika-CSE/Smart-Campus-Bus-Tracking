#!/usr/bin/env node
/* ====================================================================
   Reset STUDENT onboarding (safe, repeatable, reversible)

   What it does
   - Finds the OLD students: role "student" without authVersion 2 (accounts
     made by the old password system).
   - For each one it keeps the same database record (same id, same email, so
     the saved route choice stays valid) but empties the profile: name, roll
     number, phone, department and password are moved into `previousProfile`
     inside that same record, the profile is marked incomplete and the e-mail
     is marked unverified. The student must now sign in with an email OTP and
     fill the profile again.

   What it never touches
   - admins, drivers, buses, routes, route stops, notifications, progress,
     student route choices, geocoded stop positions, or any other collection.

   Safety
   - Dry run by default: it only prints counts.
   - Real run needs:  --apply --confirm RESET-STUDENT-ONBOARDING
   - Before changing anything it writes a JSON backup of the affected
     records to backend/backups/ (contains personal data - keep it private).
   - Running it twice is harmless: accounts already reset are skipped.
   - Undo (only for students who have not onboarded again yet):
       --rollback --apply --confirm ROLLBACK-STUDENT-ONBOARDING
   - Logs show counts only, no names, e-mails or phone numbers.

   Usage (from the backend folder)
       npm run reset-students                       (dry run)
       npm run reset-students -- --apply --confirm RESET-STUDENT-ONBOARDING
       npm run reset-students -- --rollback         (dry run of the undo)
   ==================================================================== */
const path = require('path');
const fs = require('fs');

const CONFIRM_RESET = 'RESET-STUDENT-ONBOARDING';
const CONFIRM_ROLLBACK = 'ROLLBACK-STUDENT-ONBOARDING';

function parseArgs(argv) {
  const out = { apply: false, rollback: false, confirm: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--rollback') out.rollback = true;
    else if (argv[i] === '--confirm') out.confirm = argv[++i] || '';
  }
  return out;
}

// deps are injectable so the logic can be tested without a database
async function runReset({ args, models, backupDir, now = new Date(), log = console.log }) {
  const { User, StudentRoute } = models;
  const { resetStudentDoc } = require('../utils/studentReset');
  const summary = { mode: args.rollback ? (args.apply ? 'rollback' : 'rollback-dry-run') : (args.apply ? 'reset' : 'dry-run') };

  const legacyFilter = { role: 'student', authVersion: { $ne: 2 } };
  const undoFilter = { role: 'student', onboardingResetAt: { $ne: null }, profileComplete: false, previousProfile: { $exists: true } };

  const legacy = await User.countDocuments(legacyFilter);
  const resettable = await User.countDocuments(undoFilter);
  const untouched = {
    admins: await User.countDocuments({ role: 'admin' }),
    drivers: await User.countDocuments({ role: 'driver' })
  };
  log('Students from the old password system (to reset): ' + legacy);
  log('Students that can be restored by --rollback:      ' + resettable);
  log('Admins left untouched: ' + untouched.admins + ' | Drivers left untouched: ' + untouched.drivers);
  Object.assign(summary, { legacy, resettable, untouched });

  if (!args.apply) {
    log('\nDRY RUN - nothing was changed.');
    log(args.rollback
      ? 'To undo for real: npm run reset-students -- --rollback --apply --confirm ' + CONFIRM_ROLLBACK
      : 'To reset for real: npm run reset-students -- --apply --confirm ' + CONFIRM_RESET);
    return summary;
  }

  if (!args.rollback) {
    if (args.confirm !== CONFIRM_RESET) throw new Error('Refusing to run: add  --confirm ' + CONFIRM_RESET);
    if (legacy === 0) { log('\nNothing to do: every student is already on the new login.'); summary.reset = 0; return summary; }

    // 1) backup first
    const docs = await User.find(legacyFilter).lean();
    fs.mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, 'students-before-reset-' + now.toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(file, JSON.stringify({ createdAt: now.toISOString(), count: docs.length, students: docs }, null, 2));
    log('\nBackup written (' + docs.length + ' students): ' + file);
    summary.backupFile = file;

    // 2) reset in place
    let done = 0, failed = 0;
    const cursor = User.find(legacyFilter).cursor();
    for await (const doc of cursor) {
      try { if (resetStudentDoc(doc, now)) { await doc.save(); done++; } }
      catch (err) { failed++; log('  could not reset one record (id ' + doc._id + '): ' + err.message); }
    }
    summary.reset = done; summary.failed = failed;
    log('Reset: ' + done + ' | Failed: ' + failed);

    if (StudentRoute) log('Saved route choices kept: ' + await StudentRoute.countDocuments({}));
    return summary;
  }

  // ---- rollback ----
  if (args.confirm !== CONFIRM_ROLLBACK) throw new Error('Refusing to run: add  --confirm ' + CONFIRM_ROLLBACK);
  let restored = 0, skipped = 0;
  const cursor = User.find(undoFilter).cursor();
  for await (const doc of cursor) {
    const p = doc.previousProfile || {};
    try {
      await User.updateOne({ _id: doc._id }, {
        $set: { name: p.name, roll: p.roll, phone: p.phone || '', dept: p.dept || '', password: p.password || '', profileComplete: true, emailVerified: false },
        $unset: { authVersion: 1, onboardingResetAt: 1, previousProfile: 1 }
      });
      restored++;
    } catch (err) { skipped++; log('  skipped one record (id ' + doc._id + '): ' + (err.code === 11000 ? 'its old roll number is now used by another student' : err.message)); }
  }
  summary.restored = restored; summary.skipped = skipped;
  log('\nRestored: ' + restored + ' | Skipped: ' + skipped);
  log('Note: the website now only offers email OTP login. To go back to password login too, restore the older project files as well.');
  return summary;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const args = parseArgs(process.argv.slice(2));
  const mongoose = require('mongoose');
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set in backend/.env'); process.exit(1); }
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to database: ' + mongoose.connection.name + '\n');
  try {
    await runReset({
      args,
      models: { User: require('../models/User'), StudentRoute: require('../models/StudentRoute') },
      backupDir: path.join(__dirname, '..', 'backups')
    });
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) {
  main().catch(err => { console.error('\n' + err.message); process.exit(1); });
}

module.exports = { runReset, parseArgs, CONFIRM_RESET, CONFIRM_ROLLBACK };
