"use strict";
(() => {
    const launcher = document.querySelector('[data-sugi-launch]'), dialog = document.querySelector('#sugi-widget');
    if (launcher && dialog) {
        let baseline = innerHeight, frame = 0;
        const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const viewport = window.visualViewport; if (!viewport || !dialog.open)
            return; dialog.style.setProperty('--sugi-viewport-height', viewport.height + 'px'); dialog.style.setProperty('--sugi-viewport-top', viewport.offsetTop + 'px'); dialog.dataset.keyboard = String(baseline - viewport.height > 120); }); };
        launcher.addEventListener('click', event => { if (typeof dialog.showModal !== 'function')
            return; event.preventDefault(); baseline = innerHeight; if (!dialog.open)
            dialog.showModal(); document.documentElement.classList.add('sugi-dialog-open'); window.visualViewport?.addEventListener('resize', resize); resize(); launcher.setAttribute('aria-expanded', 'true'); const focusTarget = matchMedia('(pointer:coarse)').matches ? dialog.querySelector('[data-sugi-close]') : dialog.querySelector('textarea'); focusTarget?.focus({ preventScroll: true }); });
        dialog.querySelector('[data-sugi-close]')?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => { if (event.target === dialog) {
            const box = dialog.getBoundingClientRect();
            const pointer = event;
            if (pointer.clientX < box.left || pointer.clientX > box.right || pointer.clientY < box.top || pointer.clientY > box.bottom)
                dialog.close();
        } });
        dialog.addEventListener('close', () => { window.visualViewport?.removeEventListener('resize', resize); cancelAnimationFrame(frame); delete dialog.dataset.keyboard; document.documentElement.classList.remove('sugi-dialog-open'); launcher.setAttribute('aria-expanded', 'false'); launcher.focus({ preventScroll: true }); });
    }
    const root = document.querySelector('[data-sugi]');
    if (!root)
        return;
    const node = document.getElementById('sugi-knowledge');
    let entries = [];
    try {
        entries = JSON.parse(node?.textContent || '{}').entries || [];
    }
    catch {
        return;
    }
    const form = root.querySelector('[data-sugi-form]'), input = form.querySelector('textarea'), send = form.querySelector('button[type=submit]'), messages = root.querySelector('[data-sugi-messages]'), status = root.querySelector('[data-sugi-status]'), counter = root.querySelector('[data-sugi-counter]');
    let controller = null;
    let generation = 0;
    const previousQuestions = [];
    const fetchHelp = (path, options) => typeof sfSchoolFetch === 'function' ? sfSchoolFetch(path, options) : fetch(path, options);
    const area = root.querySelector('.sugi-conversation-scroll');
    const compose = () => { counter.textContent = Array.from(input.value).length + ' / 300'; input.style.height = '0px'; input.style.height = Math.min(128, Math.max(44, input.scrollHeight)) + 'px'; send.disabled = !!controller || !input.value.trim(); };
    const bottom = (smooth = false) => { area.scrollTo({ top: area.scrollHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' }); };
    const notice = (text) => { root.dataset.notice = 'true'; status.textContent = text; };
    input.addEventListener('input', compose);
    compose();
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!controller && input.value.trim())
            form.requestSubmit();
    } });
    input.addEventListener('paste', event => { if (event.clipboardData?.files.length && !event.clipboardData.getData('text/plain')) {
        event.preventDefault();
        notice('Sugi supports text messages only.');
    } });
    (dialog || root).addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
    } });
    (dialog || root).addEventListener('drop', event => { if (event.dataTransfer?.files.length) {
        event.preventDefault();
        notice('Sugi supports text messages only.');
    } });
    const actionSpecs = { signin: { label: 'Sign in', path: '/schools', kind: 'signin' }, signup: { label: 'Create account', path: '/schools', kind: 'signup' }, forgot: { label: 'Reset password', path: '/schools', kind: 'forgot' }, schools: { label: 'Find your school', path: '/schools' }, share: { label: 'Share an idea', path: '/#action-hub', kind: 'share' }, track: { label: 'Track an idea', path: '/?track=1#action-hub', kind: 'track' }, ideas: { label: 'Browse ideas', path: '/feed' }, roadmap: { label: 'View roadmap', path: '/roadmap' }, profile: { label: 'My ideas', path: '/profile' }, notifications: { label: 'Notifications', path: '/notifications' }, privacy: { label: 'School notices & contacts', path: '/privacy' }, security: { label: 'Account security', path: '/account/security' }, settings: { label: 'School settings', path: '/admin/school-settings' }, invitations: { label: 'Invite members', path: '/admin/invitations' } };
    const afterChat = (action) => { if (dialog?.open) {
        dialog.addEventListener('close', action, { once: true });
        dialog.close();
    }
    else
        action(); };
    const replyButtons = (item, ids) => { if (!Array.isArray(ids))
        return; const group = document.createElement('div'); group.className = 'sugi-reply-actions'; group.setAttribute('aria-label', 'Suggested next steps'); for (const id of ids.slice(0, 2)) {
        if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(actionSpecs, id))
            continue;
        const spec = actionSpecs[id], link = document.createElement('a');
        link.className = 'sugi-reply-action';
        link.textContent = spec.label;
        link.href = typeof sfSchoolPath === 'function' ? sfSchoolPath(spec.path) : spec.path;
        if (spec.kind && spec.kind !== 'track')
            link.setAttribute('aria-haspopup', 'dialog');
        link.addEventListener('click', event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
            return; const kind = spec.kind; if ((kind === 'signin' || kind === 'signup' || kind === 'forgot') && typeof window.openAuthModal === 'function' && document.getElementById('auth-modal')) {
            event.preventDefault();
            afterChat(() => window.openAuthModal(kind));
        }
        else if (kind === 'share' && typeof openSubmitPanel === 'function' && document.getElementById('submit-panel')) {
            event.preventDefault();
            afterChat(() => openSubmitPanel());
        }
        else if (kind === 'track' && typeof sfSwitchTab === 'function' && document.getElementById('tab-track')) {
            event.preventDefault();
            afterChat(() => { sfSwitchTab('track'); document.getElementById('tracking-input')?.focus(); });
        } });
        group.append(link);
    } if (group.children.length)
        item.append(group); };
    const message = (text, question = false) => { const item = document.createElement('li'); item.className = 'sugi-message' + (question ? ' sugi-message--question' : ''); const author = document.createElement('span'); author.className = 'sugi-sr-only'; author.textContent = question ? 'You: ' : 'Sugi: '; const body = document.createElement('span'); body.className = 'sugi-message-text'; body.textContent = text; item.append(author, body); messages.append(item); return item; };
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (controller)
            return;
        const question = input.value.trim();
        if (!question)
            return;
        const run = ++generation;
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 30000);
        send.disabled = true;
        root.dataset.conversation = 'true';
        delete root.dataset.notice;
        root.dataset.sending = 'true';
        const failed = messages.querySelector('.sugi-message--failed:last-child');
        if (failed?.querySelector('.sugi-message-text')?.textContent === question)
            failed.remove();
        const asked = message(question, true);
        input.value = '';
        compose();
        const waiting = document.createElement('li');
        waiting.className = 'sugi-message sugi-typing';
        waiting.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++)
            waiting.append(document.createElement('span'));
        messages.append(waiting);
        bottom();
        status.textContent = 'Sugi is checking approved sources…';
        try {
            const response = await fetchHelp('/help/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ question, previousQuestions }), signal: controller.signal });
            const data = await response.json();
            if (run !== generation)
                return;
            if (!response.ok || data.success !== true || typeof data.answer !== 'string')
                throw new Error(data.error || 'Help is unavailable. Use the reviewed FAQs below.');
            const pinned = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
            waiting.remove();
            const item = message(data.answer);
            const source = document.createElement('small');
            source.textContent = data.generated ? 'AI answer · check the sources' : data.answered ? data.scope === 'school' ? 'Reviewed school FAQ' : 'Reviewed SuggFeed FAQ' : 'Reviewed FAQ and contact options are available below.';
            item.append(source);
            if (Array.isArray(data.sources)) {
                const citations = document.createElement('div');
                citations.className = 'sugi-citations';
                for (const citation of data.sources.slice(0, 4)) {
                    if (typeof citation.title !== 'string' || typeof citation.url !== 'string' || !/^\/help#[a-z0-9-]+$/.test(citation.url))
                        continue;
                    const link = document.createElement('a');
                    link.textContent = citation.title;
                    link.href = typeof sfSchoolPath === 'function' ? sfSchoolPath(citation.url) : citation.url;
                    citations.append(link);
                }
                item.append(citations);
            }
            replyButtons(item, data.actions);
            previousQuestions.push(question);
            if (previousQuestions.length > 2)
                previousQuestions.shift();
            if (typeof data.requestId === 'string' && typeof data.feedbackToken === 'string') {
                const group = document.createElement('div');
                group.className = 'sugi-feedback';
                for (const [rating, label] of [['up', 'Helpful'], ['down', 'Not helpful']]) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.textContent = label;
                    button.addEventListener('click', async () => { group.querySelectorAll('button').forEach(b => b.disabled = true); try {
                        const feedback = await fetchHelp('/help/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ requestId: data.requestId, token: data.feedbackToken, rating }), signal: AbortSignal.timeout(10000) });
                        if (!feedback.ok)
                            throw new Error();
                        group.replaceChildren(document.createTextNode('Thank you. Feedback goes to human review.'));
                    }
                    catch {
                        group.querySelectorAll('button').forEach(b => b.disabled = false);
                        notice('Feedback could not be saved. Try again later.');
                    } });
                    group.append(button);
                }
                item.append(group);
            }
            if (pinned)
                bottom(true);
            status.textContent = data.answered ? data.generated ? 'Answer ready. Check the supporting sources.' : 'Reviewed answer ready.' : data.fallbackReason && data.fallbackReason !== 'insufficient_sources' ? 'Natural answers are unavailable. You can still browse approved sources and FAQs.' : 'I do not have enough approved information. Try a source or contact your school.';
        }
        catch (error) {
            if (run === generation) {
                asked.classList.add('sugi-message--failed');
                const note = document.createElement('small');
                note.textContent = 'Couldn’t get a reply. Try again.';
                asked.append(note);
                if (!input.value.trim())
                    input.value = question;
                notice(error instanceof Error && error.name !== 'AbortError' ? error.message : 'The request took too long. Your question is preserved; use the FAQs or try again.');
            }
        }
        finally {
            clearTimeout(timeout);
            waiting.remove();
            if (run === generation) {
                controller = null;
                delete root.dataset.sending;
                compose();
            }
        }
    });
    root.querySelectorAll('[data-sugi-question]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.sugiQuestion || ''; input.dispatchEvent(new Event('input')); form.requestSubmit(); }));
    document.querySelector('[data-sugi-reset]')?.addEventListener('click', () => { generation++; controller?.abort(); controller = null; delete root.dataset.sending; messages.replaceChildren(); previousQuestions.length = 0; delete root.dataset.conversation; delete root.dataset.notice; input.value = ''; compose(); status.textContent = 'Conversation cleared from this page.'; input.focus(); });
    document.querySelector('[data-sugi-category]')?.addEventListener('change', event => { const category = event.target.value; document.querySelectorAll('[data-sugi-faq]').forEach(el => { el.hidden = !!category && entries.find(e => e.id === el.dataset.sugiFaq)?.category !== category; }); });
    document.querySelector('[data-sugi-language]')?.addEventListener('change', event => { const language = event.target.value; document.querySelectorAll('[data-sugi-faq]').forEach(detail => { const entry = entries.find(e => e.id === detail.dataset.sugiFaq); if (entry) {
        detail.querySelector('[data-sugi-faq-question]').textContent = entry.questions[language] || entry.questions.en;
        detail.querySelector('p').textContent = entry.answers[language] || entry.answers.en;
    } }); });
    const openSource = () => { const id = location.hash.slice(1); if (!/^[a-z0-9-]+$/.test(id))
        return; const target = document.getElementById(id); if (target instanceof HTMLDetailsElement)
        target.open = true; };
    openSource();
    window.addEventListener('hashchange', openSource);
    window.addEventListener('offline', () => { notice('You are offline. Reviewed FAQs on the full Help page remain available.'); });
    window.addEventListener('pagehide', () => { generation++; controller?.abort(); controller = null; delete root.dataset.sending; messages.querySelector('.sugi-typing')?.remove(); compose(); });
})();
