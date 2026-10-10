// Browser source extracted from views/staff-login.eta.
(function () {
(function () {
  var form = (document.getElementById('staff-login-form') as HTMLFormElement);
  var message = (document.getElementById('staff-login-message') as HTMLElement);
  var button = (document.getElementById('staff-login-submit') as HTMLButtonElement);
  var url = (document.getElementById('sf-auth-config') as HTMLElement)?.dataset.url || '';
  var key = (document.getElementById('sf-auth-config') as HTMLElement)?.dataset.key || '';

  function showMessage(text, isError) {
    message.textContent = text;
    message.classList.toggle('is-error', Boolean(isError));
  }

  if (!url || !key || !window.supabase) {
    showMessage('Staff sign-in is not configured. Ask the site administrator to check Supabase settings.', true);
    button.disabled = true;
    return;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Signing in…';
    showMessage('', false);
    try {
      var client = window._sb;
      if (!client) throw new Error('Sign-in service unavailable.');
      var result = await client.auth.signInWithPassword({
        email: (document.getElementById('staff-email') as HTMLInputElement).value.trim(),
        password: (document.getElementById('staff-password') as HTMLInputElement).value
      });
      if (result.error) showMessage(result.error.message, true);
      else if (result.data.session) await window.sfCompleteSignIn(result.data.session);
    } catch (error) {
      showMessage(error.message || 'Could not reach the sign-in service. Check your connection and try again.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Sign in to staff portal';
    }
  });

  window.addEventListener('sf:auth-sync-error', function () {
    showMessage('Your password was accepted, but the site could not create a staff session. Check the deployed app configuration and try again.', true);
  });
})();
})();
