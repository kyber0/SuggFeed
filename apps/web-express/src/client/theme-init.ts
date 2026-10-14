(() => {
  document.documentElement.setAttribute('data-text-size',window.sfPreferences?.read('textSize') || 'compact');
  document.documentElement.dataset.staffSidebar=window.sfPreferences?.read('staffSidebar') || 'expanded';
  let theme = window.sfPreferences?.read('theme');
  if(!theme){theme='system';
  try { if (theme === 'system') { const old = localStorage.getItem('sf-theme'); if (old === 'light' || old === 'dark') theme = old; } } catch {}
  }
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
