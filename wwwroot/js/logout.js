document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    try {
      const auth = window.firebaseHelpers.auth;
      await auth.signOut();
      const redirect = logoutBtn.dataset.redirect || '/';
      window.location.href = redirect;
    } catch (err) {
      console.error('Logout error:', err);
      alert('Error logging out. Please try again.');
    }
  });
});