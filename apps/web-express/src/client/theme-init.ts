(() => {
  let theme = (window as any).sfPreferences?.read('theme');
  if(!theme){theme='system';
  try { if (theme === 'system') { const old = localStorage.getItem('sf-theme'); if (['light','dark'].includes(old)) theme = old; } } catch {}
  }
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
