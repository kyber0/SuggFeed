"use strict";
// Browser source extracted from views/partials/toast.eta.
(function () {
    (function () {
        window.sfToast = function (message, type = 'info', title = '') {
            const container = document.getElementById('toast-container');
            if (!container)
                return;
            const toast = document.createElement('div');
            toast.className = `sf-toast sf-toast--${type}`;
            toast.setAttribute('role', 'alert');
            let iconSvg = '';
            if (type === 'success') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            }
            else if (type === 'error') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            }
            else if (type === 'warning') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
            }
            else {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
            }
            toast.innerHTML = `
        <div class="sf-toast__progress"></div>
        <span class="sf-toast__icon">${iconSvg}</span>
        <div class="sf-toast__body">
          ${title ? `<div class="sf-toast__title">${title}</div>` : ''}
          <div class="sf-toast__message">${message}</div>
        </div>
        <button class="sf-toast__close" aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
            toast.querySelector('.sf-toast__close').addEventListener('click', () => {
                toast.remove();
            });
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        };
    })();
})();
