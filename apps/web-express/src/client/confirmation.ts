(() => {
  const dialog = document.getElementById('sf-confirm-dialog') as HTMLDialogElement;
  if (!dialog) return;
  const heading = dialog.querySelector<HTMLElement>('#sf-confirm-title')!;
  const message = dialog.querySelector<HTMLElement>('#sf-confirm-message')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!;
  const accept = dialog.querySelector<HTMLButtonElement>('[data-confirm-accept]')!;
  interface Request { message: string; options: AppConfirmationOptions; resolve: (answer: boolean) => void; trigger: HTMLElement; }
  const queue: Request[] = [];
  let active: Request | null = null;
  function openNext() {
    if (active || !queue.length) return;
    active = queue.shift()!;
    heading.textContent = active.options.title || 'Confirm this change';
    message.textContent = active.message;
    accept.textContent = active.options.confirmLabel || 'Continue';
    dialog.classList.toggle('is-danger', !!active.options.danger);
    try { dialog.showModal(); cancel.focus(); }
    catch { finish(false); }
  }
  function finish(answer: boolean) {
    if (!active) return;
    const request = active; active = null;
    if (dialog.open) dialog.close();
    if (request.trigger?.isConnected) request.trigger.focus();
    request.resolve(answer);
    // Let the previous action resume before another confirmation starts.
    window.setTimeout(openNext, 0);
  }
  cancel.addEventListener('click', () => finish(false));
  accept.addEventListener('click', () => finish(true));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
  dialog.addEventListener('close', () => { if (active && !dialog.open) finish(false); });
  window.sfConfirm = (text, options = {}) => new Promise<boolean>(resolve => {
    queue.push({message: String(text), options, resolve, trigger: document.activeElement as HTMLElement});
    openNext();
  });
})();
