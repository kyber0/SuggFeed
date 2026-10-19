"use strict";
(() => {
    const select = document.getElementById('school-preview-width'), theme = document.getElementById('school-preview-theme'), frame = document.getElementById('school-preview-frame');
    if (select && frame)
        select.addEventListener('change', () => { frame.style.width = select.value + 'px'; });
    if (theme && frame)
        theme.addEventListener('change', () => { const url = new URL(frame.src); url.searchParams.set('theme', theme.value); frame.src = url.href; });
})();
