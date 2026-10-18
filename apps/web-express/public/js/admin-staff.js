"use strict";
(() => {
    const rosterScript = document.getElementById('staff-roster-data');
    const userScript = document.getElementById('staff-current-user');
    let members = [];
    try {
        members = JSON.parse(rosterScript?.textContent || '[]');
    }
    catch {
        members = [];
    }
    let currentUser = { id: '', role: '' };
    try {
        currentUser = JSON.parse(userScript?.textContent || '{}');
    }
    catch {
        currentUser = { id: '', role: '' };
    }
    const searchInput = document.getElementById('staff-search-input');
    const filterPills = document.getElementById('staff-role-filter-pills');
    const rosterList = document.getElementById('staff-roster-list');
    const refreshBtn = document.getElementById('staff-refresh-btn');
    const revokeDialog = document.getElementById('staff-revoke-dialog');
    const revokeMsg = document.getElementById('revoke-dialog-message');
    const revokeConfirmBtn = document.getElementById('btn-revoke-confirm');
    const revokeCancelBtn = document.getElementById('btn-revoke-cancel');
    const revokeCancelX = document.getElementById('btn-revoke-cancel-x');
    const studentSearchForm = document.getElementById('student-search-form');
    const studentSearchInput = document.getElementById('student-search-input');
    const studentResultsList = document.getElementById('student-results-list');
    let activeFilter = 'all';
    let searchRequest = null;
    let memberPendingRevoke = null;
    function icon(name) {
        return `<svg class="workspace-svg" aria-hidden="true"><use href="#ws-${name}"></use></svg>`;
    }
    function renderRoster() {
        if (!rosterList)
            return;
        const q = (searchInput?.value || '').trim().toLowerCase();
        const filtered = members.filter(m => {
            if (activeFilter !== 'all' && m.role !== activeFilter)
                return false;
            if (q) {
                const name = (m.display_name || '').toLowerCase();
                const email = (m.email || '').toLowerCase();
                if (!name.includes(q) && !email.includes(q))
                    return false;
            }
            return true;
        });
        const totalEl = document.getElementById('kpi-total-staff');
        const adminEl = document.getElementById('kpi-admin-count');
        const modEl = document.getElementById('kpi-mod-count');
        const countTag = document.getElementById('staff-roster-count');
        if (totalEl)
            totalEl.textContent = String(members.length);
        if (adminEl)
            adminEl.textContent = String(members.filter(m => m.role === 'admin').length);
        if (modEl)
            modEl.textContent = String(members.filter(m => m.role === 'moderator').length);
        if (countTag)
            countTag.textContent = `${members.length} members`;
        if (!filtered.length) {
            const filtering = !!q || activeFilter !== 'all';
            rosterList.replaceChildren(sfEmptyState({ icon: filtering ? 'search' : 'users', heading: filtering ? 'No matching staff' : 'Build your school’s team', description: filtering ? 'Try a different name, email, or role filter.' : 'Invite an administrator or moderator to help manage ideas. They appear here after accepting.', href: filtering ? '/admin/staff' : '/admin/invitations', label: filtering ? 'Clear staff filters' : 'Manage invitations' }));
            return;
        }
        rosterList.innerHTML = filtered.map(member => {
            const isSelf = member.id === currentUser.id;
            const initial = (member.display_name || member.email || 'S').slice(0, 1).toUpperCase();
            const isAdmin = member.role === 'admin';
            return `
        <article class="staff-member-card" data-id="${sfEscapeAttribute(member.id)}" data-role="${sfEscapeAttribute(member.role)}">
          <div class="staff-member-avatar staff-member-avatar--${sfEscapeAttribute(member.role)}" aria-hidden="true">${sfEscapeAttribute(initial)}</div>
          <div class="staff-member-info">
            <div class="staff-member-name-row">
              <h3 class="staff-member-name">${sfEscapeAttribute(member.display_name || member.email?.split('@')[0] || 'Staff Member')}</h3>
              ${isSelf ? '<span class="staff-you-badge">You</span>' : ''}
            </div>
            <div class="staff-member-meta">
              <span class="staff-role-badge staff-role-badge--${sfEscapeAttribute(member.role)}">
                ${icon(isAdmin ? 'crown' : 'shield')}
                <span>${isAdmin ? 'Administrator' : 'Moderator'}</span>
              </span>
              ${member.email ? `<span class="staff-member-email">${icon('mail')} ${sfEscapeAttribute(member.email)}</span>` : ''}
            </div>
          </div>
          <div class="staff-member-actions">
            ${!isAdmin ? `
              <button type="button" class="workspace-button staff-action-btn" data-action="make-admin" data-id="${sfEscapeAttribute(member.id)}" data-name="${sfEscapeAttribute(member.display_name || 'Staff member')}">
                ${icon('crown')} Make Admin
              </button>
            ` : `
              <button type="button" class="workspace-button staff-action-btn" data-action="demote-mod" data-id="${sfEscapeAttribute(member.id)}" data-name="${sfEscapeAttribute(member.display_name || 'Staff member')}" ${isSelf ? 'disabled title="You cannot demote yourself"' : ''}>
                ${icon('shield')} Demote
              </button>
            `}
            <button type="button" class="workspace-button workspace-button--danger staff-action-btn" data-action="revoke-access" data-id="${sfEscapeAttribute(member.id)}" data-name="${sfEscapeAttribute(member.display_name || 'Staff member')}" ${isSelf ? 'disabled title="You cannot revoke your own access"' : ''} aria-label="Revoke staff access">
              Revoke
            </button>
          </div>
        </article>
      `;
        }).join('');
    }
    async function updateRole(memberId, newRole) {
        try {
            const res = await sfSchoolFetch(`/api/staff/members/${encodeURIComponent(memberId)}/role`, {
                signal: AbortSignal.timeout(15000),
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                window.sfToast?.(data.error || 'Failed to update staff role.', 'error');
                return false;
            }
            const refreshed = await refreshRoster();
            if (!refreshed)
                window.sfToast?.('Role saved, but the roster could not refresh. Use Refresh before making another change.', 'warning');
            return true;
        }
        catch (e) {
            window.sfToast?.(e?.message || 'Network error updating role.', 'error');
            return false;
        }
    }
    async function refreshRoster() {
        rosterList?.setAttribute('aria-busy', 'true');
        try {
            const res = await sfSchoolFetch('/api/staff/members', { signal: AbortSignal.timeout(15000) });
            const data = await res.json();
            if (!res.ok || !data.success || !Array.isArray(data.members))
                throw new Error('The staff list could not refresh. Your current list is still shown. Try Refresh again.');
            members = data.members;
            renderRoster();
            return true;
        }
        catch {
            window.sfToast?.('The staff list could not refresh. Your current list is still shown. Try Refresh again.', 'error');
            return false;
        }
        finally {
            rosterList?.removeAttribute('aria-busy');
        }
    }
    searchInput?.addEventListener('input', () => renderRoster());
    filterPills?.addEventListener('click', (e) => {
        const pill = e.target.closest('[data-filter]');
        if (!pill)
            return;
        filterPills.querySelectorAll('[data-filter]').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
        pill.classList.add('is-active');
        pill.setAttribute('aria-pressed', 'true');
        activeFilter = pill.dataset.filter || 'all';
        renderRoster();
    });
    refreshBtn?.addEventListener('click', async () => {
        refreshBtn.setAttribute('disabled', 'true');
        await refreshRoster();
        refreshBtn.removeAttribute('disabled');
    });
    rosterList?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled)
            return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const name = btn.dataset.name || 'this member';
        if (!id)
            return;
        if (action === 'make-admin') {
            btn.disabled = true;
            if (!await window.sfConfirm('Give ' + name + ' administrator access to school settings, invitations, and staff management?', { title: 'Grant administrator access', confirmLabel: 'Grant administrator access' })) {
                btn.disabled = false;
                return;
            }
            if (!await updateRole(id, 'admin'))
                btn.disabled = false;
        }
        else if (action === 'demote-mod') {
            btn.disabled = true;
            if (!await window.sfConfirm('Change ' + name + ' to moderator? They will lose administrator controls.', { title: 'Change school access', confirmLabel: 'Change to moderator', danger: true })) {
                btn.disabled = false;
                return;
            }
            if (!await updateRole(id, 'moderator'))
                btn.disabled = false;
        }
        else if (action === 'revoke-access') {
            memberPendingRevoke = { id, name };
            if (revokeMsg)
                revokeMsg.textContent = `Revoke staff credentials for ${name}? Their account will revert to a student role.`;
            if (revokeDialog)
                revokeDialog.showModal();
        }
    });
    revokeCancelBtn?.addEventListener('click', () => {
        memberPendingRevoke = null;
        revokeDialog?.close();
    });
    revokeCancelX?.addEventListener('click', () => {
        memberPendingRevoke = null;
        revokeDialog?.close();
    });
    revokeConfirmBtn?.addEventListener('click', async () => {
        if (!memberPendingRevoke)
            return;
        revokeConfirmBtn.setAttribute('disabled', 'true');
        const ok = await updateRole(memberPendingRevoke.id, 'student');
        revokeConfirmBtn.removeAttribute('disabled');
        if (ok) {
            memberPendingRevoke = null;
            revokeDialog?.close();
        }
    });
    studentSearchForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = (studentSearchInput?.value || '').trim();
        if (!studentResultsList)
            return;
        searchRequest?.abort();
        const controller = new AbortController();
        searchRequest = controller;
        studentResultsList.setAttribute('aria-busy', 'true');
        studentResultsList.textContent = 'Searching student accounts…';
        try {
            const res = await sfSchoolFetch(`/api/staff/students?search=${encodeURIComponent(query)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
            const data = await res.json();
            if (searchRequest !== controller)
                return;
            if (!res.ok || !data.success || !Array.isArray(data.students)) {
                studentResultsList.innerHTML = '<div class="staff-empty-hint">Search failed. Please try again.</div>';
                return;
            }
            if (searchRequest !== controller)
                return;
            const students = data.students;
            if (!students.length) {
                studentResultsList.replaceChildren(sfEmptyState({ compact: true, icon: 'search', heading: 'No matching students', description: 'No students found matching “' + query + '”. Try another name or email address.' }));
                return;
            }
            studentResultsList.innerHTML = students.map(s => {
                const initial = (s.display_name || s.email || 'S').slice(0, 1).toUpperCase();
                return `
          <div class="student-result-card" data-id="${sfEscapeAttribute(s.id)}">
            <div class="student-avatar" aria-hidden="true">${sfEscapeAttribute(initial)}</div>
            <div class="student-info">
              <strong>${sfEscapeAttribute(s.display_name || s.email?.split('@')[0] || 'Student')}</strong>
              <small>${sfEscapeAttribute(s.email || 'No email')}</small>
            </div>
            <div class="student-actions">
              <button type="button" class="workspace-button staff-promote-btn" data-promote-role="moderator" data-user-id="${sfEscapeAttribute(s.id)}" data-name="${sfEscapeAttribute(s.display_name || 'Student')}">+ Mod</button>
              <button type="button" class="workspace-button staff-promote-btn" data-promote-role="admin" data-user-id="${sfEscapeAttribute(s.id)}" data-name="${sfEscapeAttribute(s.display_name || 'Student')}">+ Admin</button>
            </div>
          </div>
        `;
            }).join('');
        }
        catch {
            if (searchRequest === controller)
                studentResultsList.textContent = 'Student search could not finish. Submit the search again to retry.';
        }
        finally {
            if (searchRequest === controller)
                studentResultsList.removeAttribute('aria-busy');
        }
    });
    studentResultsList?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-promote-role]');
        if (!btn || btn.disabled)
            return;
        const role = btn.dataset.promoteRole;
        const id = btn.dataset.userId;
        const name = btn.dataset.name || 'Student';
        if (!id || !role)
            return;
        btn.disabled = true;
        const allowed = await window.sfConfirm('Give ' + name + ' ' + (role === 'admin' ? 'administrator access, including school settings and member management' : 'moderator access to review and update school ideas') + '?', { title: 'Change school access', confirmLabel: 'Grant access' });
        if (!allowed) {
            btn.disabled = false;
            return;
        }
        const ok = await updateRole(id, role);
        if (ok) {
            const card = btn.closest('.student-result-card');
            card?.remove();
            if (!studentResultsList.querySelector('.student-result-card'))
                studentResultsList.replaceChildren(sfEmptyState({ compact: true, icon: 'check', heading: 'Search results updated', description: 'The selected member is now on the staff list. Search again to find another student.' }));
        }
        else {
            btn.disabled = false;
        }
    });
    renderRoster();
})();
