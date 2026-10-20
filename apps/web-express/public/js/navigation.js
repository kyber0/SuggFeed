"use strict";
(() => {
    function updateSectionNavigation() {
        let target = null;
        try {
            target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        }
        catch { /* Invalid fragments do not change navigation. */ }
        if (target instanceof HTMLDetailsElement)
            target.open = true;
        for (const nav of document.querySelectorAll('[data-section-navigation]')) {
            const links = [...nav.querySelectorAll('a[href^="#"]')];
            const active = links.find(link => {
                const section = document.getElementById(link.hash.slice(1));
                return section && target && (section === target || section.contains(target));
            }) || links[0];
            for (const link of links) {
                link.classList.toggle('is-current', link === active);
                if (link === active)
                    link.setAttribute('aria-current', 'location');
                else
                    link.removeAttribute('aria-current');
            }
        }
    }
    updateSectionNavigation();
    window.addEventListener('hashchange', updateSectionNavigation);
    const shell = document.getElementById('navigation-skeleton');
    const content = document.getElementById('page-content');
    const title = document.getElementById('navigation-title');
    const status = document.getElementById('navigation-status');
    const cancel = document.getElementById('navigation-cancel');
    const body = document.getElementById('navigation-skeleton-body');
    if (!shell || !content || !title || !status || !body)
        return;
    let timer;
    let wasInert = content.inert;
    function reset() { clearTimeout(timer); shell.hidden = true; content.inert = wasInert; content.removeAttribute('aria-busy'); document.documentElement.classList.remove('is-navigating'); }
    function destinationScreen(destination) {
        const path = sfSchoolRoute(destination.pathname).replace(/\/+$/, '') || '/';
        if (path === '/')
            return ['home', 'SuggFeed'];
        if (path === '/feed')
            return ['feed', 'Community ideas'];
        if (path === '/roadmap') {
            const view = destination.searchParams.get('view') || 'board';
            const views = { board: 'Roadmap board', timeline: 'Work timeline', tree: 'Roadmap categories', done: 'Completed ideas' };
            return ['roadmap-' + (views[view] ? view : 'board'), views[view] || views.board];
        }
        if (path.startsWith('/roadmap/idea/') || path.startsWith('/idea/'))
            return ['idea', 'Idea details'];
        if (path.startsWith('/platform/'))
            return ['document', 'Platform administration'];
        if (path === '/schools' || path === '/account/home')
            return ['document', 'Your workspace'];
        if (path === '/admin/school-settings')
            return ['document', 'School settings'];
        if (path === '/profile')
            return ['profile', 'Your profile'];
        if (path === '/notifications')
            return ['updates', 'School updates'];
        if (path === '/inbox')
            return ['inbox', 'School messages'];
        if (path === '/admin/community') {
            const section = destination.searchParams.get('section') || (destination.searchParams.has('idea') ? 'clarifications' : 'reports');
            const sections = { reports: 'Community reports', clarifications: 'Private clarifications', attention: 'Ideas needing attention' };
            return ['staff-' + (sections[section] ? section : 'reports'), sections[section] || sections.reports];
        }
        if (path === '/staff-login')
            return ['login', 'Staff sign in'];
        if (path === '/admin' || path.startsWith('/admin/')) {
            if (!document.getElementById('sf-auth-config')?.dataset.user)
                return ['login', 'Staff sign in'];
            const view = path === '/admin' ? destination.searchParams.get('view') : path.split('/')[2];
            if (view === 'analytics')
                return ['staff-analytics', 'School analytics'];
            if (view === 'staff')
                return ['staff-members', 'Manage staff'];
            if (view === 'board')
                return ['staff-board', 'Manage work'];
            if (view === 'login')
                return ['login', 'Staff sign in'];
            return ['staff-queue', 'Review submissions'];
        }
        if (path.startsWith('/digest/'))
            return ['digest', 'Email preferences'];
        if (path === '/privacy')
            return ['document', 'Privacy policy'];
        if (path === '/terms')
            return ['document', 'Terms of use'];
        return ['document', 'Loading page'];
    }
    function canLoad(destination) {
        return destination.origin === location.origin && destination.protocol === location.protocol
            && !/^\/(api|auth|staff\/workspace)(\/|$)/.test(sfSchoolRoute(destination.pathname));
    }
    function show(destination) {
        const top = Math.max(0, document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0);
        const [layout, section] = destinationScreen(destination);
        const template = document.getElementById('navigation-template-' + layout);
        if (!(template instanceof HTMLTemplateElement))
            return;
        body.replaceChildren(template.content.cloneNode(true));
        const menu = document.getElementById('header-dropdown');
        if (menu)
            menu.hidden = true;
        document.getElementById('header-avatar-btn')?.setAttribute('aria-expanded', 'false');
        shell.dataset.section = section;
        shell.dataset.layout = layout;
        title.textContent = section;
        status.textContent = 'Loading ' + section.toLowerCase() + '…';
        if (shell.hidden)
            wasInert = content.inert;
        shell.style.top = top + 'px';
        shell.scrollTop = 0;
        shell.hidden = false;
        content.inert = true;
        content.setAttribute('aria-busy', 'true');
        document.documentElement.classList.add('is-navigating');
        clearTimeout(timer);
        timer = window.setTimeout(() => status.textContent = 'Still loading. You can cancel to stay on this page.', 8000);
    }
    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.closest('[data-no-navigation-loader]'))
            return;
        const destination = new URL(link.href, location.href);
        if (!canLoad(destination))
            return;
        if (destination.pathname === location.pathname && destination.search === location.search)
            return;
        // Keep ordinary browser navigation: start it in this click, with no fetch or
        // artificial wait. Only the old document's pending visual state changes.
        queueMicrotask(() => { if (!event.defaultPrevented)
            show(destination); });
    });
    document.addEventListener('submit', event => {
        if (event.defaultPrevented)
            return;
        const form = event.target;
        const submitter = event.submitter;
        const button = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null;
        if ((button?.formMethod || form.method).toLowerCase() !== 'get' || ((button?.formTarget || form.target) && (button?.formTarget || form.target) !== '_self'))
            return;
        const destination = new URL(button?.hasAttribute('formaction') ? button.formAction : form.action, location.href);
        destination.search = '';
        for (const [key, value] of new FormData(form).entries())
            if (typeof value === 'string')
                destination.searchParams.append(key, value);
        if (button?.name)
            destination.searchParams.append(button.name, button.value);
        if (canLoad(destination))
            queueMicrotask(() => { if (!event.defaultPrevented)
                show(destination); });
    });
    cancel?.addEventListener('click', () => { window.stop(); reset(); });
    window.addEventListener('pageshow', event => { if (event.persisted)
        reset(); });
    window.addEventListener('pagehide', reset);
    // Preserve the editor if the browser's unsaved-work warning cancels leaving.
    window.addEventListener('beforeunload', event => { queueMicrotask(() => { if (event.defaultPrevented)
        reset(); }); });
})();
