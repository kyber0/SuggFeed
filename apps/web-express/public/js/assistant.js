"use strict";
(() => {
    const launcher = document.querySelector('[data-sugi-launch]'), dialog = document.querySelector('#sugi-widget');
    if (launcher && dialog) {
        let baseline = innerHeight, frame = 0;
        const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const viewport = window.visualViewport; if (!viewport || !dialog.open)
            return; dialog.style.setProperty('--sugi-viewport-height', viewport.height + 'px'); dialog.style.setProperty('--sugi-viewport-top', viewport.offsetTop + 'px'); dialog.dataset.keyboard = String(baseline - viewport.height > 120); }); };
        launcher.addEventListener('click', event => { if (typeof dialog.showModal !== 'function')
            return; event.preventDefault(); baseline = innerHeight; if (!dialog.open)
            dialog.showModal(); window.visualViewport?.addEventListener('resize', resize); resize(); launcher.setAttribute('aria-expanded', 'true'); dialog.querySelector('textarea')?.focus({ preventScroll: true }); });
        dialog.querySelector('[data-sugi-close]')?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => { if (event.target === dialog) {
            const box = dialog.getBoundingClientRect();
            const pointer = event;
            if (pointer.clientX < box.left || pointer.clientX > box.right || pointer.clientY < box.top || pointer.clientY > box.bottom)
                dialog.close();
        } });
        dialog.addEventListener('close', () => { window.visualViewport?.removeEventListener('resize', resize); cancelAnimationFrame(frame); delete dialog.dataset.keyboard; launcher.setAttribute('aria-expanded', 'false'); launcher.focus({ preventScroll: true }); });
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
    send.disabled = false;
    let controller = null;
    let generation = 0;
    const fetchHelp = (path, options) => typeof sfSchoolFetch === 'function' ? sfSchoolFetch(path, options) : fetch(path, options);
    input.addEventListener('input', () => { counter.textContent = Array.from(input.value).length + ' / 300'; });
    const message = (text, question = false) => { const item = document.createElement('li'); item.className = 'sugi-message' + (question ? ' sugi-message--question' : ''); item.textContent = text; messages.append(item); return item; };
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (controller)
            return;
        const question = input.value.trim();
        if (!question)
            return;
        const run = ++generation;
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 15000);
        send.disabled = true;
        root.dataset.conversation = 'true';
        message(question, true);
        status.textContent = 'Sugi is checking reviewed FAQs…';
        try {
            const response = await fetchHelp('/help/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ question }), signal: controller.signal });
            const data = await response.json();
            if (run !== generation)
                return;
            if (!response.ok || data.success !== true || typeof data.answer !== 'string')
                throw new Error(data.error || 'Help is unavailable. Use the reviewed FAQs below.');
            const item = message(data.answer);
            const source = document.createElement('small');
            source.textContent = data.answered ? data.scope === 'school' ? 'Reviewed school FAQ' : 'Reviewed SuggFeed FAQ' : 'Reviewed FAQ and contact options are available below.';
            item.append(source);
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
                        status.textContent = 'Feedback could not be saved. Try again later.';
                    } });
                    group.append(button);
                }
                item.append(group);
            }
            const area = root.querySelector('.sugi-conversation-scroll');
            if (dialog?.open && area)
                area.scrollTop += item.getBoundingClientRect().top - area.getBoundingClientRect().top;
            input.value = '';
            counter.textContent = '0 / 300';
            status.textContent = data.answered ? 'Reviewed answer ready.' : 'I could not confidently match that question. Try a FAQ or contact your school.';
        }
        catch (error) {
            if (run === generation)
                status.textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'The request took too long. Your question is preserved; use the FAQs or try again.';
        }
        finally {
            clearTimeout(timeout);
            if (run === generation) {
                controller = null;
                send.disabled = false;
            }
        }
    });
    root.querySelectorAll('[data-sugi-question]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.sugiQuestion || ''; input.dispatchEvent(new Event('input')); form.requestSubmit(); }));
    document.querySelector('[data-sugi-reset]')?.addEventListener('click', () => { generation++; controller?.abort(); controller = null; send.disabled = false; messages.replaceChildren(); delete root.dataset.conversation; input.value = ''; counter.textContent = '0 / 300'; status.textContent = 'Conversation cleared from this page.'; input.focus(); });
    document.querySelector('[data-sugi-category]')?.addEventListener('change', event => { const category = event.target.value; document.querySelectorAll('[data-sugi-faq]').forEach(el => { el.hidden = !!category && entries.find(e => e.id === el.dataset.sugiFaq)?.category !== category; }); });
    document.querySelector('[data-sugi-language]')?.addEventListener('change', event => { const language = event.target.value; document.querySelectorAll('[data-sugi-faq]').forEach(detail => { const entry = entries.find(e => e.id === detail.dataset.sugiFaq); if (entry) {
        detail.querySelector('[data-sugi-faq-question]').textContent = entry.questions[language] || entry.questions.en;
        detail.querySelector('p').textContent = entry.answers[language] || entry.answers.en;
    } }); });
    window.addEventListener('offline', () => { status.textContent = 'You are offline. Reviewed FAQs on this page remain available.'; });
    window.addEventListener('pagehide', () => { generation++; controller?.abort(); controller = null; send.disabled = false; });
})();
