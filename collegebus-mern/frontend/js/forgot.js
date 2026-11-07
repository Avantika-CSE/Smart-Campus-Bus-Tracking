(function () {
  let matchedId = null; // the email/roll the user typed, re-sent to the server on verify/reset

  function showStep(n) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('step' + n).classList.add('active');
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById('dot' + i);
      if (!dot) continue;
      dot.classList.remove('active', 'done');
      if (i < n) dot.classList.add('done');
      else if (i === n) dot.classList.add('active');
    }
  }

  document.querySelectorAll('.toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '👁️' : '🙈';
    });
  });

  async function sendOtp() {
    const idVal = document.getElementById('fpId').value.trim();
    document.getElementById('errFpId').textContent = '';
    if (!idVal) { document.getElementById('errFpId').textContent = 'Please enter your email or roll number.'; return; }

    const btn = document.getElementById('sendOtpBtn');
    btn.disabled = true;
    try {
      const out = await DB.sendOtp(idVal);
      matchedId = idVal;

      // The OTP is only ever sent to the student's registered email; this
      // page never sees it.
      document.getElementById('otpDemoNote').textContent = out.message;
      Array.from(document.querySelectorAll('#otpBoxes input')).forEach(i => { i.value = ''; });
      startResendTimer();
      toast('If the account exists, the OTP has been emailed.', 'success');
      showStep(2);
      document.querySelector('#otpBoxes input').focus();
    } catch (err) {
      document.getElementById('errFpId').textContent = err.message;
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // "Resend OTP" can be used again only after 60 seconds.
  let resendTimer = null;
  function startResendTimer() {
    const link = document.getElementById('resendOtp');
    let left = 60;
    clearInterval(resendTimer);
    link.style.pointerEvents = 'none'; link.style.opacity = '0.5';
    link.textContent = 'Resend OTP in ' + left + 's';
    resendTimer = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(resendTimer); link.style.pointerEvents = ''; link.style.opacity = ''; link.textContent = 'Resend OTP'; }
      else link.textContent = 'Resend OTP in ' + left + 's';
    }, 1000);
  }

  document.getElementById('sendOtpBtn').addEventListener('click', sendOtp);
  document.getElementById('resendOtp').addEventListener('click', (e) => { e.preventDefault(); sendOtp(); });

  const otpInputs = document.querySelectorAll('#otpBoxes input');
  otpInputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^0-9]/g, '');
      if (inp.value && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) otpInputs[idx - 1].focus();
    });
  });

  document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
    document.getElementById('errOtp').textContent = '';
    const entered = Array.from(otpInputs).map(i => i.value).join('');
    if (entered.length < 6) { document.getElementById('errOtp').textContent = 'Enter the full 6-digit OTP.'; return; }

    const btn = document.getElementById('verifyOtpBtn');
    btn.disabled = true;
    try {
      await DB.verifyOtp(matchedId, entered);
      toast('OTP verified!', 'success');
      showStep(3);
    } catch (err) {
      document.getElementById('errOtp').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    document.getElementById('errNewPass').textContent = '';
    document.getElementById('errNewPassConfirm').textContent = '';
    const p1 = document.getElementById('newPass').value;
    const p2 = document.getElementById('newPassConfirm').value;
    let ok = true;
    if (p1.length < 6) { document.getElementById('errNewPass').textContent = 'Password must be at least 6 characters.'; ok = false; }
    if (p1 !== p2) { document.getElementById('errNewPassConfirm').textContent = 'Passwords do not match.'; ok = false; }
    if (!ok) return;

    const entered = Array.from(otpInputs).map(i => i.value).join('');
    const btn = document.getElementById('resetBtn');
    btn.disabled = true;
    try {
      await DB.resetPassword(matchedId, entered, p1);
      showStep(4);
    } catch (err) {
      document.getElementById('errNewPass').textContent = err.message;
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
})();
