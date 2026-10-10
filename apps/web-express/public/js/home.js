"use strict";
// Browser source extracted from views/home.eta.
(function () {
    let activeCategory = 'All';
    let activeSort = 'popular';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const campusPrompts = [
        'Extend library quiet study hours during finals week…',
        'Add water refill stations near classrooms…',
        'Improve bike racks and campus path lighting…'
    ];
    let promptTimer;
    let promptIndex = 0;
    let promptLength = 0;
    let promptDeleting = false;
    function syncPromptMotion() {
        clearTimeout(promptTimer);
        const text = document.getElementById('sf-prompt-dynamic-text');
        if (!text)
            return;
        if (reducedMotion.matches) {
            text.textContent = 'What would you like to improve on campus?';
            return;
        }
        if (document.hidden || document.querySelector('.sf-prompt-trigger:focus-within, .sf-prompt-trigger:hover'))
            return;
        promptTimer = setTimeout(typePrompt, 1800);
    }
    function typePrompt() {
        if (reducedMotion.matches || document.hidden)
            return;
        const text = document.getElementById('sf-prompt-dynamic-text');
        if (!text)
            return;
        const prompt = campusPrompts[promptIndex];
        promptLength += promptDeleting ? -1 : 1;
        text.textContent = prompt.slice(0, promptLength);
        let delay = promptDeleting ? 35 : 70;
        if (promptLength === prompt.length) {
            promptDeleting = true;
            delay = 4500;
        }
        else if (promptLength === 0) {
            promptDeleting = false;
            promptIndex = (promptIndex + 1) % campusPrompts.length;
            delay = 400;
        }
        promptTimer = setTimeout(typePrompt, delay);
    }
    function sfHandleCardMove(event, card) {
        if (reducedMotion.matches || !finePointer.matches)
            return;
        const rect = card.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        card.style.setProperty('--card-mouse-x', `${x}px`);
        card.style.setProperty('--card-mouse-y', `${y}px`);
        card.style.setProperty('--card-rotate-x', `${(0.5 - y / rect.height) * 3}deg`);
        card.style.setProperty('--card-rotate-y', `${(x / rect.width - 0.5) * 3}deg`);
    }
    function sfHandleCardLeave(card) {
        ['--card-mouse-x', '--card-mouse-y', '--card-rotate-x', '--card-rotate-y'].forEach(name => card.style.removeProperty(name));
    }
    function spawnVoteParticles(button) {
        if (reducedMotion.matches)
            return;
        const pop = document.createElement('span');
        pop.className = 'sf-vote-pop';
        pop.textContent = '+1';
        pop.setAttribute('aria-hidden', 'true');
        button.appendChild(pop);
        setTimeout(() => pop.remove(), 750);
        ['#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#6366f1'].forEach((color, index) => {
            const particle = document.createElement('span');
            particle.className = 'sf-particle';
            particle.setAttribute('aria-hidden', 'true');
            const angle = index * Math.PI * 2 / 5;
            particle.style.setProperty('--tx', `${Math.cos(angle) * 24}px`);
            particle.style.setProperty('--ty', `${Math.sin(angle) * 24}px`);
            particle.style.background = color;
            particle.style.left = '50%';
            particle.style.top = '50%';
            button.appendChild(particle);
            setTimeout(() => particle.remove(), 600);
        });
    }
    // Smooth Tab Glider
    function updateGlider() {
        const glider = document.getElementById('sf-tab-glider');
        const activeTab = document.querySelector('.sf-segmented-tab--active');
        if (glider && activeTab) {
            glider.style.width = `${activeTab.offsetWidth}px`;
            glider.style.transform = `translateX(${activeTab.offsetLeft - 4}px)`;
        }
    }
    // Init on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        loadRecentTrackingCodes();
        updateGlider();
        syncPromptMotion();
        reducedMotion.addEventListener('change', () => {
            syncPromptMotion();
            document.querySelectorAll('.sf-idea-card').forEach(sfHandleCardLeave);
        });
        document.addEventListener('visibilitychange', syncPromptMotion);
        const prompt = document.querySelector('.sf-prompt-trigger');
        ['mouseenter', 'focusin'].forEach(name => prompt?.addEventListener(name, () => clearTimeout(promptTimer)));
        ['mouseleave', 'focusout'].forEach(name => prompt?.addEventListener(name, () => setTimeout(syncPromptMotion, 0)));
        const hero = document.getElementById('top');
        hero?.addEventListener('pointermove', event => {
            if (reducedMotion.matches || !finePointer.matches)
                return;
            const rect = hero.getBoundingClientRect();
            hero.style.setProperty('--hero-mouse-x', `${event.clientX - rect.left}px`);
            hero.style.setProperty('--hero-mouse-y', `${event.clientY - rect.top}px`);
        });
        document.querySelectorAll('.sf-idea-card').forEach(card => {
            card.addEventListener('pointermove', event => sfHandleCardMove(event, card));
            card.addEventListener('pointerleave', () => sfHandleCardLeave(card));
        });
        window.addEventListener('resize', () => {
            updateGlider();
        });
    });
    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
            if (e.key === 'Escape') {
                document.activeElement.blur();
            }
            return;
        }
        if (e.key === '/') {
            e.preventDefault();
            const search = document.getElementById('home-search');
            if (search) {
                search.focus();
                search.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
    document.getElementById('sf-segmented-tabs')?.addEventListener('keydown', (event) => {
        const tabs = [document.getElementById('tab-share'), document.getElementById('tab-track')];
        const current = tabs.indexOf(document.activeElement);
        let next = current;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
            next = (current + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
            next = (current - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home')
            next = 0;
        else if (event.key === 'End')
            next = tabs.length - 1;
        else
            return;
        event.preventDefault();
        tabs[next].focus();
        sfSwitchTab(next === 0 ? 'share' : 'track');
    });
    function loadRecentTrackingCodes() {
        try {
            const stored = JSON.parse(localStorage.getItem('sf_my_tracking_codes') || '[]');
            const container = document.getElementById('sf-recent-codes-wrap');
            const list = document.getElementById('sf-recent-codes-list');
            if (stored && stored.length > 0 && container && list) {
                list.innerHTML = '';
                stored.slice(-3).reverse().forEach(code => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'sf-recent-code-pill';
                    btn.textContent = code;
                    btn.onclick = () => {
                        const input = document.getElementById('tracking-input');
                        if (input) {
                            input.value = code;
                            sfTrackInputChanged();
                            document.getElementById('track-submit-btn')?.click();
                        }
                    };
                    list.appendChild(btn);
                });
                container.hidden = false;
            }
        }
        catch (e) { }
    }
    function sfToggleSortMenu() {
        const menu = document.getElementById('home-sort-menu');
        const chevron = document.getElementById('home-sort-chevron');
        const btn = document.getElementById('home-sort-btn');
        if (!menu)
            return;
        const isHidden = menu.hidden;
        menu.hidden = !isHidden;
        btn.setAttribute('aria-expanded', String(isHidden));
        if (chevron)
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'none';
    }
    document.addEventListener('click', function (e) {
        const wrap = document.querySelector('.sf-sort-dropdown-wrap');
        if (wrap && !wrap.contains(e.target)) {
            const menu = document.getElementById('home-sort-menu');
            const chevron = document.getElementById('home-sort-chevron');
            if (menu)
                menu.hidden = true;
            if (chevron)
                chevron.style.transform = 'none';
        }
    });
    function sfSetSortOption(val, label) {
        activeSort = val;
        document.getElementById('home-sort-label').textContent = label;
        document.querySelectorAll('.sf-sort-item').forEach(opt => {
            const isThis = opt.getAttribute('data-sort') === val;
            opt.classList.toggle('sf-sort-item--active', isThis);
            let check = opt.querySelector('.sf-sort-check');
            if (isThis && !check) {
                opt.insertAdjacentHTML('beforeend', '<svg class="sf-sort-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>');
            }
            else if (!isThis && check) {
                check.remove();
            }
        });
        sfToggleSortMenu();
        sfSortGrid();
    }
    function sfSortGrid() {
        const grid = document.getElementById('ideas-grid');
        if (!grid)
            return;
        const cards = Array.from(grid.querySelectorAll('.sf-idea-card'));
        cards.sort((a, b) => {
            const vA = Number(a.getAttribute('data-votes') || 0);
            const vB = Number(b.getAttribute('data-votes') || 0);
            const dA = Number(a.getAttribute('data-date') || 0);
            const dB = Number(b.getAttribute('data-date') || 0);
            if (activeSort === 'popular')
                return vB - vA;
            if (activeSort === 'newest')
                return dB - dA;
            if (activeSort === 'oldest')
                return dA - dB;
            return 0;
        });
        cards.forEach((c, idx) => {
            c.style.animationDelay = `${idx * 25}ms`;
            c.classList.remove('sf-card-enter');
            void c.offsetWidth;
            c.classList.add('sf-card-enter');
            grid.appendChild(c);
        });
    }
    function sfSwitchTab(mode) {
        const isShare = mode === 'share';
        const tabShare = document.getElementById('tab-share');
        const tabTrack = document.getElementById('tab-track');
        const panelShare = document.getElementById('panel-share');
        const panelTrack = document.getElementById('panel-track');
        if (tabShare) {
            tabShare.setAttribute('aria-selected', String(isShare));
            tabShare.classList.toggle('sf-segmented-tab--active', isShare);
        }
        if (tabTrack) {
            tabTrack.setAttribute('aria-selected', String(!isShare));
            tabTrack.tabIndex = isShare ? -1 : 0;
            tabTrack.classList.toggle('sf-segmented-tab--active', !isShare);
        }
        if (tabShare)
            tabShare.tabIndex = isShare ? 0 : -1;
        if (panelShare)
            panelShare.hidden = !isShare;
        if (panelTrack)
            panelTrack.hidden = isShare;
        updateGlider();
    }
    function sfTrackInputChanged() {
        const input = document.getElementById('tracking-input');
        const clearBtn = document.getElementById('tracking-clear');
        const val = input ? input.value.trim() : '';
        if (clearBtn)
            clearBtn.hidden = !val;
    }
    function sfClearTrack() {
        const input = document.getElementById('tracking-input');
        if (input)
            input.value = '';
        const clearBtn = document.getElementById('tracking-clear');
        if (clearBtn)
            clearBtn.hidden = true;
        document.getElementById('track-error').hidden = true;
        document.getElementById('track-result').hidden = true;
        if (input)
            input.focus();
    }
    async function sfTrackSubmission(e) {
        e.preventDefault();
        const code = document.getElementById('tracking-input')?.value.trim();
        if (!code)
            return;
        const btn = document.getElementById('track-submit-btn');
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML = 'Looking up…';
        document.getElementById('track-error').hidden = true;
        document.getElementById('track-result').hidden = true;
        try {
            const res = await fetch(`/api/track/${encodeURIComponent(code)}`);
            const data = await res.json();
            if (!data.success || !data.data) {
                throw new Error(data.error || 'Tracking code not found');
            }
            const item = data.data;
            document.getElementById('tr-category').textContent = item.category || 'Feedback';
            const statusEl = document.getElementById('tr-status');
            statusEl.textContent = (item.status || 'pending').replace('_', ' ');
            statusEl.className = `status-badge ${(item.status || 'pending').replace('_', '-')}`;
            document.getElementById('tr-date').textContent = new Date(item.created_at).toLocaleDateString();
            document.getElementById('tr-title').textContent = item.title;
            document.getElementById('tr-desc').textContent = item.description || '';
            if (item.staff_note) {
                document.getElementById('tr-note').textContent = item.staff_note;
                document.getElementById('tr-note-wrap').hidden = false;
            }
            else {
                document.getElementById('tr-note-wrap').hidden = true;
            }
            document.getElementById('track-result').hidden = false;
        }
        catch (err) {
            document.getElementById('track-error-msg').textContent = err.message || 'Tracking code not found.';
            document.getElementById('track-error').hidden = false;
        }
        finally {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Check status';
        }
    }
    function sfSetCategory(btn, cat) {
        activeCategory = cat;
        document.querySelectorAll('#cat-chips .sf-cat-pill').forEach(b => {
            const selected = b === btn;
            b.classList.toggle('sf-cat-pill--active', selected);
            b.setAttribute('aria-pressed', String(selected));
        });
        sfFilterFeed();
    }
    function sfClearSearch() {
        const input = document.getElementById('home-search');
        if (input)
            input.value = '';
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn)
            clearBtn.hidden = true;
        const kbdHint = document.getElementById('search-kbd-hint');
        if (kbdHint)
            kbdHint.style.opacity = '1';
        sfFilterFeed();
        if (input)
            input.focus();
    }
    function sfFilterFeed() {
        const input = document.getElementById('home-search');
        const clearBtn = document.getElementById('search-clear-btn');
        const kbdHint = document.getElementById('search-kbd-hint');
        const q = (input?.value || '').toLowerCase().trim();
        if (clearBtn)
            clearBtn.hidden = !q;
        if (kbdHint)
            kbdHint.style.opacity = q ? '0' : '1';
        const cards = document.querySelectorAll('#ideas-grid .sf-idea-card');
        let visibleCount = 0;
        cards.forEach(card => {
            const cat = card.getAttribute('data-category');
            const title = card.getAttribute('data-title') || '';
            const desc = card.getAttribute('data-desc') || '';
            const matchCat = activeCategory === 'All' || cat === activeCategory;
            const matchSearch = !q || title.includes(q) || desc.includes(q);
            if (matchCat && matchSearch) {
                card.style.display = '';
                card.classList.remove('sf-card-enter');
                void card.offsetWidth;
                card.style.animationDelay = `${visibleCount * 25}ms`;
                card.classList.add('sf-card-enter');
                visibleCount++;
            }
            else {
                card.style.display = 'none';
            }
        });
        const countEl = document.getElementById('sf-visible-count');
        if (countEl)
            countEl.textContent = `${visibleCount} ${visibleCount === 1 ? 'idea' : 'ideas'} shown`;
        const emptyState = document.getElementById('sf-filter-empty');
        if (emptyState)
            emptyState.hidden = cards.length === 0 || visibleCount > 0;
    }
    function sfResetFilters() {
        activeCategory = 'All';
        document.querySelectorAll('#cat-chips .sf-cat-pill').forEach((button) => {
            const selected = button.dataset.cat === 'All';
            button.classList.toggle('sf-cat-pill--active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        const search = document.getElementById('home-search');
        if (search)
            search.value = '';
        sfFilterFeed();
        search?.focus();
    }
    async function sfVote(id, btn) {
        if (btn.classList.contains('sf-vote-btn--voted'))
            return;
        // Optimistic UI update
        btn.classList.add('sf-vote-btn--voted');
        const numSpan = btn.querySelector('.sf-vote-num');
        const prevCount = Number(numSpan?.textContent || 0);
        if (numSpan)
            numSpan.textContent = String(prevCount + 1);
        try {
            const res = await fetch(`/api/vote/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'up' })
            });
            const data = await res.json();
            if (data.success) {
                spawnVoteParticles(btn);
                if (numSpan && data.vote_count !== undefined) {
                    numSpan.textContent = data.vote_count;
                }
                if (window.sfToast)
                    sfToast('Vote recorded! Thank you for supporting this idea.', 'success');
            }
            else {
                // Revert
                btn.classList.remove('sf-vote-btn--voted');
                if (numSpan)
                    numSpan.textContent = String(prevCount);
                if (window.sfToast)
                    sfToast(data.error || 'Could not record vote.', 'error');
            }
        }
        catch (err) {
            btn.classList.remove('sf-vote-btn--voted');
            if (numSpan)
                numSpan.textContent = String(prevCount);
            if (window.sfToast)
                sfToast('Could not record vote.', 'error');
        }
    }
    Object.assign(window, { syncPromptMotion, typePrompt, sfHandleCardMove, sfHandleCardLeave, spawnVoteParticles, updateGlider, loadRecentTrackingCodes, sfToggleSortMenu, sfSetSortOption, sfSortGrid, sfSwitchTab, sfTrackInputChanged, sfClearTrack, sfTrackSubmission, sfSetCategory, sfClearSearch, sfFilterFeed, sfResetFilters, sfVote });
})();
