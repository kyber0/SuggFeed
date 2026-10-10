// Browser source extracted from views/partials/auth-modal.eta.
(function () {
(function () {
  var SURL = (document.getElementById('sf-auth-config') as HTMLElement)?.dataset.url || '';
  var SKEY = (document.getElementById('sf-auth-config') as HTMLElement)?.dataset.key || '';

  function getSb() {
    if (window._sb) return window._sb;
    if (SURL && SKEY && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        window._sb = window.supabase.createClient(SURL, SKEY, { auth: { flowType: 'pkce', detectSessionInUrl: false } });
        return window._sb;
      } catch (e) {
        console.error('Failed to initialize Supabase client:', e);
      }
    }
    return null;
  }

  var modal = (document.getElementById('auth-modal') as HTMLElement);
  var closeBtn = (document.getElementById('auth-modal-close') as HTMLButtonElement);
  var tabsContainer = (document.getElementById('auth-modal-tabs') as HTMLElement);
  var tabSignin = (document.getElementById('tab-signin') as HTMLButtonElement);
  var tabSignup = (document.getElementById('tab-signup') as HTMLButtonElement);
  var panelSignin = (document.getElementById('panel-signin') as HTMLElement);
  var panelSignup = (document.getElementById('panel-signup') as HTMLElement);
  var panelForgot = (document.getElementById('panel-forgot') as HTMLElement);
  var heading = (document.getElementById('am-heading-text') as HTMLElement);
  var subtext = (document.getElementById('am-subtext-text') as HTMLElement);
  var returnFocusTo = null;
  var previousBodyOverflow = '';

  function showPanel(name) {
    if (panelSignin) panelSignin.hidden = (name !== 'signin');
    if (panelSignup) panelSignup.hidden = (name !== 'signup');
    if (panelForgot) panelForgot.hidden = (name !== 'forgot');

    if (tabsContainer) {
      tabsContainer.hidden = (name === 'forgot');
    }
    if (tabSignin) {
      tabSignin.classList.toggle('am-tab--active', name === 'signin');
      tabSignin.setAttribute('aria-selected', String(name === 'signin'));
      tabSignin.tabIndex = name === 'signin' ? 0 : -1;
    }
    if (tabSignup) {
      tabSignup.classList.toggle('am-tab--active', name === 'signup');
      tabSignup.setAttribute('aria-selected', String(name === 'signup'));
      tabSignup.tabIndex = name === 'signup' ? 0 : -1;
    }

    if (heading && subtext) {
      if (name === 'signup') {
        heading.textContent = 'Create account';
        subtext.textContent = 'Join SuggFeed to submit and track ideas.';
      } else if (name === 'forgot') {
        heading.textContent = 'Reset password';
        subtext.textContent = "We'll send you a secure password reset link.";
      } else {
        heading.textContent = 'Welcome back';
        subtext.textContent = 'Sign in to manage your ideas and track feedback.';
      }
    }
  }

  window.openAuthModal = function (tab) {
    if (modal) {
      returnFocusTo = (document.activeElement as HTMLElement);
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      modal.removeAttribute('hidden');
      showPanel(tab || 'signin');
      window.requestAnimationFrame(function () {
        var fieldId = tab === 'signup' ? '#signup-name' : tab === 'forgot' ? '#forgot-email' : '#signin-email';
        var firstField = modal.querySelector<HTMLElement>(fieldId);
        (firstField || closeBtn)?.focus();
      });
    }
  };

  window.closeAuthModal = function () {
    if (modal) {
      modal.setAttribute('hidden', '');
      document.body.style.overflow = previousBodyOverflow;
      if (returnFocusTo && typeof returnFocusTo.focus === 'function') returnFocusTo.focus();
    }
  };

  window.sfSwitchAuthTab = showPanel;

  if (closeBtn) closeBtn.addEventListener('click', window.closeAuthModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) window.closeAuthModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (!modal || modal.hasAttribute('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      window.closeAuthModal();
      return;
    }
    if (e.key === 'Tab') {
      var focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(function (el) { return !el.closest('[hidden]') && el.getClientRects().length; });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && ((document.activeElement as HTMLElement) === first || !focusable.includes((document.activeElement as HTMLElement)))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && ((document.activeElement as HTMLElement) === last || !focusable.includes((document.activeElement as HTMLElement)))) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  if (tabSignin) tabSignin.addEventListener('click', function () { showPanel('signin'); });
  if (tabSignup) tabSignup.addEventListener('click', function () { showPanel('signup'); });
  if (tabsContainer) tabsContainer.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    var next = (document.activeElement as HTMLElement) === tabSignin ? tabSignup : tabSignin;
    if (next) {
      showPanel(next === tabSignin ? 'signin' : 'signup');
      next.focus();
    }
  });

  var linkToSignup = (document.getElementById('link-to-signup') as HTMLButtonElement);
  if (linkToSignup) linkToSignup.addEventListener('click', function () { showPanel('signup'); tabSignup?.focus(); });

  var linkToSignin = (document.getElementById('link-to-signin') as HTMLButtonElement);
  if (linkToSignin) linkToSignin.addEventListener('click', function () { showPanel('signin'); tabSignin?.focus(); });

  var btnToForgot = (document.getElementById('btn-to-forgot') as HTMLButtonElement);
  if (btnToForgot) btnToForgot.addEventListener('click', function () { showPanel('forgot'); modal.querySelector<HTMLInputElement>('#forgot-email')?.focus(); });

  var btnBackSignin = (document.getElementById('btn-back-signin') as HTMLButtonElement);
  if (btnBackSignin) btnBackSignin.addEventListener('click', function () { showPanel('signin'); modal.querySelector<HTMLInputElement>('#signin-email')?.focus(); });

  // Password visibility toggles
  document.querySelectorAll<HTMLElement>('.am-pw-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var inp = (document.getElementById(btn.dataset.target) as HTMLInputElement);
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  function sfToast(msg, type) {
    var r = (document.getElementById('sf-toast-region') as HTMLElement);
    if (!r) {
      alert(msg);
      return;
    }
    var t = document.createElement('div');
    t.className = 'sf-toast sf-toast--' + (type || 'info');
    var body = document.createElement('div');
    body.className = 'sf-toast__body';
    var message = document.createElement('div');
    message.className = 'sf-toast__message';
    message.textContent = msg;
    body.appendChild(message);
    t.appendChild(body);
    r.appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }

  // Google OAuth
  var googleBtn = (document.getElementById('btn-google-auth') as HTMLButtonElement);
  if (googleBtn) {
    googleBtn.addEventListener('click', async function () {
      var sb = getSb();
      if (!sb) {
        sfToast('Authentication is not configured on this environment.', 'error');
        return;
      }
      googleBtn.disabled = true;
      try {
        await window.sfStartGoogleSignIn();
      } catch (error) {
        googleBtn.disabled = false;
        sfToast(error.message, 'error');
      }
    });
  }

  // Sign In Form
  var formSignin = (document.getElementById('form-signin') as HTMLFormElement);
  if (formSignin) {
    formSignin.addEventListener('submit', async function (e) {
      e.preventDefault();
      var sb = getSb();
      if (!sb) {
        sfToast('Authentication is not configured on this environment.', 'error');
        return;
      }
      var emailEl = (document.getElementById('signin-email') as HTMLInputElement);
      var passEl = (document.getElementById('signin-password') as HTMLInputElement);
      var btn = (document.getElementById('btn-signin') as HTMLButtonElement);
      var email = emailEl ? emailEl.value.trim() : '';
      var password = passEl ? passEl.value : '';

      if (!email || !password) {
        sfToast('Please enter both email and password.', 'error');
        return;
      }

      btn.disabled = true;
      var origText = btn.innerHTML;
      btn.innerHTML = '<span>Signing in…</span>';

      var { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
      btn.disabled = false;
      btn.innerHTML = origText;

      if (error) {
        sfToast(error.message, 'error');
        return;
      }

      // If session directly returned, sync immediately
      if (data && data.session) {
        try {
          await window.sfCompleteSignIn(data.session);
        } catch (syncError) { sfToast(syncError.message || 'Could not finish signing in. Please try again.', 'error'); }
      }
    });
  }

  // Sign Up Form
  var formSignup = (document.getElementById('form-signup') as HTMLFormElement);
  if (formSignup) {
    formSignup.addEventListener('submit', async function (e) {
      e.preventDefault();
      var sb = getSb();
      if (!sb) {
        sfToast('Authentication is not configured on this environment.', 'error');
        return;
      }
      var nameEl = (document.getElementById('signup-name') as HTMLInputElement);
      var emailEl = (document.getElementById('signup-email') as HTMLInputElement);
      var passEl = (document.getElementById('signup-password') as HTMLInputElement);
      var btn = (document.getElementById('btn-signup') as HTMLButtonElement);
      var name = nameEl ? nameEl.value.trim() : '';
      var email = emailEl ? emailEl.value.trim() : '';
      var password = passEl ? passEl.value : '';

      if (!email || !password) {
        sfToast('Please provide an email and password.', 'error');
        return;
      }
      if (password.length < 8) {
        sfToast('Password must be at least 8 characters.', 'error');
        return;
      }

      btn.disabled = true;
      var origText = btn.innerHTML;
      btn.innerHTML = '<span>Creating account…</span>';

      var { data, error } = await sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name, display_name: name }, emailRedirectTo: window.location.origin + '/auth/callback' }
      });
      btn.disabled = false;
      btn.innerHTML = origText;

      if (error) {
        sfToast(error.message, 'error');
        return;
      }

      // If auto-confirmed session
      if (data && data.session) {
        try {
          await window.sfCompleteSignIn(data.session);
          return;
        } catch (syncError) {
          sfToast(syncError.message || 'Could not save your sign-in. Please try again.', 'error');
          return;
        }
      }

      sfToast('Account created! Please check your email to confirm.', 'success');
      window.closeAuthModal();
    });
  }

  // Forgot Password Form
  var formForgot = (document.getElementById('form-forgot') as HTMLFormElement);
  if (formForgot) {
    formForgot.addEventListener('submit', async function (e) {
      e.preventDefault();
      var sb = getSb();
      if (!sb) {
        sfToast('Authentication is not configured on this environment.', 'error');
        return;
      }
      var emailEl = (document.getElementById('forgot-email') as HTMLInputElement);
      var btn = (document.getElementById('btn-forgot-submit') as HTMLButtonElement);
      var email = emailEl ? emailEl.value.trim() : '';

      if (!email) {
        sfToast('Please enter your email address.', 'error');
        return;
      }

      btn.disabled = true;
      var origText = btn.innerHTML;
      btn.innerHTML = '<span>Sending link…</span>';

      var { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/callback'
      });
      btn.disabled = false;
      btn.innerHTML = origText;

      if (error) {
        sfToast(error.message, 'error');
        return;
      }

      sfToast('Password reset link sent! Check your inbox.', 'success');
      showPanel('signin');
    });
  }
})();
})();
