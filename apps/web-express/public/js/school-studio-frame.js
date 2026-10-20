"use strict";
(() => {
    const initial = JSON.parse(document.getElementById('school-studio-data')?.textContent || 'null');
    if (!initial)
        return;
    const instance = initial.instanceId, origin = location.origin;
    let outgoing = 0, incoming = 0, mode = 'edit', configuration = initial.configuration, selected = '', hovered = '', step = 1;
    let fragmentSequence = 0;
    const stylesheetLoads = new Map();
    let outline, label, hover, banner;
    let resize;
    const send = (type, payload = {}) => parent.postMessage({ protocol: 1, instanceId: instance, sequence: ++outgoing, type, payload }, origin);
    const visible = (el) => !!el.getClientRects().length;
    function mark(selector, id) { for (const element of document.querySelectorAll(selector))
        element.dataset.studioComponent = id; }
    function annotate() {
        mark('.site-header .brand', 'locked.brand');
        mark('.site-header nav,.mobile-bottom-nav,.mobile-nav', 'locked.brand');
        mark('.school-context-identity', 'school.identity');
        mark('.school-welcome-identity', 'school.identity');
        mark('.sf-hero,.school-welcome', 'home.hero');
        mark('.sf-hero-actions', 'school.identity');
        mark('.school-welcome-links,.school-welcome-help', 'home.links');
        mark('.sip-cat-grid,.topic-chips-carousel,.left-topic-list', 'community.categories');
        mark('.school-custom-questions', 'submission.instructions');
        mark('.detail-support-card,.post-actions,.comment-input-card', 'community.features');
        mark('.roadmap-summary-pills,.roadmap-board,.roadmap-column', 'progress.labels');
        for (const input of document.querySelectorAll('[data-school-question]')) {
            const label = input.closest('label');
            if (label)
                label.dataset.studioComponent = 'question:' + input.dataset.schoolQuestion;
        }
        for (const button of document.querySelectorAll('[data-feed-category],input[name="sip-category"]')) {
            const id = button.dataset.feedCategory || button.value;
            if (configuration.categories.some((c) => c.id === id))
                (button.closest('.sip-cat-card') || button).dataset.studioComponent = 'category:' + id;
        }
    }
    function makeOverlay() {
        resize?.disconnect();
        for (const node of document.querySelectorAll('.studio-frame-outline,.studio-frame-label,.studio-frame-banner'))
            node.remove();
        outline = document.createElement('div');
        outline.className = 'studio-frame-outline';
        outline.hidden = true;
        outline.setAttribute('aria-hidden', 'true');
        label = document.createElement('div');
        label.className = 'studio-frame-label';
        label.hidden = true;
        label.setAttribute('aria-hidden', 'true');
        hover = document.createElement('div');
        hover.className = 'studio-frame-outline studio-frame-hover';
        hover.hidden = true;
        hover.setAttribute('aria-hidden', 'true');
        banner = document.createElement('div');
        banner.className = 'studio-frame-banner';
        banner.textContent = 'Private preview · fictional content · no real actions';
        document.body.append(outline, label, hover, banner);
        resize = new ResizeObserver(schedule);
        resize.observe(document.body);
    }
    function target(id) { return Array.from(document.querySelectorAll('[data-studio-component]')).find(el => el.dataset.studioComponent === id && visible(el)); }
    function box(node, element) { if (mode !== 'edit' || !element) {
        node.hidden = true;
        return;
    } const r = element.getBoundingClientRect(); node.hidden = false; Object.assign(node.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
    let queued = false;
    function schedule() { if (queued)
        return; queued = true; requestAnimationFrame(() => { queued = false; const element = target(selected); box(outline, element); box(hover, target(hovered)); label.hidden = mode !== 'edit' || !element; if (element) {
        const r = element.getBoundingClientRect();
        label.textContent = selected.startsWith('question:') ? 'School question' : selected.startsWith('category:') ? 'Feedback category' : selected.replace(/\./g, ' › ');
        label.style.left = Math.max(4, r.left) + 'px';
        label.style.top = Math.max(4, r.top - 26) + 'px';
    } }); }
    function text(selector, value) { for (const el of document.querySelectorAll(selector))
        el.textContent = value; }
    function headline(value) { for (const el of document.querySelectorAll('.sf-hero-title')) {
        const accent = document.createElement('span');
        accent.className = 'sf-hero-title-accent';
        accent.textContent = value || 'one idea at a time.';
        el.replaceChildren(...(value ? [] : [document.createTextNode('Make campus better, ')]), accent);
    } }
    async function replaceFragment(payload, sequence) {
        fragmentSequence = sequence;
        const parsed = new DOMParser().parseFromString(payload.html, 'text/html');
        parsed.querySelectorAll('script').forEach(el => el.remove());
        const desired = Array.from(parsed.querySelectorAll('link[rel="stylesheet"]')).map(link => new URL(link.getAttribute('href') || '', location.origin)).filter(url => url.origin === origin && url.pathname.startsWith('/css/')).map(url => url.href);
        try {
            await Promise.all(desired.map(href => {
                const pending = stylesheetLoads.get(href);
                if (pending)
                    return pending;
                if (Array.from(document.querySelectorAll('head link[rel="stylesheet"]')).some(link => link.href === href && link.sheet))
                    return Promise.resolve();
                const loading = new Promise((resolve, reject) => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; const finish = (ok) => { clearTimeout(timeout); link.onload = link.onerror = null; if (ok)
                    resolve();
                else {
                    link.remove();
                    stylesheetLoads.delete(href);
                    reject(new Error('Preview styles unavailable.'));
                } }; const timeout = setTimeout(() => finish(false), 8000); link.onload = () => finish(true); link.onerror = () => finish(false); document.head.append(link); });
                stylesheetLoads.set(href, loading);
                return loading;
            }));
        }
        catch {
            if (sequence === fragmentSequence)
                send('render-error');
            return;
        }
        if (sequence !== fragmentSequence)
            return;
        window.sfMotion?.destroy();
        const y = scrollY, wasOpen = document.getElementById('submit-panel')?.hasAttribute('hidden') === false;
        for (const link of document.querySelectorAll('head link[rel="stylesheet"]'))
            if (!desired.includes(link.href)) {
                stylesheetLoads.delete(link.href);
                link.remove();
            }
        const latestConfiguration = configuration;
        configuration = payload.renderedConfiguration || configuration;
        document.body.className = parsed.body.className;
        document.body.style.cssText = parsed.body.style.cssText;
        document.body.replaceChildren(...Array.from(parsed.body.childNodes));
        initialize();
        if (wasOpen)
            openForm();
        patch(latestConfiguration);
        window.scrollTo(0, y);
        send('render-complete');
    }
    function patch(next) {
        if (!next?.welcome || !next?.features || !Array.isArray(next.categories))
            return;
        const old = configuration;
        configuration = next;
        for (const category of next.categories) {
            const previous = old.categories.find((c) => c.id === category.id);
            if (previous && previous.name !== category.name) {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let current;
                while (current = walker.nextNode()) {
                    if (current.parentElement?.closest('script,style,textarea,.studio-frame-label'))
                        continue;
                    if (current.textContent?.trim() === previous.name)
                        current.textContent = current.textContent.replace(previous.name, category.name);
                }
            }
        }
        if (next.displayName !== old.displayName)
            text('.school-context-identity strong,.school-welcome-identity strong', next.displayName || initial.schoolName || 'Your school');
        if (next.welcome.headline !== old.welcome.headline)
            headline(next.welcome.headline);
        if (next.welcome.intro !== old.welcome.intro)
            text('.school-welcome-intro,.sf-hero-subtitle', next.welcome.intro || 'Share a suggestion, choose whether to attach your account, and use a private tracking code to check for updates.');
        if (next.welcome.message !== old.welcome.message)
            text('.school-welcome-message', next.welcome.message);
        if (next.welcome.help !== old.welcome.help)
            text('.school-welcome-help', next.welcome.help);
        if (next.form.instructions !== old.form.instructions)
            text('.school-custom-questions > .school-form-text', next.form.instructions);
        if (next.form.example !== old.form.example)
            text('.school-custom-questions details .school-form-text', next.form.example);
        const links = Array.from(document.querySelectorAll('.school-welcome-links a,.school-welcome-links span'));
        for (const [index, link] of next.welcome.links.entries())
            if (links[index])
                links[index].textContent = link.label;
        for (const [key, value] of Object.entries(next.features))
            document.body.classList.toggle('school-' + key + '-off', !value || initial.scenario === 'disabled');
        SfSchoolColors.apply(document.body, next.palette);
        for (const p of ['navy', 'forest', 'purple', 'burgundy', 'teal', 'indigo']) {
            document.body.classList.toggle('school-palette-' + p, p === next.palette);
            for (const welcome of document.querySelectorAll('.school-welcome'))
                welcome.classList.toggle('school-palette-' + p, p === next.palette);
        }
        for (const q of next.form.questions) {
            const input = Array.from(document.querySelectorAll('[data-school-question]')).find(el => el.dataset.schoolQuestion === q.id);
            const root = input?.closest('label');
            const span = root?.querySelector('span');
            if (span)
                span.textContent = q.label + (q.required ? ' *' : '');
            const small = root?.querySelector('small');
            if (small)
                small.textContent = q.help;
        }
        for (const [status, value] of Object.entries(next.labels))
            if (value !== old.labels[status])
                for (const element of document.querySelectorAll('.workspace-status[data-status="' + status + '"],.roadmap-pill[data-status="' + status + '"] .roadmap-pill-label,.post-badge-status.status-' + status)) {
                    const dot = element.querySelector('.badge-dot');
                    if (dot) {
                        for (const child of Array.from(element.childNodes))
                            if (child.nodeType === Node.TEXT_NODE)
                                child.textContent = String(value);
                    }
                    else
                        element.textContent = String(value);
                }
        annotate();
        schedule();
    }
    function openForm() { document.getElementById('submit-panel-overlay')?.removeAttribute('hidden'); document.getElementById('submit-panel')?.removeAttribute('hidden'); document.body.style.overflow = 'hidden'; showStep(step); }
    function showStep(value) { step = Math.max(1, Math.min(3, value)); for (let i = 1; i <= 3; i++) {
        const panel = document.getElementById('sip-step-' + i) || document.getElementById('sip-step-' + i + '-content');
        if (panel)
            panel.hidden = i !== step;
        const button = document.getElementById('step-btn-' + i);
        button?.classList.toggle('sip-step-item--active', i === step);
        button?.setAttribute('aria-selected', String(i === step));
    } text('#sip-step-hint', 'Step ' + step + ' of 3'); if (step === 3) {
        text('#rev-title', document.getElementById('sip-title')?.value || 'More shaded seating near the library');
        text('#rev-desc', document.getElementById('sip-description')?.value || 'A fictional example for reviewing this school form.');
        const category = document.querySelector('input[name="sip-category"]:checked');
        text('#rev-category', configuration.categories.find((c) => c.id === category?.value)?.name || configuration.categories.find((c) => c.active)?.name || 'Campus');
    } const next = document.getElementById('sip-next-text'); if (next)
        next.textContent = step === 3 ? 'Preview only · no submission' : 'Continue'; const prev = document.getElementById('sip-prev-btn'); prev?.classList.toggle('sip-btn-back--hidden', step === 1); }
    function syncMotion() { document.documentElement.dataset.studioMode = mode; window.sfMotion?.destroy(); if (mode === 'preview')
        window.sfMotion?.mount(document); }
    function initialize() { syncMotion(); document.body.classList.toggle('studio-frame-edit', mode === 'edit'); annotate(); makeOverlay(); const queue = document.getElementById('sip-queue-btn'); if (queue) {
        queue.disabled = true;
        queue.title = 'Preview only: ideas are not stored on this device.';
    } if (initial.page === 'submit')
        openForm(); schedule(); }
    window.addEventListener('message', event => {
        const data = event.data;
        if (event.origin !== origin || event.source !== parent || data?.protocol !== 1 || data.instanceId !== instance || !Number.isSafeInteger(data.sequence) || data.sequence <= incoming || typeof data.type !== 'string')
            return;
        if (!['initialize', 'patch', 'select', 'set-mode', 'replace-fragment'].includes(data.type) || JSON.stringify(data).length > 600000)
            return;
        incoming = data.sequence;
        const payload = data.payload || {};
        if (data.type === 'initialize' || data.type === 'patch')
            patch(payload.configuration);
        if (data.type === 'select' && typeof payload.componentId === 'string' && payload.componentId.length < 120) {
            selected = payload.componentId;
            if (selected.startsWith('question:') || selected === 'submission.instructions') {
                openForm();
                showStep(2);
            }
            else if (initial.page === 'submit' && (selected.startsWith('category:') || selected === 'community.categories')) {
                openForm();
                showStep(1);
            }
            const el = target(selected);
            if (el && !visible(el))
                return;
            if (payload.scroll && el)
                el.scrollIntoView({ block: 'center', behavior: 'auto' });
            schedule();
        }
        if (data.type === 'set-mode' && ['edit', 'preview'].includes(payload.mode)) {
            mode = payload.mode;
            document.body.classList.toggle('studio-frame-edit', mode === 'edit');
            syncMotion();
            schedule();
        }
        if (data.type === 'replace-fragment' && typeof payload.html === 'string' && payload.html.length < 550000)
            void replaceFragment(payload, data.sequence);
    });
    document.addEventListener('pointerover', event => { const el = event.target.closest('[data-studio-component]'); hovered = el?.dataset.studioComponent || ''; schedule(); });
    document.addEventListener('pointerleave', () => { hovered = ''; schedule(); });
    document.addEventListener('submit', event => event.preventDefault(), true);
    document.addEventListener('click', event => {
        const element = event.target;
        const selectable = element.closest('[data-studio-component]');
        const action = element.closest('[data-sf-click]')?.dataset.sfClick;
        if (mode === 'edit') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (selectable) {
                selected = selectable.dataset.studioComponent;
                send('select', { componentId: selected });
                schedule();
            }
            return;
        }
        const route = element.closest('[data-studio-route]')?.dataset.studioRoute;
        if (route) {
            event.preventDefault();
            const local = route.replace(/^\/s\/[^/]+/, '');
            if (local.startsWith('/roadmap')) {
                const url = new URL(local, origin);
                send('navigate', { page: 'roadmap', view: url.searchParams.get('view') || 'board' });
            }
            else if (local.startsWith('/idea'))
                send('navigate', { page: 'idea' });
            else if (local.startsWith('/profile'))
                send('navigate', { page: 'profile' });
            else if (local.startsWith('/feed'))
                send('navigate', { page: 'feed' });
            else if (local === '/' || local.startsWith('/account/home'))
                send('navigate', { page: 'home' });
            else if (local.startsWith('#'))
                document.getElementById(local.slice(1))?.scrollIntoView();
            return;
        }
        if (element.closest('[data-timeline-open],[data-roadmap-id],[data-idea-id]') && !action) {
            event.preventDefault();
            send('navigate', { page: 'idea' });
            return;
        }
        if (['action-49', 'action-60'].includes(action || '') || element.closest('[data-school-submit-category]')) {
            event.preventDefault();
            openForm();
        }
        if (['action-109', 'action-110', 'action-111', 'action-129'].includes(action || '')) {
            event.preventDefault();
            document.getElementById('submit-panel')?.setAttribute('hidden', '');
            document.getElementById('submit-panel-overlay')?.setAttribute('hidden', '');
            document.body.style.overflow = '';
        }
        if (action === 'action-124') {
            event.preventDefault();
            showStep(2);
        }
        if (action === 'action-131') {
            event.preventDefault();
            showStep(step + 1);
        }
        if (action === 'action-130') {
            event.preventDefault();
            showStep(step - 1);
        }
        if (['action-112', 'action-113', 'action-114'].includes(action || '')) {
            event.preventDefault();
            showStep(Number(action.slice(-1)) - 1);
        }
        const toggle = element.closest('#header-avatar-btn');
        if (toggle) {
            event.preventDefault();
            const menu = document.getElementById('header-dropdown');
            if (menu) {
                menu.hidden = !menu.hidden;
                toggle.setAttribute('aria-expanded', String(!menu.hidden));
            }
        }
    }, true);
    document.addEventListener('beforeinput', event => { if (mode === 'edit')
        event.preventDefault(); });
    document.addEventListener('keydown', event => { const typing = event.target.matches('input,textarea,select,[contenteditable=true]'); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        send('shortcut', { command: 'save' });
    }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        send('shortcut', { command: event.shiftKey ? 'redo' : 'undo' });
    } if (event.key === 'Escape') {
        selected = '';
        send('select', { componentId: '' });
        schedule();
    } });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    initialize();
    send('ready', { revision: initial.revision });
})();
