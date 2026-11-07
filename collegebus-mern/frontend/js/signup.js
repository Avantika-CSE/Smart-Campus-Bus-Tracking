(function () {
  // Students do not fill a sign-up form any more: they type their email on the
  // login page, enter the OTP we mail them, and their account is created
  // automatically. Admin and Driver accounts are set up from the login page too.
  const notice = document.getElementById('signupNotice');
  const goBtn = document.getElementById('goLoginBtn');
  const tabs = document.querySelectorAll('.role-tab');

  const TEXT = {
    student: '<b>Students: no password, no sign-up form.</b><br>Go to the login page, enter your email and we will mail you a 6-digit OTP. After you enter it, your account is created and you fill in your profile (name, roll number, phone).',
    admin: '<b>Admin accounts</b> are set up from the login page: choose Admin and follow the first-time setup (needs the admin Unique ID and the secret admin code).',
    driver: '<b>Driver accounts</b> are created by the admin (Manage Drivers). Ask your admin for your Unique ID, then sign in from the login page.'
  };

  function show(role) {
    notice.innerHTML = TEXT[role];
    goBtn.textContent = '➜ Go to Login';
    goBtn.href = 'index.html';
  }
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    show(tab.dataset.role);
  }));
  show('student');
})();
