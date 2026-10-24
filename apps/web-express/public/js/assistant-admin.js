"use strict";
(() => {
    document.querySelectorAll('[data-sugi-admin]').forEach(root => {
        const endpoint = root.dataset.endpoint, message = root.querySelector('[data-sugi-admin-status]'), prev = root.querySelector('[data-sugi-prev]'), next = root.querySelector('[data-sugi-next]');
        let page = 1, busy = false;
        const request = async (path, body) => { const options = { headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(12000), ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }; const response = await (typeof sfSchoolFetch === 'function' ? sfSchoolFetch(path, options) : fetch(path, options)); const data = await response.json(); if (!response.ok || !data.success)
            throw new Error(data.error || 'Review data could not load.'); return data; };
        const row = (target, title, subtitle, payload, copy = false) => { const item = document.createElement('article'); item.className = 'sugi-review-row'; const heading = document.createElement('h4'); heading.textContent = title; const detail = document.createElement('p'); detail.textContent = subtitle; const button = document.createElement('button'); button.type = 'button'; button.className = 'workspace-button'; button.textContent = 'Mark reviewed'; button.addEventListener('click', async () => { button.disabled = true; try {
            await request(endpoint.replace(/\/data$/, '/review'), payload);
            await load();
        }
        catch {
            message.textContent = 'Review could not be saved. Try again.';
            button.disabled = false;
        } }); item.append(heading, detail, button); if (copy) {
            const disclosure = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('textarea');
            summary.textContent = 'Copy FAQ draft';
            const words = title.replace(/[^a-z0-9 -]/gi, '').slice(0, 120);
            text.rows = 8;
            text.readOnly = true;
            text.setAttribute('aria-label', 'Markdown FAQ draft');
            text.value = '## new-faq-id\n```json\n' + JSON.stringify({ id: 'new-faq-id', status: 'placeholder', questions: { en: words, fil: '[PLACEHOLDER]', taglish: '[PLACEHOLDER]' }, answers: { en: '[PLACEHOLDER: supply reviewed facts]', fil: '[PLACEHOLDER]', taglish: '[PLACEHOLDER]' }, keywords: words.split(' ').filter(Boolean), route: '' }, null, 2) + '\n```';
            text.addEventListener('focus', () => text.select());
            disclosure.append(summary, text);
            item.append(disclosure);
        } target.append(item); };
        const load = async () => {
            if (busy)
                return;
            busy = true;
            prev.disabled = next.disabled = true;
            message.textContent = 'Loading review data…';
            try {
                const response = await request(endpoint + '?page=' + page), data = response.data;
                const stats = root.querySelector('[data-sugi-stats]');
                stats.replaceChildren();
                const total = Number(data.stats.total) || 0;
                for (const [label, value] of [['Requests · 30 days', total], ['Cache hit rate', total ? Math.round(data.stats.cache / total * 100) + '%' : '—'], ['Fallback rate', total ? Math.round(data.stats.fallback / total * 100) + '%' : '—'], ['Rated answers', data.stats.rated]]) {
                    const card = document.createElement('div');
                    card.className = 'sugi-metric';
                    const title = document.createElement('span'), count = document.createElement('strong');
                    title.textContent = String(label);
                    count.textContent = String(value);
                    card.append(title, count);
                    stats.append(card);
                }
                const gaps = root.querySelector('[data-sugi-gaps]'), negative = root.querySelector('[data-sugi-negative]');
                gaps.replaceChildren();
                negative.replaceChildren();
                for (const gap of data.gaps)
                    row(gaps, String(gap.normalized_question), String(gap.count) + ' requests · ' + String(gap.locale), { topic: gap.normalized_question }, true);
                for (const item of data.negative)
                    row(negative, String(item.faq_id || 'No matched answer'), String(item.normalized_question) + ' · ' + String(item.version), { id: item.id });
                if (!data.gaps.length)
                    gaps.textContent = 'No unanswered topics on this page.';
                if (!data.negative.length)
                    negative.textContent = 'No negative feedback on this page.';
                const daily = root.querySelector('[data-sugi-daily]');
                daily.replaceChildren();
                for (const day of data.daily) {
                    const item = document.createElement('div');
                    item.className = 'sugi-daily-row';
                    const date = document.createElement('span'), count = document.createElement('strong');
                    date.textContent = String(day.day).slice(0, 10) + ' UTC';
                    count.textContent = String(day.count);
                    item.append(date, count);
                    daily.append(item);
                }
                if (!data.daily.length)
                    daily.textContent = 'No usage recorded in this period.';
                root.querySelector('[data-sugi-page]').textContent = 'Page ' + page;
                prev.disabled = page <= 1;
                next.disabled = data.gaps.length < 25 && data.negative.length < 25;
                message.textContent = response.collecting ? 'Review data loaded. Only safe topic keywords are stored.' : 'Usage collection is paused. Help and FAQs remain available.';
            }
            catch (error) {
                message.textContent = error instanceof Error ? error.message : 'Could not load review data.';
                prev.disabled = page <= 1;
            }
            finally {
                busy = false;
            }
        };
        root.querySelector('[data-sugi-admin-reload]')?.addEventListener('click', () => void load());
        prev.addEventListener('click', () => { if (page > 1) {
            page--;
            void load();
        } });
        next.addEventListener('click', () => { page++; void load(); });
        void load();
    });
})();
