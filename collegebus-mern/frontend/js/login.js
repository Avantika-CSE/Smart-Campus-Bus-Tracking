(function () {
  // If already logged in, go straight to the right dashboard
  const existing = DB.currentUser();
  if (existing) {
    window.location.href = existing.role + '.html';
    return;
  }

  const area = document.getElementById('authDynamic');
  let selectedRole = 'student';
  let draft = {}; // holds step-1 data while a setup wizard is in progress

  const tabs = document.querySelectorAll('.role-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedRole = tab.dataset.role;
      draft = {};
      renderForRole(selectedRole);
    });
  });

  function wireEyes() {
    area.querySelectorAll('.toggle-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁️' : '🙈';
      });
    });
  }

  // Shows a server error in the right place: the field it named, or a
  // generic error slot if the server didn't point at a specific field.
  function showServerError(err, fieldToEl, genericId) {
    if (err.field && fieldToEl[err.field]) {
      document.getElementById(fieldToEl[err.field]).textContent = err.message;
    } else if (genericId) {
      document.getElementById(genericId).textContent = err.message;
    }
    toast(err.message, 'error');
  }

  async function renderForRole(role) {
    if (role === 'student') return renderStudentLogin();
    if (role === 'admin') {
      area.innerHTML = '<p class="empty-note">Loading...</p>';
      try {
        const status = await DB.adminStatus();
        return (status.count > 0) ? renderAdminSignIn(status) : renderAdminSetupStep1();
      } catch (err) { area.innerHTML = '<p class="field-error">' + err.message + '</p>'; }
    }
    if (role === 'driver') {
      area.innerHTML = '<p class="empty-note">Loading...</p>';
      try {
        const status = await DB.driverStatus();
        return renderDriverSignIn(status);
      } catch (err) { area.innerHTML = '<p class="field-error">' + err.message + '</p>'; }
    }
  }

  // ================= STUDENT (email + OTP) =================
  function renderStudentLogin() {
    area.innerHTML =
      '<form id="otpEmailForm" novalidate>' +
        '<div class="field"><span class="fico">✉️</span><input type="email" id="loginEmail" placeholder="Your Email ID" autocomplete="email" inputmode="email" maxlength="254"></div>' +
        '<div class="field-error" id="errEmail"></div>' +
        '<button type="submit" class="btn btn-primary" id="sendOtpBtn">➜ Send OTP</button>' +
        '<p class="auth-foot" style="margin-top:14px;">No password needed. We will email you a 6-digit OTP. New student? Just use your email, your account is created after you verify the OTP.</p>' +
      '</form>';

    const remembered = JSON.parse(localStorage.getItem('bts_remember') || 'null');
    if (remembered && remembered.role === 'student' && /@/.test(remembered.id)) document.getElementById('loginEmail').value = remembered.id;

    document.getElementById('otpEmailForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const errEl = document.getElementById('errEmail');
      errEl.textContent = '';
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      if (!email) { errEl.textContent = 'Please enter your email address.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Enter a valid email address.'; return; }

      const btn = document.getElementById('sendOtpBtn');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const out = await DB.studentRequestOtp(email);
        toast('OTP sent. Please check your email.', 'success');
        renderOtpStep(email, out);
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false; btn.textContent = '➜ Send OTP';
      }
    });
  }

  function renderOtpStep(email, info) {
    area.innerHTML =
      '<form id="otpForm" novalidate>' +
        '<p class="empty-note" id="otpInfo" style="text-align:left;margin:0 0 12px;"></p>' +
        '<div class="field"><span class="fico">🔑</span><input type="text" id="otpCode" placeholder="6-digit OTP" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"></div>' +
        '<div class="field-error" id="errOtp"></div>' +
        '<div class="row-between"><label class="remember"><input type="checkbox" id="rememberMe"> Remember my email</label><a href="#" class="link-blue" id="resendOtp">Resend OTP</a></div>' +
        '<button type="submit" class="btn btn-primary" id="verifyOtpBtn">✔ Verify &amp; Login</button>' +
        '<p class="auth-foot"><a href="#" class="link-blue" id="changeEmail">← Use a different email</a></p>' +
      '</form>';
    document.getElementById('otpInfo').textContent = (info && info.message) || ('We sent a 6-digit OTP to ' + email + '.');
    document.getElementById('otpCode').focus();

    // "Resend OTP" can be used again only after the cooldown the server tells us.
    const resend = document.getElementById('resendOtp');
    let left = (info && info.cooldownSeconds) || 60, timer = null;
    function startTimer() {
      clearInterval(timer);
      resend.style.pointerEvents = 'none'; resend.style.opacity = '0.5';
      resend.textContent = 'Resend OTP in ' + left + 's';
      timer = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(timer); resend.style.pointerEvents = ''; resend.style.opacity = ''; resend.textContent = 'Resend OTP'; }
        else resend.textContent = 'Resend OTP in ' + left + 's';
      }, 1000);
    }
    startTimer();

    resend.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const out = await DB.studentRequestOtp(email);
        document.getElementById('otpInfo').textContent = out.message;
        document.getElementById('otpCode').value = '';
        left = out.cooldownSeconds || 60; startTimer();
        toast('A new OTP has been sent.', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('changeEmail').addEventListener('click', (e) => { e.preventDefault(); clearInterval(timer); renderStudentLogin(); });

    document.getElementById('otpForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const errEl = document.getElementById('errOtp');
      errEl.textContent = '';
      const code = document.getElementById('otpCode').value.trim();
      if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Enter the 6-digit OTP from your email.'; return; }

      const btn = document.getElementById('verifyOtpBtn');
      btn.disabled = true;
      try {
        const { token, user } = await DB.studentVerifyOtp(email, code);
        DB.setSession({ token, user });
        if (document.getElementById('rememberMe').checked) localStorage.setItem('bts_remember', JSON.stringify({ id: email, role: 'student' }));
        else localStorage.removeItem('bts_remember');
        clearInterval(timer);
        toast(user.profileComplete ? 'Welcome back, ' + user.name.split(' ')[0] + '!' : 'Email verified. Please complete your profile.', 'success');
        setTimeout(() => { window.location.href = 'student.html'; }, 500);
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  // ================= ADMIN SETUP =================
  function renderAdminSetupStep1() {
    area.innerHTML =
      '<div class="stepper"><div class="dot active">1</div><div class="bar"></div><div class="dot">2</div></div>' +
      '<div class="auth-card-brand"><div><h2>Admin Setup</h2><p>Let\'s configure your college details first</p></div></div>' +
      '<div class="field"><span class="fico">🏫</span><input type="text" id="asCollegeName" placeholder="College Name"></div>' +
      '<div class="field-error" id="asErrName"></div>' +
      '<div class="field"><span class="fico">📍</span><input type="text" id="asCollegeAddress" placeholder="College Address"></div>' +
      '<div class="field-error" id="asErrAddr"></div>' +
      '<div class="field"><span class="fico">📮</span><input type="text" id="asCollegePin" placeholder="College PIN Code" maxlength="6"></div>' +
      '<div class="field-error" id="asErrPin"></div>' +
      '<button class="btn btn-primary" id="asNextBtn">Submit</button>';

    document.getElementById('asNextBtn').addEventListener('click', () => {
      const name = document.getElementById('asCollegeName').value.trim();
      const addr = document.getElementById('asCollegeAddress').value.trim();
      const pin = document.getElementById('asCollegePin').value.trim();
      document.getElementById('asErrName').textContent = '';
      document.getElementById('asErrAddr').textContent = '';
      document.getElementById('asErrPin').textContent = '';
      let ok = true;
      if (!name) { document.getElementById('asErrName').textContent = 'College name is required.'; ok = false; }
      if (!addr) { document.getElementById('asErrAddr').textContent = 'College address is required.'; ok = false; }
      if (!/^[1-9][0-9]{5}$/.test(pin)) { document.getElementById('asErrPin').textContent = 'Enter a valid 6-digit PIN code.'; ok = false; }
      if (!ok) return;
      draft = { collegeName: name, collegeAddress: addr, collegePin: pin };
      renderAdminSetupStep2();
    });
  }

  function renderAdminSetupStep2() {
    area.innerHTML =
      '<div class="stepper"><div class="dot done">1</div><div class="bar"></div><div class="dot active">2</div></div>' +
      '<div class="auth-card-brand"><div><h2>Admin Sign In</h2><p>Enter your admin details to finish setup</p></div></div>' +
      '<div class="field"><span class="fico">🧑</span><input type="text" id="asAdminName" placeholder="Admin Name"></div>' +
      '<div class="field-error" id="asErrAName"></div>' +
      '<div class="field"><span class="fico">🔑</span><input type="text" id="asAdminId" placeholder="Admin Unique ID"></div>' +
      '<div class="field-error" id="asErrAId"></div>' +
      '<div class="field"><span class="fico">✉️</span><input type="email" id="asAdminEmail" placeholder="Admin Email"></div>' +
      '<div class="field-error" id="asErrAEmail"></div>' +
      '<div class="field"><span class="fico">🛡️</span><input type="password" id="asSecretCode" placeholder="Secret Admin Code" autocomplete="off"></div>' +
      '<div class="field-error" id="asErrSecret"></div>' +
      '<button class="btn btn-primary" id="asSignInBtn">Sign In</button>' +
      '<p class="auth-foot"><a href="#" class="link-blue" id="asBack">← Back</a></p>';

    document.getElementById('asBack').addEventListener('click', (e) => { e.preventDefault(); renderAdminSetupStep1(); });

    document.getElementById('asSignInBtn').addEventListener('click', async () => {
      const name = document.getElementById('asAdminName').value.trim();
      const uid = document.getElementById('asAdminId').value.trim().toUpperCase();
      const email = document.getElementById('asAdminEmail').value.trim();
      const secretCode = document.getElementById('asSecretCode').value;
      ['asErrAName', 'asErrAId', 'asErrAEmail', 'asErrSecret'].forEach(id => document.getElementById(id).textContent = '');
      if (!secretCode.trim()) { document.getElementById('asErrSecret').textContent = 'Enter the secret admin code.'; return; }
      if (name.length < 3) { document.getElementById('asErrAName').textContent = "Enter the admin's full name."; return; }

      const btn = document.getElementById('asSignInBtn');
      btn.disabled = true;
      try {
        const payload = Object.assign({}, draft, { adminName: name, adminUniqueId: uid, adminEmail: email, secretCode });
        const { token, user } = await DB.adminSetup(payload);
        DB.setSession({ token, user });
        toast('Admin setup complete. Welcome, ' + name.split(' ')[0] + '!', 'success');
        setTimeout(() => { window.location.href = 'admin.html'; }, 500);
      } catch (err) {
        showServerError(err, { adminName: 'asErrAName', adminUniqueId: 'asErrAId', adminEmail: 'asErrAEmail', secretCode: 'asErrSecret' }, 'asErrAId');
        btn.disabled = false;
      }
    });
  }

  function renderAdminSignIn(status) {
    const names = (status.names || []).join(', ');
    area.innerHTML =
      '<div class="auth-card-brand"><div><h2>Admin Sign In</h2><p>Registered admins: ' + names + '</p></div></div>' +
      '<div class="field"><span class="fico">🧑</span><input type="text" id="siAdminName" placeholder="Admin Name"></div>' +
      '<div class="field"><span class="fico">🔑</span><input type="text" id="siAdminId" placeholder="Admin Unique ID"></div>' +
      '<div class="field"><span class="fico">✉️</span><input type="email" id="siAdminEmail" placeholder="Admin Email"></div>' +
      '<div class="field-error" id="siErr"></div>' +
      '<button class="btn btn-primary" id="siSignInBtn">Sign In</button>' +
      '<p class="auth-foot"><a href="#" class="link-blue" id="asAddNew">+ Register a new admin</a></p>';

    document.getElementById('asAddNew').addEventListener('click', (e) => { e.preventDefault(); renderAdminSetupStep1(); });

    document.getElementById('siSignInBtn').addEventListener('click', async () => {
      const name = document.getElementById('siAdminName').value.trim();
      const uid = document.getElementById('siAdminId').value.trim().toUpperCase();
      const email = document.getElementById('siAdminEmail').value.trim();
      const errEl = document.getElementById('siErr');
      errEl.textContent = '';
      if (!name || !uid || !email) { errEl.textContent = 'All fields are required.'; return; }

      const btn = document.getElementById('siSignInBtn');
      btn.disabled = true;
      try {
        const { token, user } = await DB.adminLogin({ adminName: name, adminUniqueId: uid, adminEmail: email });
        DB.setSession({ token, user });
        toast('Welcome back, ' + user.name.split(' ')[0] + '!', 'success');
        setTimeout(() => { window.location.href = 'admin.html'; }, 500);
      } catch (err) {
        errEl.textContent = err.message;
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  // ================= DRIVER SETUP =================
  async function renderDriverSetupStep1() {
    area.innerHTML = '<p class="empty-note">Loading routes...</p>';
    let realRoutes = [];
    try { realRoutes = await DB.getRealRoutes(); } catch (err) { area.innerHTML = '<p class="field-error">' + err.message + '</p>'; return; }

    const options = realRoutes.map(r => '<option value="' + r.startPoint + '">' + r.startPoint + ' (' + r.name + ')</option>').join('');
    area.innerHTML =
      '<div class="stepper"><div class="dot active">1</div><div class="bar"></div><div class="dot">2</div></div>' +
      '<div class="auth-card-brand"><div><h2>Driver Setup</h2><p>Let\'s configure your college and route details</p></div></div>' +
      '<div class="field"><span class="fico">🏫</span><input type="text" id="dsCollegeName" placeholder="College Name"></div>' +
      '<div class="field-error" id="dsErrName"></div>' +
      '<div class="field"><span class="fico">📍</span><input type="text" id="dsCollegeAddress" placeholder="College Address"></div>' +
      '<div class="field-error" id="dsErrAddr"></div>' +
      '<div class="field"><span class="fico">📮</span><input type="text" id="dsCollegePin" placeholder="College PIN Code" maxlength="6"></div>' +
      '<div class="field-error" id="dsErrPin"></div>' +
      '<div class="field"><span class="fico">🛣️</span><select id="dsStartPoint"><option value="">Select Starting Point</option>' + options + '</select></div>' +
      '<div class="field-error" id="dsErrStart"></div>' +
      '<div class="field"><span class="fico">🏁</span><input type="text" id="dsEndPoint" value="JIT" disabled></div>' +
      '<button class="btn btn-primary" id="dsNextBtn">Submit</button>';

    document.getElementById('dsNextBtn').addEventListener('click', () => {
      const name = document.getElementById('dsCollegeName').value.trim();
      const addr = document.getElementById('dsCollegeAddress').value.trim();
      const pin = document.getElementById('dsCollegePin').value.trim();
      const start = document.getElementById('dsStartPoint').value;
      document.getElementById('dsErrName').textContent = '';
      document.getElementById('dsErrAddr').textContent = '';
      document.getElementById('dsErrPin').textContent = '';
      document.getElementById('dsErrStart').textContent = '';
      let ok = true;
      if (!name) { document.getElementById('dsErrName').textContent = 'College name is required.'; ok = false; }
      if (!addr) { document.getElementById('dsErrAddr').textContent = 'College address is required.'; ok = false; }
      if (!/^[1-9][0-9]{5}$/.test(pin)) { document.getElementById('dsErrPin').textContent = 'Enter a valid 6-digit PIN code.'; ok = false; }
      if (!start) { document.getElementById('dsErrStart').textContent = 'Please select a starting point.'; ok = false; }
      if (!ok) return;
      draft = { collegeName: name, collegeAddress: addr, collegePin: pin, startingPoint: start, endingPoint: 'JIT' };
      renderDriverSetupStep2();
    });
  }

  function renderDriverSetupStep2() {
    area.innerHTML =
      '<div class="stepper"><div class="dot done">1</div><div class="bar"></div><div class="dot active">2</div></div>' +
      '<div class="auth-card-brand"><div><h2>Driver Sign In</h2><p>Enter your driver details to finish setup</p></div></div>' +
      '<div class="field"><span class="fico">🧑</span><input type="text" id="dsDriverName" placeholder="Driver Name"></div>' +
      '<div class="field-error" id="dsErrDName"></div>' +
      '<div class="field"><span class="fico">🔑</span><input type="text" id="dsDriverId" placeholder="Driver Unique ID"></div>' +
      '<div class="field-error" id="dsErrDId"></div>' +
      '<div class="field"><span class="fico">✉️</span><input type="email" id="dsDriverEmail" placeholder="Driver Email"></div>' +
      '<div class="field-error" id="dsErrDEmail"></div>' +
      '<button class="btn btn-primary" id="dsSignInBtn">Sign In</button>' +
      '<p class="auth-foot"><a href="#" class="link-blue" id="dsBack">← Back</a></p>';

    document.getElementById('dsBack').addEventListener('click', (e) => { e.preventDefault(); renderDriverSetupStep1(); });

    document.getElementById('dsSignInBtn').addEventListener('click', async () => {
      const name = document.getElementById('dsDriverName').value.trim();
      const uid = document.getElementById('dsDriverId').value.trim().toUpperCase();
      const email = document.getElementById('dsDriverEmail').value.trim();
      ['dsErrDName', 'dsErrDId', 'dsErrDEmail'].forEach(id => document.getElementById(id).textContent = '');
      if (name.length < 3) { document.getElementById('dsErrDName').textContent = "Enter the driver's full name."; return; }

      const btn = document.getElementById('dsSignInBtn');
      btn.disabled = true;
      try {
        const payload = Object.assign({}, draft, { driverName: name, driverUniqueId: uid, driverEmail: email });
        const { token, user } = await DB.driverSetup(payload);
        DB.setSession({ token, user });
        toast('Driver setup complete. Welcome, ' + name.split(' ')[0] + '!', 'success');
        setTimeout(() => { window.location.href = 'driver.html'; }, 500);
      } catch (err) {
        showServerError(err, { driverName: 'dsErrDName', driverUniqueId: 'dsErrDId', driverEmail: 'dsErrDEmail' }, 'dsErrDId');
        btn.disabled = false;
      }
    });
  }

  function renderDriverSignIn(status) {
    const names = (status.names || []).join(', ');
    area.innerHTML =
      '<div class="auth-card-brand"><div><h2>Driver Sign In</h2><p>Use the Name, Unique ID and Email your admin gave you</p></div></div>' +
      '<div class="field"><span class="fico">🧑</span><input type="text" id="siDriverName" placeholder="Driver Name"></div>' +
      '<div class="field"><span class="fico">🔑</span><input type="text" id="siDriverId" placeholder="Driver Unique ID"></div>' +
      '<div class="field"><span class="fico">✉️</span><input type="email" id="siDriverEmail" placeholder="Driver Email"></div>' +
      '<div class="field-error" id="siDErr"></div>' +
      '<button class="btn btn-primary" id="siDriverSignInBtn">Sign In</button>';

    document.getElementById('siDriverSignInBtn').addEventListener('click', async () => {
      const name = document.getElementById('siDriverName').value.trim();
      const uid = document.getElementById('siDriverId').value.trim().toUpperCase();
      const email = document.getElementById('siDriverEmail').value.trim();
      const errEl = document.getElementById('siDErr');
      errEl.textContent = '';
      if (!name || !uid || !email) { errEl.textContent = 'All fields are required.'; return; }

      const btn = document.getElementById('siDriverSignInBtn');
      btn.disabled = true;
      try {
        const { token, user } = await DB.driverLogin({ driverName: name, driverUniqueId: uid, driverEmail: email });
        DB.setSession({ token, user });
        toast('Welcome back, ' + user.name.split(' ')[0] + '!', 'success');
        setTimeout(() => { window.location.href = 'driver.html'; }, 500);
      } catch (err) {
        errEl.textContent = err.message;
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  renderForRole(selectedRole);
})();
