"use strict";
/// <reference path="./globals.d.ts" />
// Browser source extracted from views/partials/submit-panel.eta.
(function () {
    let sipCurrentStep = 1;
    let sipMaxVisitedStep = 1;
    let sipTrackingCode = '';
    let sipReturnFocusTo = null;
    let sipOpened = false;
    let sipSending = false;
    function openSubmitPanel(defaultCat) {
        sipReturnFocusTo = document.activeElement;
        sipCurrentStep = 1;
        sipMaxVisitedStep = 1;
        const overlay = document.getElementById('submit-panel-overlay');
        const panel = document.getElementById('submit-panel');
        const form = document.getElementById('submit-idea-form');
        if (overlay)
            overlay.removeAttribute('hidden');
        if (panel)
            panel.removeAttribute('hidden');
        if (form && (!sipOpened || !document.getElementById('sip-success').hidden)) {
            form.reset();
            try {
                const choice = localStorage.getItem(sfSchoolKey('sf_anon_default'));
                const signedIn = !!document.getElementById('sf-auth-config')?.dataset.user;
                document.getElementById('sip-anon').checked = !signedIn || choice !== 'false';
                if (window.sfSchoolCustomization?.features?.anonymous === false) {
                    document.getElementById('sip-anon').checked = false;
                    document.getElementById('sip-anon').disabled = true;
                }
            }
            catch { }
        }
        sipOpened = true;
        window.dispatchEvent(new CustomEvent('sf:submission-open'));
        document.getElementById('sip-queue-btn').hidden = false;
        document.getElementById('sip-success').hidden = true;
        document.getElementById('sip-footer').classList.remove('sip-footer-hidden');
        document.body.style.overflow = 'hidden';
        // Clear active card states
        const currentCategory = document.querySelector('input[name="sip-category"]:checked');
        if (currentCategory)
            onCategorySelected(currentCategory.value);
        if (defaultCat && !document.querySelector('input[name="sip-category"]:checked')) {
            const radio = document.querySelector(`input[name="sip-category"][value="${defaultCat}"]`);
            if (radio) {
                radio.checked = true;
                onCategorySelected(defaultCat);
            }
        }
        // Reset validations
        handleTitleInput();
        handleDescInput();
        handleAnonToggle();
        updateSipUI();
        // Focus first element or category
        setTimeout(() => {
            const firstRadio = defaultCat
                ? document.querySelector(`input[name="sip-category"][value="${defaultCat}"]`)
                : document.querySelector('input[name="sip-category"]');
            if (firstRadio)
                firstRadio.focus();
        }, 100);
    }
    function closeSubmitPanel() {
        const overlay = document.getElementById('submit-panel-overlay');
        const panel = document.getElementById('submit-panel');
        if (overlay)
            overlay.hidden = true;
        if (panel)
            panel.hidden = true;
        document.body.style.overflow = '';
        if (sipReturnFocusTo && typeof sipReturnFocusTo.focus === 'function')
            sipReturnFocusTo.focus();
    }
    // Keyboard shortcut: Esc closes panel
    document.addEventListener('keydown', function (e) {
        if (e.defaultPrevented || document.querySelector('dialog[open]'))
            return;
        if (e.key === 'Escape') {
            const panel = document.getElementById('submit-panel');
            if (panel && !panel.hidden) {
                e.preventDefault();
                closeSubmitPanel();
                return;
            }
        }
        if (e.key === 'Tab') {
            const panel = document.getElementById('submit-panel');
            if (!panel || panel.hidden)
                return;
            const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
                .filter(el => !el.closest('[hidden]') && el.getClientRects().length);
            if (!focusable.length)
                return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
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
    function onCategorySelected(cat) {
        document.querySelectorAll('.sip-cat-card').forEach(card => card.classList.remove('sip-cat-card--selected'));
        const activeCard = document.getElementById(`cat-card-${cat.replace(/\s+/g, '-')}`);
        if (activeCard)
            activeCard.classList.add('sip-cat-card--selected');
    }
    function handleTitleInput() {
        const input = document.getElementById('sip-title');
        const val = input ? input.value : '';
        const counter = document.getElementById('sip-title-count');
        const req = document.getElementById('sip-title-req');
        if (counter)
            counter.textContent = `${val.length} / 100`;
        if (counter) {
            counter.classList.toggle('is-warn', val.length >= 80 && val.length < 95);
            counter.classList.toggle('is-danger', val.length >= 95);
        }
        if (req) {
            if (val.trim().length >= 10) {
                req.textContent = 'Ready';
                req.className = 'sip-validation-badge sip-validation-badge--valid';
            }
            else {
                req.textContent = 'Min 10 chars';
                req.className = 'sip-validation-badge';
            }
        }
    }
    function handleDescInput() {
        const textarea = document.getElementById('sip-description');
        const val = textarea ? textarea.value : '';
        const counter = document.getElementById('sip-desc-count');
        const req = document.getElementById('sip-desc-req');
        if (counter)
            counter.textContent = `${val.length} / 1500`;
        if (counter) {
            counter.classList.toggle('is-warn', val.length >= 1200 && val.length < 1450);
            counter.classList.toggle('is-danger', val.length >= 1450);
        }
        if (req) {
            if (val.trim().length >= 20) {
                req.textContent = 'Ready';
                req.className = 'sip-validation-badge sip-validation-badge--valid';
            }
            else {
                req.textContent = 'Min 20 chars';
                req.className = 'sip-validation-badge';
            }
        }
    }
    function handleAnonToggle() {
        const isAnon = document.getElementById('sip-anon')?.checked;
        const badge = document.getElementById('sip-anon-status-pill');
        if (badge) {
            if (isAnon) {
                badge.textContent = 'Identity Hidden';
                badge.className = 'sip-badge-anon-state sip-badge-anon-state--anon';
            }
            else {
                badge.textContent = 'Public Profile';
                badge.className = 'sip-badge-anon-state sip-badge-anon-state--public';
            }
        }
    }
    function handleConsentChange() {
        const consentWrapper = document.getElementById('sip-consent-wrapper');
        const checked = document.getElementById('sip-consent')?.checked;
        if (consentWrapper) {
            consentWrapper.classList.toggle('sip-consent-card--checked', !!checked);
        }
    }
    function goToStep(step) {
        if (step < 1 || step > 3)
            return;
        // Allow jumping backwards or to step if already visited
        if (step <= sipMaxVisitedStep) {
            sipCurrentStep = step;
            updateSipUI();
        }
    }
    function updateSipUI() {
        document.getElementById('sip-queue-btn').hidden = sipCurrentStep !== 3;
        if (sipCurrentStep > sipMaxVisitedStep) {
            sipMaxVisitedStep = sipCurrentStep;
        }
        // Panels visibility with animation classes
        for (let i = 1; i <= 3; i++) {
            const panel = document.getElementById(`sip-step-${i}`);
            if (panel) {
                if (i === sipCurrentStep) {
                    panel.hidden = false;
                    panel.classList.add('sip-step-animate-in');
                }
                else {
                    panel.hidden = true;
                    panel.classList.remove('sip-step-animate-in');
                }
            }
        }
        // Stepper buttons & track fills
        for (let i = 1; i <= 3; i++) {
            const btn = document.getElementById(`step-btn-${i}`);
            const dot = document.getElementById(`step-dot-${i}`);
            if (btn && dot) {
                btn.setAttribute('role', 'tab');
                btn.tabIndex = i === sipCurrentStep ? 0 : -1;
                btn.setAttribute('aria-selected', String(i === sipCurrentStep));
                btn.setAttribute('aria-controls', 'sip-step-' + i);
                btn.disabled = i > sipMaxVisitedStep;
                btn.classList.remove('sip-step-item--active', 'sip-step-item--done', 'sip-step-item--upcoming');
                if (i === sipCurrentStep) {
                    btn.classList.add('sip-step-item--active');
                }
                else if (i < sipCurrentStep) {
                    btn.classList.add('sip-step-item--done');
                }
                else {
                    btn.classList.add('sip-step-item--upcoming');
                }
            }
        }
        // Track line fills
        const fill1 = document.getElementById('step-track-fill-1');
        const fill2 = document.getElementById('step-track-fill-2');
        if (fill1)
            fill1.style.width = sipCurrentStep >= 2 ? '100%' : '0%';
        if (fill2)
            fill2.style.width = sipCurrentStep >= 3 ? '100%' : '0%';
        const prevBtn = document.getElementById('sip-prev-btn');
        const stepHint = document.getElementById('sip-step-hint');
        const nextBtn = document.getElementById('sip-next-btn');
        const nextText = document.getElementById('sip-next-text');
        const iconContinue = document.querySelector('.sip-icon-continue');
        const iconSubmit = document.querySelector('.sip-icon-submit');
        const iconSpinner = document.querySelector('.sip-icon-spinner');
        if (prevBtn) {
            if (sipCurrentStep > 1) {
                prevBtn.classList.remove('sip-btn-back--hidden');
            }
            else {
                prevBtn.classList.add('sip-btn-back--hidden');
            }
        }
        if (stepHint) {
            if (sipCurrentStep === 1)
                stepHint.textContent = 'Step 1 of 3';
            else if (sipCurrentStep === 2)
                stepHint.textContent = 'Step 2 of 3';
            else if (sipCurrentStep === 3)
                stepHint.textContent = 'Final Step';
        }
        if (nextBtn && nextText) {
            if (sipCurrentStep === 3) {
                nextBtn.classList.add('sip-btn-action--submit');
                nextText.textContent = 'Submit idea';
                if (iconContinue)
                    iconContinue.style.display = 'none';
                if (iconSubmit)
                    iconSubmit.style.display = 'inline-block';
                if (iconSpinner)
                    iconSpinner.style.display = 'none';
            }
            else {
                nextBtn.classList.remove('sip-btn-action--submit');
                nextText.textContent = 'Continue';
                if (iconContinue)
                    iconContinue.style.display = 'inline-block';
                if (iconSubmit)
                    iconSubmit.style.display = 'none';
                if (iconSpinner)
                    iconSpinner.style.display = 'none';
            }
        }
    }
    function sipNextStep() {
        if (sipCurrentStep === 1) {
            const checked = document.querySelector('input[name="sip-category"]:checked');
            if (!checked) {
                if (window.sfToast)
                    window.sfToast('Please select a category to continue.', 'warning');
                return;
            }
            sipCurrentStep = 2;
            updateSipUI();
            // Scroll to top of step 2
            const step2 = document.getElementById('sip-scroll-body');
            if (step2)
                step2.scrollTop = 0;
            document.getElementById('sip-title')?.focus();
        }
        else if (sipCurrentStep === 2) {
            const title = document.getElementById('sip-title').value.trim();
            const desc = document.getElementById('sip-description').value.trim();
            if (title.length < 10) {
                const titleInput = document.getElementById('sip-title');
                titleInput.classList.add('sip-input-error');
                titleInput.focus();
                setTimeout(() => titleInput.classList.remove('sip-input-error'), 1200);
                if (window.sfToast)
                    window.sfToast('Title must be at least 10 characters.', 'warning');
                return;
            }
            if (desc.length < 20) {
                const descInput = document.getElementById('sip-description');
                descInput.classList.add('sip-input-error');
                descInput.focus();
                setTimeout(() => descInput.classList.remove('sip-input-error'), 1200);
                if (window.sfToast)
                    window.sfToast('Description must be at least 20 characters.', 'warning');
                return;
            }
            try {
                window.sfSchoolForm?.validate();
            }
            catch (error) {
                window.sfSubmissionRecovery?.tell(error?.message || String(error));
                return;
            }
            // Populate review step
            const checkedCat = document.querySelector('input[name="sip-category"]:checked');
            const cat = checkedCat?.value || '';
            const isAnon = document.getElementById('sip-anon').checked;
            document.getElementById('rev-category').textContent = checkedCat?.dataset?.categoryName || cat;
            document.getElementById('rev-title').textContent = title;
            document.getElementById('rev-desc').textContent = desc;
            document.getElementById('rev-anon-badge').textContent = isAnon ? 'Anonymous Submission' : 'Public Profile';
            sipCurrentStep = 3;
            updateSipUI();
            const step3 = document.getElementById('sip-scroll-body');
            if (step3)
                step3.scrollTop = 0;
            document.getElementById('sip-consent')?.focus();
        }
        else if (sipCurrentStep === 3) {
            const consent = document.getElementById('sip-consent').checked;
            if (!consent) {
                const consentWrapper = document.getElementById('sip-consent-wrapper');
                if (consentWrapper) {
                    consentWrapper.classList.add('sip-consent-card--error');
                    setTimeout(() => consentWrapper.classList.remove('sip-consent-card--error'), 1200);
                }
                if (window.sfToast)
                    window.sfToast('Please accept the community guidelines notice.', 'warning');
                return;
            }
            document.getElementById('submit-idea-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
    }
    function sipPrevStep() {
        if (sipCurrentStep > 1) {
            sipCurrentStep--;
            updateSipUI();
        }
    }
    function sfRestoreSubmissionStep(hasCategory = true) {
        sipMaxVisitedStep = Math.max(2, sipMaxVisitedStep);
        sipCurrentStep = hasCategory ? 2 : 1;
        document.getElementById('sip-success').hidden = true;
        document.getElementById('sip-footer').classList.remove('sip-footer-hidden');
        updateSipUI();
        if (hasCategory)
            document.getElementById('sip-title').focus();
        else
            document.querySelector('input[name="sip-category"]')?.focus();
    }
    document.getElementById('sip-stepper')?.addEventListener('keydown', e => {
        const steps = Array.from(document.querySelectorAll('#sip-stepper button:not([disabled])'));
        const index = steps.indexOf(e.target);
        if (index < 0)
            return;
        const next = e.key === 'ArrowRight' ? (index + 1) % steps.length : e.key === 'ArrowLeft' ? (index + steps.length - 1) % steps.length : e.key === 'Home' ? 0 : e.key === 'End' ? steps.length - 1 : -1;
        if (next >= 0) {
            e.preventDefault();
            goToStep(Number(steps[next].id.replace('step-btn-', '')));
            steps[next].focus();
        }
    });
    async function handleIdeaSubmit(e) {
        e.preventDefault();
        if (sipSending)
            return;
        if (!document.querySelector('input[name="sip-category"]:checked') || !document.getElementById('sip-consent').checked) {
            window.sfSubmissionRecovery.tell('Complete the idea and accept the community notice before submitting.');
            return;
        }
        if (!document.getElementById('sip-anon').checked && !document.getElementById('sf-auth-config')?.dataset.user) {
            window.sfSubmissionRecovery.tell('Sign in to attach this idea to your account. Your draft will be kept in this tab for 30 minutes.');
            window.openAuthModal('signin');
            return;
        }
        sipSending = true;
        const nextBtn = document.getElementById('sip-next-btn');
        const nextText = document.getElementById('sip-next-text');
        const iconSubmit = document.querySelector('.sip-icon-submit');
        const iconSpinner = document.querySelector('.sip-icon-spinner');
        nextBtn.disabled = true;
        nextBtn.classList.add('sip-btn-action--loading');
        if (nextText)
            nextText.textContent = 'Submitting...';
        if (iconSubmit)
            iconSubmit.style.display = 'none';
        if (iconSpinner)
            iconSpinner.style.display = 'inline-block';
        const category = document.querySelector('input[name="sip-category"]:checked')?.value || '';
        const title = document.getElementById('sip-title').value.trim();
        const description = document.getElementById('sip-description').value.trim();
        const isAnonymous = document.getElementById('sip-anon').checked;
        try {
            const recovery = window.sfSubmissionRecovery;
            const value = { title, description, category, isAnonymous, ...(window.sfSchoolForm?.extra() || {}) };
            window.sfSchoolForm?.validate();
            const operation = await recovery.prepare(value);
            const data = await recovery.request('submit', { ...value, requestId: operation.key, actor: operation.actor });
            await recovery.finish(data, operation);
            sfShowSubmissionSuccess(data);
        }
        catch (err) {
            window.sfSubmissionRecovery.failed(err);
            if (window.sfToast)
                window.sfToast(err?.message || 'Submission failed', 'error');
        }
        finally {
            sipSending = false;
            nextBtn.disabled = false;
            nextBtn.classList.remove('sip-btn-action--loading');
            if (nextText)
                nextText.textContent = 'Submit idea';
            if (iconSubmit)
                iconSubmit.style.display = 'inline-block';
            if (iconSpinner)
                iconSpinner.style.display = 'none';
        }
    }
    document.getElementById('sip-download-receipt')?.addEventListener('click', () => {
        const status = document.getElementById('sip-owner-status');
        const school = document.querySelector('meta[name="school-base"]')?.content || '';
        const receipt = ['SuggFeed private submission receipt', 'School workspace: ' + location.origin + school, 'Status: received for school review.', ...(sipTrackingCode ? ['Private tracking code: ' + sipTrackingCode, 'Keep this code private. It grants access to your submission updates.'] : []), ...(status && !status.hidden ? ['Your status page: ' + status.href] : []), 'Access still requires your authorized account or original browser.'].join('\n');
        const url = URL.createObjectURL(new Blob([receipt], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'suggfeed-private-receipt.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    function sfShowSubmissionSuccess(data) {
        const status = document.getElementById('sip-owner-status');
        if (status) {
            status.hidden = !data.id;
            status.href = sfSchoolPath('/submission/' + encodeURIComponent(data.id || ''));
        }
        const details = document.getElementById('sip-private-details');
        if (details) {
            details.hidden = !data.id;
            details.href = typeof sfSchoolPath === 'function' ? sfSchoolPath('/submission-details/' + encodeURIComponent(data.id || '')) : '/submission-details/' + encodeURIComponent(data.id || '');
        }
        sipTrackingCode = data.tracking_code || "";
        document.getElementById('sip-success-code').textContent = sipTrackingCode;
        // Reset copy button state
        document.getElementById('sip-copy-label').textContent = 'Copy';
        document.getElementById('sip-copy-confirm').hidden = true;
        const copyBtn = document.getElementById('sip-copy-btn');
        if (copyBtn)
            copyBtn.classList.remove('sip-copy-btn--copied');
        document.getElementById('sip-step-1').hidden = true;
        document.getElementById('sip-step-2').hidden = true;
        document.getElementById('sip-step-3').hidden = true;
        document.getElementById('sip-footer').classList.add('sip-footer-hidden');
        document.querySelectorAll('#sip-stepper button').forEach(button => button.disabled = true);
        document.getElementById('sip-queue-btn').hidden = true;
        const successView = document.getElementById('sip-success');
        successView.hidden = false;
        successView.classList.add('sip-step-animate-in');
        const card = document.querySelector('.sip-tracking-card');
        if (card)
            card.hidden = !sipTrackingCode;
        const heading = document.querySelector('.sip-success-title');
        if (heading) {
            heading.tabIndex = -1;
            heading.focus();
        }
        const summary = document.querySelector('.sip-success-sub');
        if (summary)
            summary.textContent = sipTrackingCode ? 'Received for school review. Keep your private tracking code to check its status and any requests for clarification.' : 'Received for school review. Follow its status from My ideas; the school may ask for clarification before publishing.';
    }
    function copyTrackingCode() {
        if (!sipTrackingCode)
            return;
        function onCopiedSuccess() {
            const label = document.getElementById('sip-copy-label');
            const confirm = document.getElementById('sip-copy-confirm');
            const btn = document.getElementById('sip-copy-btn');
            if (label)
                label.textContent = 'Copied!';
            if (btn)
                btn.classList.add('sip-copy-btn--copied');
            if (confirm)
                confirm.hidden = false;
            setTimeout(() => {
                if (label)
                    label.textContent = 'Copy';
                if (btn)
                    btn.classList.remove('sip-copy-btn--copied');
                if (confirm)
                    confirm.hidden = true;
            }, 2800);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(sipTrackingCode).then(onCopiedSuccess).catch(() => {
                fallbackCopy();
                onCopiedSuccess();
            });
        }
        else {
            fallbackCopy();
            onCopiedSuccess();
        }
    }
    function fallbackCopy() {
        const el = document.getElementById('sip-success-code');
        if (!el)
            return;
        const range = document.createRange();
        range.selectNode(el);
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        try {
            document.execCommand('copy');
        }
        catch (e) { }
        if (sel)
            sel.removeAllRanges();
    }
    document.getElementById('sip-save-code')?.addEventListener('click', () => {
        if (!sipTrackingCode)
            return;
        try {
            const data = JSON.parse(localStorage.getItem(sfSchoolKey('sf_my_tracking_codes')) || '[]');
            const codes = Array.isArray(data) ? data.filter(x => typeof x === 'string' && /^CV-[A-F0-9]{32}$/.test(x)) : [];
            localStorage.setItem(sfSchoolKey('sf_my_tracking_codes'), JSON.stringify([...new Set([...codes, sipTrackingCode])].slice(-20)));
            document.getElementById('sip-code-status').textContent = 'Code saved on this device. Others using this browser can access it.';
        }
        catch {
            document.getElementById('sip-code-status').textContent = 'Code could not be saved. Copy it to a safe place instead.';
        }
    });
    document.getElementById('sip-clear-codes')?.addEventListener('click', async () => {
        if (!window.sfConfirm || !await window.sfConfirm('Remove all tracking codes saved on this device? Copy any you still need first.', { title: 'Clear saved tracking codes?', confirmLabel: 'Clear codes', danger: true }))
            return;
        try {
            localStorage.removeItem(sfSchoolKey('sf_my_tracking_codes'));
            document.getElementById('sip-code-status').textContent = 'Saved codes cleared.';
        }
        catch {
            document.getElementById('sip-code-status').textContent = 'Saved codes could not be cleared.';
        }
    });
    Object.assign(window, { sfRestoreSubmissionStep, sfShowSubmissionSuccess, openSubmitPanel, closeSubmitPanel, onCategorySelected, handleTitleInput, handleDescInput, handleAnonToggle, handleConsentChange, goToStep, updateSipUI, sipNextStep, sipPrevStep, handleIdeaSubmit, copyTrackingCode, fallbackCopy });
})();
