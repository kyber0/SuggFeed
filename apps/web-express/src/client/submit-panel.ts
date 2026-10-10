// Browser source extracted from views/partials/submit-panel.eta.
(function () {
let sipCurrentStep = 1;
  let sipMaxVisitedStep = 1;
  let sipTrackingCode = '';
  let sipReturnFocusTo = null;

  function openSubmitPanel(defaultCat) {
    sipReturnFocusTo = (document.activeElement as HTMLElement);
    sipCurrentStep = 1;
    sipMaxVisitedStep = 1;
    
    const overlay = (document.getElementById('submit-panel-overlay') as HTMLElement);
    const panel = (document.getElementById('submit-panel') as HTMLElement);
    const form = (document.getElementById('submit-idea-form') as HTMLFormElement);
    
    if (overlay) overlay.removeAttribute('hidden');
    if (panel) panel.removeAttribute('hidden');
    if (form) form.reset();
    
    (document.getElementById('sip-success') as HTMLElement).hidden = true;
    (document.getElementById('sip-footer') as HTMLElement).classList.remove('sip-footer-hidden');
    document.body.style.overflow = 'hidden';

    // Clear active card states
    document.querySelectorAll<HTMLElement>('.sip-cat-card').forEach(c => c.classList.remove('sip-cat-card--selected'));
    
    if (defaultCat) {
      const radio = document.querySelector<HTMLInputElement>(`input[name="sip-category"][value="${defaultCat}"]`);
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
        ? document.querySelector<HTMLElement>(`input[name="sip-category"][value="${defaultCat}"]`)
        : document.querySelector<HTMLInputElement>('input[name="sip-category"]');
      if (firstRadio) firstRadio.focus();
    }, 100);
  }

  function closeSubmitPanel() {
    const overlay = (document.getElementById('submit-panel-overlay') as HTMLElement);
    const panel = (document.getElementById('submit-panel') as HTMLElement);
    if (overlay) overlay.hidden = true;
    if (panel) panel.hidden = true;
    document.body.style.overflow = '';
    if (sipReturnFocusTo && typeof sipReturnFocusTo.focus === 'function') sipReturnFocusTo.focus();
  }

  // Keyboard shortcut: Esc closes panel
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const panel = (document.getElementById('submit-panel') as HTMLElement);
      if (panel && !panel.hidden) {
        e.preventDefault();
        closeSubmitPanel();
        return;
      }
    }
    if (e.key === 'Tab') {
      const panel = (document.getElementById('submit-panel') as HTMLElement);
      if (!panel || panel.hidden) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.closest('[hidden]') && el.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && ((document.activeElement as HTMLElement) === first || !focusable.includes((document.activeElement as HTMLElement)))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && ((document.activeElement as HTMLElement) === last || !focusable.includes((document.activeElement as HTMLElement)))) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  function onCategorySelected(cat) {
    document.querySelectorAll<HTMLElement>('.sip-cat-card').forEach(card => card.classList.remove('sip-cat-card--selected'));
    const activeCard = (document.getElementById(`cat-card-${cat.replace(/\s+/g, '-')}`) as HTMLElement);
    if (activeCard) activeCard.classList.add('sip-cat-card--selected');
  }

  function handleTitleInput() {
    const input = (document.getElementById('sip-title') as HTMLInputElement);
    const val = input ? input.value : '';
    const counter = (document.getElementById('sip-title-count') as HTMLElement);
    const req = (document.getElementById('sip-title-req') as HTMLElement);
    
    if (counter) counter.textContent = `${val.length} / 100`;
    if (counter) {
      counter.classList.toggle('is-warn', val.length >= 80 && val.length < 95);
      counter.classList.toggle('is-danger', val.length >= 95);
    }

    if (req) {
      if (val.trim().length >= 8) {
        req.textContent = 'Ready';
        req.className = 'sip-validation-badge sip-validation-badge--valid';
      } else {
        req.textContent = 'Min 8 chars';
        req.className = 'sip-validation-badge';
      }
    }
  }

  function handleDescInput() {
    const textarea = (document.getElementById('sip-description') as HTMLTextAreaElement);
    const val = textarea ? textarea.value : '';
    const counter = (document.getElementById('sip-desc-count') as HTMLElement);
    const req = (document.getElementById('sip-desc-req') as HTMLElement);
    
    if (counter) counter.textContent = `${val.length} / 1500`;
    if (counter) {
      counter.classList.toggle('is-warn', val.length >= 1200 && val.length < 1450);
      counter.classList.toggle('is-danger', val.length >= 1450);
    }

    if (req) {
      if (val.trim().length >= 20) {
        req.textContent = 'Ready';
        req.className = 'sip-validation-badge sip-validation-badge--valid';
      } else {
        req.textContent = 'Min 20 chars';
        req.className = 'sip-validation-badge';
      }
    }
  }

  function handleAnonToggle() {
    const isAnon = (document.getElementById('sip-anon') as HTMLInputElement)?.checked;
    const badge = (document.getElementById('sip-anon-status-pill') as HTMLElement);
    if (badge) {
      if (isAnon) {
        badge.textContent = 'Identity Hidden';
        badge.className = 'sip-badge-anon-state sip-badge-anon-state--anon';
      } else {
        badge.textContent = 'Public Profile';
        badge.className = 'sip-badge-anon-state sip-badge-anon-state--public';
      }
    }
  }

  function handleConsentChange() {
    const consentWrapper = (document.getElementById('sip-consent-wrapper') as HTMLElement);
    const checked = (document.getElementById('sip-consent') as HTMLInputElement)?.checked;
    if (consentWrapper) {
      consentWrapper.classList.toggle('sip-consent-card--checked', !!checked);
    }
  }

  function goToStep(step) {
    if (step < 1 || step > 3) return;
    // Allow jumping backwards or to step if already visited
    if (step <= sipMaxVisitedStep) {
      sipCurrentStep = step;
      updateSipUI();
    }
  }

  function updateSipUI() {
    if (sipCurrentStep > sipMaxVisitedStep) {
      sipMaxVisitedStep = sipCurrentStep;
    }

    // Panels visibility with animation classes
    for (let i = 1; i <= 3; i++) {
      const panel = (document.getElementById(`sip-step-${i}`) as HTMLElement);
      if (panel) {
        if (i === sipCurrentStep) {
          panel.hidden = false;
          panel.classList.add('sip-step-animate-in');
        } else {
          panel.hidden = true;
          panel.classList.remove('sip-step-animate-in');
        }
      }
    }

    // Stepper buttons & track fills
    for (let i = 1; i <= 3; i++) {
      const btn = (document.getElementById(`step-btn-${i}`) as HTMLElement);
      const dot = (document.getElementById(`step-dot-${i}`) as HTMLElement);
      
      if (btn && dot) {
        btn.classList.remove('sip-step-item--active', 'sip-step-item--done', 'sip-step-item--upcoming');
        if (i === sipCurrentStep) {
          btn.classList.add('sip-step-item--active');
        } else if (i < sipCurrentStep) {
          btn.classList.add('sip-step-item--done');
        } else {
          btn.classList.add('sip-step-item--upcoming');
        }
      }
    }

    // Track line fills
    const fill1 = (document.getElementById('step-track-fill-1') as HTMLElement);
    const fill2 = (document.getElementById('step-track-fill-2') as HTMLElement);
    if (fill1) fill1.style.width = sipCurrentStep >= 2 ? '100%' : '0%';
    if (fill2) fill2.style.width = sipCurrentStep >= 3 ? '100%' : '0%';

    const prevBtn = (document.getElementById('sip-prev-btn') as HTMLButtonElement);
    const stepHint = (document.getElementById('sip-step-hint') as HTMLElement);
    const nextBtn = (document.getElementById('sip-next-btn') as HTMLButtonElement);
    const nextText = (document.getElementById('sip-next-text') as HTMLElement);
    const iconContinue = document.querySelector<HTMLElement>('.sip-icon-continue');
    const iconSubmit = document.querySelector<HTMLElement>('.sip-icon-submit');
    const iconSpinner = document.querySelector<HTMLElement>('.sip-icon-spinner');

    if (prevBtn) {
      if (sipCurrentStep > 1) {
        prevBtn.classList.remove('sip-btn-back--hidden');
      } else {
        prevBtn.classList.add('sip-btn-back--hidden');
      }
    }

    if (stepHint) {
      if (sipCurrentStep === 1) stepHint.textContent = 'Step 1 of 3';
      else if (sipCurrentStep === 2) stepHint.textContent = 'Step 2 of 3';
      else if (sipCurrentStep === 3) stepHint.textContent = 'Final Step';
    }

    if (nextBtn && nextText) {
      if (sipCurrentStep === 3) {
        nextBtn.classList.add('sip-btn-action--submit');
        nextText.textContent = 'Submit idea';
        if (iconContinue) iconContinue.style.display = 'none';
        if (iconSubmit) iconSubmit.style.display = 'inline-block';
        if (iconSpinner) iconSpinner.style.display = 'none';
      } else {
        nextBtn.classList.remove('sip-btn-action--submit');
        nextText.textContent = 'Continue';
        if (iconContinue) iconContinue.style.display = 'inline-block';
        if (iconSubmit) iconSubmit.style.display = 'none';
        if (iconSpinner) iconSpinner.style.display = 'none';
      }
    }
  }

  function sipNextStep() {
    if (sipCurrentStep === 1) {
      const checked = document.querySelector<HTMLInputElement>('input[name="sip-category"]:checked');
      if (!checked) {
        if (window.sfToast) sfToast('Please select a category to continue.', 'warning');
        else alert('Please select a category to continue.');
        return;
      }
      sipCurrentStep = 2;
      updateSipUI();
      // Scroll to top of step 2
      const step2 = (document.getElementById('sip-step-2') as HTMLElement);
      if (step2) step2.scrollTop = 0;
    } else if (sipCurrentStep === 2) {
      const title = (document.getElementById('sip-title') as HTMLInputElement).value.trim();
      const desc = (document.getElementById('sip-description') as HTMLTextAreaElement).value.trim();
      
      if (title.length < 8) {
        const titleInput = (document.getElementById('sip-title') as HTMLInputElement);
        titleInput.classList.add('sip-input-error');
        titleInput.focus();
        setTimeout(() => titleInput.classList.remove('sip-input-error'), 1200);
        if (window.sfToast) sfToast('Title must be at least 8 characters.', 'warning');
        else alert('Title must be at least 8 characters.');
        return;
      }
      if (desc.length < 20) {
        const descInput = (document.getElementById('sip-description') as HTMLTextAreaElement);
        descInput.classList.add('sip-input-error');
        descInput.focus();
        setTimeout(() => descInput.classList.remove('sip-input-error'), 1200);
        if (window.sfToast) sfToast('Description must be at least 20 characters.', 'warning');
        else alert('Description must be at least 20 characters.');
        return;
      }

      // Populate review step
      const cat = document.querySelector<HTMLInputElement>('input[name="sip-category"]:checked').value;
      const isAnon = (document.getElementById('sip-anon') as HTMLInputElement).checked;

      (document.getElementById('rev-category') as HTMLElement).textContent = cat;
      (document.getElementById('rev-title') as HTMLElement).textContent = title;
      (document.getElementById('rev-desc') as HTMLElement).textContent = desc;
      (document.getElementById('rev-anon-badge') as HTMLElement).textContent = isAnon ? 'Anonymous Submission' : 'Public Profile';

      sipCurrentStep = 3;
      updateSipUI();
      const step3 = (document.getElementById('sip-step-3') as HTMLElement);
      if (step3) step3.scrollTop = 0;
    } else if (sipCurrentStep === 3) {
      const consent = (document.getElementById('sip-consent') as HTMLInputElement).checked;
      if (!consent) {
        const consentWrapper = (document.getElementById('sip-consent-wrapper') as HTMLElement);
        if (consentWrapper) {
          consentWrapper.classList.add('sip-consent-card--error');
          setTimeout(() => consentWrapper.classList.remove('sip-consent-card--error'), 1200);
        }
        if (window.sfToast) sfToast('Please accept the community guidelines notice.', 'warning');
        else alert('Please accept the community guidelines notice.');
        return;
      }
      (document.getElementById('submit-idea-form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }

  function sipPrevStep() {
    if (sipCurrentStep > 1) {
      sipCurrentStep--;
      updateSipUI();
    }
  }

  async function handleIdeaSubmit(e) {
    e.preventDefault();
    const nextBtn = (document.getElementById('sip-next-btn') as HTMLButtonElement);
    const nextText = (document.getElementById('sip-next-text') as HTMLElement);
    const iconSubmit = document.querySelector<HTMLElement>('.sip-icon-submit');
    const iconSpinner = document.querySelector<HTMLElement>('.sip-icon-spinner');

    nextBtn.disabled = true;
    nextBtn.classList.add('sip-btn-action--loading');
    if (nextText) nextText.textContent = 'Submitting...';
    if (iconSubmit) iconSubmit.style.display = 'none';
    if (iconSpinner) iconSpinner.style.display = 'inline-block';

    const category = document.querySelector<HTMLInputElement>('input[name="sip-category"]:checked').value;
    const title = (document.getElementById('sip-title') as HTMLInputElement).value.trim();
    const description = (document.getElementById('sip-description') as HTMLTextAreaElement).value.trim();
    const isAnonymous = (document.getElementById('sip-anon') as HTMLInputElement).checked;

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ title, description, category, isAnonymous })
      });
      const data = await res.json().catch(() => ({ success: false, error: 'Network response was not valid JSON' }));
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed');

      sipTrackingCode = data.tracking_code;
      (document.getElementById('sip-success-code') as HTMLElement).textContent = sipTrackingCode;

      // Reset copy button state
      (document.getElementById('sip-copy-label') as HTMLElement).textContent = 'Copy';
      (document.getElementById('sip-copy-confirm') as HTMLElement).hidden = true;
      const copyBtn = (document.getElementById('sip-copy-btn') as HTMLButtonElement);
      if (copyBtn) copyBtn.classList.remove('sip-copy-btn--copied');

      // Save tracking code in localStorage
      try {
        const stored = JSON.parse(localStorage.getItem('sf_my_tracking_codes') || '[]');
        stored.push(sipTrackingCode);
        localStorage.setItem('sf_my_tracking_codes', JSON.stringify(stored));
      } catch (err) {}

      (document.getElementById('sip-step-1') as HTMLElement).hidden = true;
      (document.getElementById('sip-step-2') as HTMLElement).hidden = true;
      (document.getElementById('sip-step-3') as HTMLElement).hidden = true;
      (document.getElementById('sip-footer') as HTMLElement).classList.add('sip-footer-hidden');
      
      const successView = (document.getElementById('sip-success') as HTMLElement);
      successView.hidden = false;
      successView.classList.add('sip-step-animate-in');

    } catch (err) {
      if (window.sfToast) sfToast(err.message || 'Submission failed', 'error');
      else alert(err.message || 'Submission failed');
    } finally {
      nextBtn.disabled = false;
      nextBtn.classList.remove('sip-btn-action--loading');
      if (nextText) nextText.textContent = 'Submit idea';
      if (iconSubmit) iconSubmit.style.display = 'inline-block';
      if (iconSpinner) iconSpinner.style.display = 'none';
    }
  }

  function copyTrackingCode() {
    if (!sipTrackingCode) return;
    
    function onCopiedSuccess() {
      const label = (document.getElementById('sip-copy-label') as HTMLElement);
      const confirm = (document.getElementById('sip-copy-confirm') as HTMLElement);
      const btn = (document.getElementById('sip-copy-btn') as HTMLButtonElement);
      if (label) label.textContent = 'Copied!';
      if (btn) btn.classList.add('sip-copy-btn--copied');
      if (confirm) confirm.hidden = false;
      
      setTimeout(() => {
        if (label) label.textContent = 'Copy';
        if (btn) btn.classList.remove('sip-copy-btn--copied');
        if (confirm) confirm.hidden = true;
      }, 2800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sipTrackingCode).then(onCopiedSuccess).catch(() => {
        fallbackCopy();
        onCopiedSuccess();
      });
    } else {
      fallbackCopy();
      onCopiedSuccess();
    }
  }

  function fallbackCopy() {
    const el = (document.getElementById('sip-success-code') as HTMLElement);
    if (!el) return;
    const range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    try {
      document.execCommand('copy');
    } catch (e) {}
    window.getSelection().removeAllRanges();
  }
Object.assign(window, { openSubmitPanel, closeSubmitPanel, onCategorySelected, handleTitleInput, handleDescInput, handleAnonToggle, handleConsentChange, goToStep, updateSipUI, sipNextStep, sipPrevStep, handleIdeaSubmit, copyTrackingCode, fallbackCopy });
})();
