"use strict";
// Browser source extracted from views/partials/auth-modal.eta.
(function () {
    (function () {
        var SURL = document.getElementById('sf-auth-config')?.dataset.url || '';
        var SKEY = document.getElementById('sf-auth-config')?.dataset.key || '';
        function getSb() {
            if (window._sb)
                return window._sb;
            if (SURL && SKEY && window.supabase && typeof window.supabase.createClient === 'function') {
                try {
                    window._sb = window.supabase.createClient(SURL, SKEY, { auth: { flowType: 'pkce', detectSessionInUrl: false } });
                    return window._sb;
                }
                catch (e) {
                    console.error('Failed to initialize Supabase client:', e);
                }
            }
            return null;
        }
        var modal = document.getElementById('auth-modal');
        var closeBtn = document.getElementById('auth-modal-close');
        var tabsContainer = document.getElementById('auth-modal-tabs');
        var tabSignin = document.getElementById('tab-signin');
        var tabSignup = document.getElementById('tab-signup');
        var panelSignin = document.getElementById('panel-signin');
        var panelSignup = document.getElementById('panel-signup');
        var panelForgot = document.getElementById('panel-forgot');
        var heading = document.getElementById('am-heading-text');
        var subtext = document.getElementById('am-subtext-text');
        var returnFocusTo = null;
        var previousBodyOverflow = '';
        function showPanel(name) {
            if (panelSignin)
                panelSignin.hidden = (name !== 'signin');
            if (panelSignup)
                panelSignup.hidden = (name !== 'signup');
            if (panelForgot)
                panelForgot.hidden = (name !== 'forgot');
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
                }
                else if (name === 'forgot') {
                    heading.textContent = 'Reset password';
                    subtext.textContent = "We'll send you a secure password reset link.";
                }
                else {
                    heading.textContent = 'Welcome back';
                    subtext.textContent = 'Sign in to manage your ideas and track feedback.';
                }
            }
        }
        window.openAuthModal = function (tab) {
            if (modal) {
                returnFocusTo = document.activeElement;
                previousBodyOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                modal.removeAttribute('hidden');
                showPanel(tab || 'signin');
                window.requestAnimationFrame(function () {
                    var fieldId = tab === 'signup' ? '#signup-name' : tab === 'forgot' ? '#forgot-email' : '#signin-email';
                    var firstField = modal.querySelector(fieldId);
                    (firstField || closeBtn)?.focus();
                });
            }
        };
        window.closeAuthModal = function () {
            if (modal) {
                modal.setAttribute('hidden', '');
                document.body.style.overflow = previousBodyOverflow;
                if (returnFocusTo && typeof returnFocusTo.focus === 'function')
                    returnFocusTo.focus();
            }
        };
        window.sfSwitchAuthTab = showPanel;
        if (closeBtn)
            closeBtn.addEventListener('click', window.closeAuthModal);
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal)
                    window.closeAuthModal();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (!modal || modal.hasAttribute('hidden'))
                return;
            if (e.key === 'Escape') {
                e.preventDefault();
                window.closeAuthModal();
                return;
            }
            if (e.key === 'Tab') {
                var focusable = Array.from(modal.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
                    .filter(function (el) { return !el.closest('[hidden]') && el.getClientRects().length; });
                if (!focusable.length)
                    return;
                var first = focusable[0];
                var last = focusable[focusable.length - 1];
                if (e.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
                    e.preventDefault();
                    last.focus();
                }
                else if (!e.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
        if (tabSignin)
            tabSignin.addEventListener('click', function () { showPanel('signin'); });
        if (tabSignup)
            tabSignup.addEventListener('click', function () { showPanel('signup'); });
        if (tabsContainer)
            tabsContainer.addEventListener('keydown', function (e) {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')
                    return;
                e.preventDefault();
                var next = document.activeElement === tabSignin ? tabSignup : tabSignin;
                if (next) {
                    showPanel(next === tabSignin ? 'signin' : 'signup');
                    next.focus();
                }
            });
        var linkToSignup = document.getElementById('link-to-signup');
        if (linkToSignup)
            linkToSignup.addEventListener('click', function () { showPanel('signup'); tabSignup?.focus(); });
        var linkToSignin = document.getElementById('link-to-signin');
        if (linkToSignin)
            linkToSignin.addEventListener('click', function () { showPanel('signin'); tabSignin?.focus(); });
        var btnToForgot = document.getElementById('btn-to-forgot');
        if (btnToForgot)
            btnToForgot.addEventListener('click', function () { showPanel('forgot'); modal.querySelector('#forgot-email')?.focus(); });
        var btnBackSignin = document.getElementById('btn-back-signin');
        if (btnBackSignin)
            btnBackSignin.addEventListener('click', function () { showPanel('signin'); modal.querySelector('#signin-email')?.focus(); });
        // Password visibility toggles
        document.querySelectorAll('.am-pw-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var inp = document.getElementById(btn.dataset.target);
                if (inp)
                    inp.type = inp.type === 'password' ? 'text' : 'password';
            });
        });
        function sfToast(msg, type) {
            var r = document.getElementById('sf-toast-region');
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
        var googleBtn = document.getElementById('btn-google-auth');
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
                }
                catch (error) {
                    googleBtn.disabled = false;
                    sfToast(error.message, 'error');
                }
            });
        }
        // Sign In Form
        var formSignin = document.getElementById('form-signin');
        if (formSignin) {
            formSignin.addEventListener('submit', async function (e) {
                e.preventDefault();
                var sb = getSb();
                if (!sb) {
                    sfToast('Authentication is not configured on this environment.', 'error');
                    return;
                }
                var emailEl = document.getElementById('signin-email');
                var passEl = document.getElementById('signin-password');
                var btn = document.getElementById('btn-signin');
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
                    }
                    catch (syncError) {
                        sfToast(syncError.message || 'Could not finish signing in. Please try again.', 'error');
                    }
                }
            });
        }
        // Sign Up Form
        var formSignup = document.getElementById('form-signup');
        if (formSignup) {
            formSignup.addEventListener('submit', async function (e) {
                e.preventDefault();
                var sb = getSb();
                if (!sb) {
                    sfToast('Authentication is not configured on this environment.', 'error');
                    return;
                }
                var nameEl = document.getElementById('signup-name');
                var emailEl = document.getElementById('signup-email');
                var passEl = document.getElementById('signup-password');
                var btn = document.getElementById('btn-signup');
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
                    }
                    catch (syncError) {
                        sfToast(syncError.message || 'Could not save your sign-in. Please try again.', 'error');
                        return;
                    }
                }
                sfToast('Account created! Please check your email to confirm.', 'success');
                window.closeAuthModal();
            });
        }
        // Forgot Password Form
        var formForgot = document.getElementById('form-forgot');
        if (formForgot) {
            formForgot.addEventListener('submit', async function (e) {
                e.preventDefault();
                var sb = getSb();
                if (!sb) {
                    sfToast('Authentication is not configured on this environment.', 'error');
                    return;
                }
                var emailEl = document.getElementById('forgot-email');
                var btn = document.getElementById('btn-forgot-submit');
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
