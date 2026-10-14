// Browser source extracted from views/partials/submit-panel.eta.
(function () {
let sipCurrentStep = 1;
  let sipMaxVisitedStep = 1;
  let sipTrackingCode = '';
  let sipReturnFocusTo = null;
  let sipOpened = false;
  let sipSending = false;

  function openSubmitPanel(defaultCat) {
    sipReturnFocusTo = (document.activeElement as HTMLElement);
    sipCurrentStep = 1;
    sipMaxVisitedStep = 1;
    
    const overlay = (document.getElementById('submit-panel-overlay') as HTMLElement);
    const panel = (document.getElementById('submit-panel') as HTMLElement);
    const form = (document.getElementById('submit-idea-form') as HTMLFormElement);
    
    if (overlay) overlay.removeAttribute('hidden');
    if (panel) panel.removeAttribute('hidden');
    if (form && (!sipOpened || !(document.getElementById('sip-success') as HTMLElement).hidden)) {
      form.reset();
      try {const choice=localStorage.getItem('sf_anon_default');const signedIn=!!document.getElementById('sf-auth-config')?.dataset.user;(document.getElementById('sip-anon') as HTMLInputElement).checked=!signedIn || choice!=='false';}catch{}
    }
    sipOpened = true;
    window.dispatchEvent(new CustomEvent('sf:submission-open'));
    (document.getElementById('sip-queue-btn') as HTMLButtonElement).hidden=false;
    
    (document.getElementById('sip-success') as HTMLElement).hidden = true;
    (document.getElementById('sip-footer') as HTMLElement).classList.remove('sip-footer-hidden');
    document.body.style.overflow = 'hidden';

    // Clear active card states
    const currentCategory = document.querySelector<HTMLInputElement>('input[name="sip-category"]:checked');
    if(currentCategory) onCategorySelected(currentCategory.value);
    
    if (defaultCat && !document.querySelector('input[name="sip-category"]:checked')) {
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
    if(e.defaultPrevented || document.querySelector('dialog[open]'))return;
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
      if (val.trim().length >= 10) {
        req.textContent = 'Ready';
        req.className = 'sip-validation-badge sip-validation-badge--valid';
      } else {
        req.textContent = 'Min 10 chars';
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
    (document.getElementById('sip-queue-btn') as HTMLButtonElement).hidden = sipCurrentStep !== 3;
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
        btn.setAttribute('role','tab');btn.tabIndex=i === sipCurrentStep ? 0 : -1;btn.setAttribute('aria-selected',String(i === sipCurrentStep));btn.setAttribute('aria-controls','sip-step-'+i);
        (btn as HTMLButtonElement).disabled = i > sipMaxVisitedStep;
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
        return;
      }
      sipCurrentStep = 2;
      updateSipUI();
      // Scroll to top of step 2
      const step2 = (document.getElementById('sip-step-2') as HTMLElement);
      if (step2) step2.scrollTop = 0;
      (document.getElementById('sip-title') as HTMLInputElement)?.focus();
    } else if (sipCurrentStep === 2) {
      const title = (document.getElementById('sip-title') as HTMLInputElement).value.trim();
      const desc = (document.getElementById('sip-description') as HTMLTextAreaElement).value.trim();
      
      if (title.length < 10) {
        const titleInput = (document.getElementById('sip-title') as HTMLInputElement);
        titleInput.classList.add('sip-input-error');
        titleInput.focus();
        setTimeout(() => titleInput.classList.remove('sip-input-error'), 1200);
        if (window.sfToast) sfToast('Title must be at least 10 characters.', 'warning');
        return;
      }
      if (desc.length < 20) {
        const descInput = (document.getElementById('sip-description') as HTMLTextAreaElement);
        descInput.classList.add('sip-input-error');
        descInput.focus();
        setTimeout(() => descInput.classList.remove('sip-input-error'), 1200);
        if (window.sfToast) sfToast('Description must be at least 20 characters.', 'warning');
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
      (document.getElementById('sip-consent') as HTMLInputElement)?.focus();
    } else if (sipCurrentStep === 3) {
      const consent = (document.getElementById('sip-consent') as HTMLInputElement).checked;
      if (!consent) {
        const consentWrapper = (document.getElementById('sip-consent-wrapper') as HTMLElement);
        if (consentWrapper) {
          consentWrapper.classList.add('sip-consent-card--error');
          setTimeout(() => consentWrapper.classList.remove('sip-consent-card--error'), 1200);
        }
        if (window.sfToast) sfToast('Please accept the community guidelines notice.', 'warning');
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

  function sfRestoreSubmissionStep(hasCategory = true) {
    sipMaxVisitedStep = Math.max(2,sipMaxVisitedStep);
    sipCurrentStep = hasCategory ? 2 : 1;
    (document.getElementById('sip-success') as HTMLElement).hidden = true;
    (document.getElementById('sip-footer') as HTMLElement).classList.remove('sip-footer-hidden');
    updateSipUI();
    if(hasCategory)(document.getElementById('sip-title') as HTMLInputElement).focus();
    else document.querySelector<HTMLInputElement>('input[name="sip-category"]')?.focus();
  }
  document.getElementById('sip-stepper')?.addEventListener('keydown',e=>{
    const steps=Array.from(document.querySelectorAll<HTMLButtonElement>('#sip-stepper button:not([disabled])'));
    const index=steps.indexOf(e.target as HTMLButtonElement);
    if(index<0)return;
    const next=e.key==='ArrowRight'?(index+1)%steps.length:e.key==='ArrowLeft'?(index+steps.length-1)%steps.length:e.key==='Home'?0:e.key==='End'?steps.length-1:-1;
    if(next>=0){e.preventDefault();goToStep(Number(steps[next].id.replace('step-btn-','')));steps[next].focus();}
  });

  async function handleIdeaSubmit(e) {
    e.preventDefault();
    if (sipSending) return;
    if(!document.querySelector('input[name="sip-category"]:checked') || !(document.getElementById('sip-consent') as HTMLInputElement).checked){(window as any).sfSubmissionRecovery.tell('Complete the idea and accept the community notice before submitting.');return;}
    sipSending = true;
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
      const recovery=(window as any).sfSubmissionRecovery;
      const value={title,description,category,isAnonymous};
      const operation=await recovery.prepare(value);
      const data=await recovery.request('submit',{...value,requestId:operation.key,actor:operation.actor});
      await recovery.finish(data,operation);
      sfShowSubmissionSuccess(data);


    } catch (err) {
      (window as any).sfSubmissionRecovery.failed(err);
      if (window.sfToast) sfToast(err.message || 'Submission failed', 'error');
    } finally {
      sipSending = false;
      nextBtn.disabled = false;
      nextBtn.classList.remove('sip-btn-action--loading');
      if (nextText) nextText.textContent = 'Submit idea';
      if (iconSubmit) iconSubmit.style.display = 'inline-block';
      if (iconSpinner) iconSpinner.style.display = 'none';
    }
  }

  function sfShowSubmissionSuccess(data) {
      sipTrackingCode = data.tracking_code || "";
      (document.getElementById('sip-success-code') as HTMLElement).textContent = sipTrackingCode;

      // Reset copy button state
      (document.getElementById('sip-copy-label') as HTMLElement).textContent = 'Copy';
      (document.getElementById('sip-copy-confirm') as HTMLElement).hidden = true;
      const copyBtn = (document.getElementById('sip-copy-btn') as HTMLButtonElement);
      if (copyBtn) copyBtn.classList.remove('sip-copy-btn--copied');

      (document.getElementById('sip-step-1') as HTMLElement).hidden = true;
      (document.getElementById('sip-step-2') as HTMLElement).hidden = true;
      (document.getElementById('sip-step-3') as HTMLElement).hidden = true;
      (document.getElementById('sip-footer') as HTMLElement).classList.add('sip-footer-hidden');
      
      document.querySelectorAll<HTMLButtonElement>('#sip-stepper button').forEach(button=>button.disabled=true);
      (document.getElementById('sip-queue-btn') as HTMLButtonElement).hidden=true;
      const successView = (document.getElementById('sip-success') as HTMLElement);
      successView.hidden = false;
      successView.classList.add('sip-step-animate-in');
      const card=document.querySelector<HTMLElement>('.sip-tracking-card');if(card)card.hidden=!sipTrackingCode;
      const heading=document.querySelector<HTMLElement>('.sip-success-title');if(heading){heading.tabIndex=-1;heading.focus();}
      const summary=document.querySelector<HTMLElement>('.sip-success-sub');if(summary)summary.textContent=sipTrackingCode?'Your idea is recorded. Copy its private tracking code or choose to remember it on this device.':'Your idea is recorded. Sign in to your account to follow its status.';
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
  document.getElementById('sip-save-code')?.addEventListener('click',()=>{
    if(!sipTrackingCode)return;
    try{const data=JSON.parse(localStorage.getItem('sf_my_tracking_codes') || '[]');const codes=Array.isArray(data)?data.filter(x=>typeof x==='string' && /^CV-[A-F0-9]{32}$/.test(x)):[];localStorage.setItem('sf_my_tracking_codes',JSON.stringify([...new Set([...codes,sipTrackingCode])].slice(-20)));(document.getElementById('sip-code-status') as HTMLElement).textContent='Code saved on this device. Others using this browser can access it.';}catch{(document.getElementById('sip-code-status') as HTMLElement).textContent='Code could not be saved. Copy it to a safe place instead.';}
  });
  document.getElementById('sip-clear-codes')?.addEventListener('click',async()=>{
    if(!await window.sfConfirm('Remove all tracking codes saved on this device? Copy any you still need first.', {title:'Clear saved tracking codes?', confirmLabel:'Clear codes', danger:true}))return;
    try{localStorage.removeItem('sf_my_tracking_codes');(document.getElementById('sip-code-status') as HTMLElement).textContent='Saved codes cleared.';}catch{(document.getElementById('sip-code-status') as HTMLElement).textContent='Saved codes could not be cleared.';}
  });
Object.assign(window, { sfRestoreSubmissionStep, sfShowSubmissionSuccess, openSubmitPanel, closeSubmitPanel, onCategorySelected, handleTitleInput, handleDescInput, handleAnonToggle, handleConsentChange, goToStep, updateSipUI, sipNextStep, sipPrevStep, handleIdeaSubmit, copyTrackingCode, fallbackCopy });
})();
