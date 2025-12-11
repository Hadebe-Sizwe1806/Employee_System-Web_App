document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('adminLoginBtn');
  const msg = document.getElementById('adminLoginMsg');

  if (!loginBtn) return;

  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('adminEmail').value.trim();
    const pw = document.getElementById('adminPassword').value.trim();

    msg.classList.remove('text-success', 'text-danger');
    msg.textContent = '';

    if (!email || !pw) {
      msg.classList.add('text-danger');
      msg.textContent = 'Please enter your email and password.';
      return;
    }

    try {
      const auth = window.firebaseHelpers.auth;
      const signIn = window.firebaseHelpers.signInWithEmailAndPassword;
      await signIn(auth, email, pw);

      window.firebaseHelpers.onAuthStateChanged(auth, async (user) => {
        if (user) {
          const tokenResult = await user.getIdTokenResult(true);
          const role = tokenResult.claims.role || 'employee';
          if (role === 'admin') {
            msg.classList.add('text-success');
            msg.textContent = 'Admin login successful. Redirecting...';
            window.location.href = '/Admin/Dashboard';
          } else {
            msg.classList.add('text-danger');
            msg.textContent = 'Access denied. You are not an admin.';
            await auth.signOut();
          }
        }
      });
    } catch (error) {
      let friendly = 'Login failed. Please check your credentials.';
      if (error && error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            friendly = 'This admin email is not registered.'; break;
          case 'auth/wrong-password':
            friendly = 'Incorrect password. Please try again.'; break;
          case 'auth/invalid-email':
            friendly = 'Invalid email format.'; break;
          case 'auth/too-many-requests':
            friendly = 'Too many login attempts. Please wait and try again later.'; break;
        }
      }
      msg.classList.add('text-danger');
      msg.textContent = friendly;
      console.error('Admin login error', error);
    }
  });
});
