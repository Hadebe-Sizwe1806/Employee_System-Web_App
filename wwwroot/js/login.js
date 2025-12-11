document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const msg = document.getElementById('loginMsg');

  if (!form || !loginBtn) {
    console.warn('login.js: loginForm or loginBtn not found');
    return;
  }

  function setMessage(text, level) {
    if (!msg) return;
    msg.classList.remove('text-success', 'text-danger');
    if (level === 'success') msg.classList.add('text-success');
    if (level === 'error') msg.classList.add('text-danger');
    msg.textContent = text || '';
  }

  function setBusy(isBusy) {
    loginBtn.disabled = isBusy;
    loginBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  async function waitForFirebaseHelpers(timeoutMs = 3000) {
    const start = Date.now();
    while (!window.firebaseHelpers && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 50));
    }
    return !!window.firebaseHelpers;
  }

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    setMessage('', null);

    const empEl = document.getElementById('employeeNumber');
    const pwEl = document.getElementById('password');
    const emp = (empEl?.value || '').trim();
    const pw = (pwEl?.value || '').trim();

    if (!emp || !pw) {
      setMessage('Please enter your student number and password.', 'error');
      return;
    }

    // Optional: basic validation
    if (!/^\d+$/.test(emp)) {
      // adjust to your rules if needed
      // Comment out the numeric check if employee numbers contain letters
    }

    const domain = 'stud.cut.ac.za';
    const email = `${emp}@${domain}`;

    setBusy(true);
    try {
      const ok = await waitForFirebaseHelpers();
      if (!ok) throw new Error('Firebase helpers not initialized (window.firebaseHelpers missing).');

      const auth = window.firebaseHelpers.auth;
      const signIn = window.firebaseHelpers.signInWithEmailAndPassword;

      if (!auth || !signIn) throw new Error('Firebase auth functions not available on window.firebaseHelpers.');

      console.debug('Attempting sign-in for', email);

      // signIn returns a userCredential
      const userCredential = await signIn(auth, email, pw);
      const user = userCredential.user;
      if (!user) throw new Error('Sign-in succeeded but user object missing from result.');

      // get fresh token for custom claims
      const tokenResult = await user.getIdTokenResult(true);
      const role = tokenResult?.claims?.role || 'employee';

      setMessage('Login successful — redirecting...', 'success');

      // redirect immediately using role
      if (role === 'admin') {
        window.location.href = '/Admin/Dashboard';
      } else {
        window.location.href = '/Employee/Dashboard';
      }
    } catch (error) {
      console.error('Login error', error);
      let friendly = 'Login failed. Please check your credentials.';
      if (error && error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            friendly = 'This employee email is not registered.'; break;
          case 'auth/wrong-password':
            friendly = 'Incorrect password. Please try again.'; break;
          case 'auth/invalid-email':
            friendly = 'Invalid employee number format.'; break;
          case 'auth/too-many-requests':
            friendly = 'Too many login attempts. Please wait and try again later.'; break;
        }
      } else if (error && error.message) {
        // surface more specific messages for debugging
        friendly = error.message;
      }
      setMessage(friendly, 'error');
    } finally {
      setBusy(false);
    }
  });
});
