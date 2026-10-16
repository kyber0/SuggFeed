(() => {
  interface StaffMember {
    id: string;
    display_name?: string;
    email?: string;
    role: string;
    created_at?: string;
  }
  interface StudentMember {
    id: string;
    display_name?: string;
    email?: string;
    created_at?: string;
  }

  const rosterScript = document.getElementById('staff-roster-data');
  const userScript = document.getElementById('staff-current-user');

  let members: StaffMember[] = [];
  try {
    members = JSON.parse(rosterScript?.textContent || '[]');
  } catch {
    members = [];
  }

  let currentUser = { id: '', role: '' };
  try {
    currentUser = JSON.parse(userScript?.textContent || '{}');
  } catch {
    currentUser = { id: '', role: '' };
  }

  const searchInput = document.getElementById('staff-search-input') as HTMLInputElement | null;
  const filterPills = document.getElementById('staff-role-filter-pills');
  const rosterList = document.getElementById('staff-roster-list');
  const refreshBtn = document.getElementById('staff-refresh-btn');
  const revokeDialog = document.getElementById('staff-revoke-dialog') as HTMLDialogElement | null;
  const revokeMsg = document.getElementById('revoke-dialog-message');
  const revokeConfirmBtn = document.getElementById('btn-revoke-confirm');
  const revokeCancelBtn = document.getElementById('btn-revoke-cancel');
  const revokeCancelX = document.getElementById('btn-revoke-cancel-x');

  const studentSearchForm = document.getElementById('student-search-form');
  const studentSearchInput = document.getElementById('student-search-input') as HTMLInputElement | null;
  const studentResultsList = document.getElementById('student-results-list');

  const inviteForm = document.getElementById('staff-invite-form');
  const inviteEmailInput = document.getElementById('invite-email-input') as HTMLInputElement | null;
  const inviteStatus = document.getElementById('staff-invite-status');
  const inviteOutput = document.getElementById('staff-invite-output');
  const inviteUrlInput = document.getElementById('staff-invite-url') as HTMLInputElement | null;
  const copyInviteBtn = document.getElementById('btn-copy-invite-url');

  let activeFilter = 'all';
  let memberPendingRevoke: { id: string; name: string } | null = null;

  function icon(name: string) {
    return `<svg class="workspace-svg" aria-hidden="true"><use href="#ws-${name}"></use></svg>`;
  }

  function renderRoster() {
    if (!rosterList) return;
    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = members.filter(m => {
      if (activeFilter !== 'all' && m.role !== activeFilter) return false;
      if (q) {
        const name = (m.display_name || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });

    const totalEl = document.getElementById('kpi-total-staff');
    const adminEl = document.getElementById('kpi-admin-count');
    const modEl = document.getElementById('kpi-mod-count');
    const countTag = document.getElementById('staff-roster-count');

    if (totalEl) totalEl.textContent = String(members.length);
    if (adminEl) adminEl.textContent = String(members.filter(m => m.role === 'admin').length);
    if (modEl) modEl.textContent = String(members.filter(m => m.role === 'moderator').length);
    if (countTag) countTag.textContent = `${members.length} members`;

    if (!filtered.length) {
      rosterList.innerHTML = '<div class="workspace-empty"><p>No staff members match your filter.</p></div>';
      return;
    }

    rosterList.innerHTML = filtered.map(member => {
      const isSelf = member.id === currentUser.id;
      const initial = (member.display_name || member.email || 'S').slice(0, 1).toUpperCase();
      const isAdmin = member.role === 'admin';
      return `
        <article class="staff-member-card" data-id="${member.id}" data-role="${member.role}">
          <div class="staff-member-avatar staff-member-avatar--${member.role}" aria-hidden="true">${initial}</div>
          <div class="staff-member-info">
            <div class="staff-member-name-row">
              <h3 class="staff-member-name">${member.display_name || member.email?.split('@')[0] || 'Staff Member'}</h3>
              ${isSelf ? '<span class="staff-you-badge">You</span>' : ''}
            </div>
            <div class="staff-member-meta">
              <span class="staff-role-badge staff-role-badge--${member.role}">
                ${icon(isAdmin ? 'crown' : 'shield')}
                <span>${isAdmin ? 'Administrator' : 'Moderator'}</span>
              </span>
              ${member.email ? `<span class="staff-member-email">${icon('mail')} ${member.email}</span>` : ''}
            </div>
          </div>
          <div class="staff-member-actions">
            ${!isAdmin ? `
              <button type="button" class="workspace-button staff-action-btn" data-action="make-admin" data-id="${member.id}" data-name="${member.display_name || 'Staff member'}">
                ${icon('crown')} Make Admin
              </button>
            ` : `
              <button type="button" class="workspace-button staff-action-btn" data-action="demote-mod" data-id="${member.id}" data-name="${member.display_name || 'Staff member'}" ${isSelf ? 'disabled title="You cannot demote yourself"' : ''}>
                ${icon('shield')} Demote
              </button>
            `}
            <button type="button" class="workspace-button workspace-button--danger staff-action-btn" data-action="revoke-access" data-id="${member.id}" data-name="${member.display_name || 'Staff member'}" ${isSelf ? 'disabled title="You cannot revoke your own access"' : ''} aria-label="Revoke staff access">
              Revoke
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  async function updateRole(memberId: string, newRole: 'admin' | 'moderator' | 'student') {
    try {
      const res = await sfSchoolFetch(`/api/staff/members/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        window.sfToast?.(data.error || 'Failed to update staff role.', 'error');
        return false;
      }
      await refreshRoster();
      return true;
    } catch (e: any) {
      window.sfToast?.(e?.message || 'Network error updating role.', 'error');
      return false;
    }
  }

  async function refreshRoster() {
    try {
      const res = await sfSchoolFetch('/api/staff/members');
      const data = await res.json();
      if (data.success && Array.isArray(data.members)) {
        members = data.members;
        renderRoster();
      }
    } catch {
      // ignore
    }
  }

  searchInput?.addEventListener('input', () => renderRoster());

  filterPills?.addEventListener('click', (e) => {
    const pill = (e.target as Element).closest<HTMLButtonElement>('[data-filter]');
    if (!pill) return;
    filterPills.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('is-active'));
    pill.classList.add('is-active');
    activeFilter = pill.dataset.filter || 'all';
    renderRoster();
  });

  refreshBtn?.addEventListener('click', async () => {
    refreshBtn.setAttribute('disabled', 'true');
    await refreshRoster();
    refreshBtn.removeAttribute('disabled');
  });

  rosterList?.addEventListener('click', async (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const name = btn.dataset.name || 'this member';
    if (!id) return;

    if (action === 'make-admin') {
      btn.disabled = true;
      await updateRole(id, 'admin');
    } else if (action === 'demote-mod') {
      btn.disabled = true;
      await updateRole(id, 'moderator');
    } else if (action === 'revoke-access') {
      memberPendingRevoke = { id, name };
      if (revokeMsg) revokeMsg.textContent = `Revoke staff credentials for ${name}? Their account will revert to a student role.`;
      if (revokeDialog) revokeDialog.showModal();
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
    if (!memberPendingRevoke) return;
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
    if (!studentResultsList) return;
    studentResultsList.innerHTML = '<div class="staff-empty-hint">Searching student accounts…</div>';

    try {
      const res = await sfSchoolFetch(`/api/staff/students?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.students)) {
        studentResultsList.innerHTML = '<div class="staff-empty-hint">Search failed. Please try again.</div>';
        return;
      }

      const students: StudentMember[] = data.students;
      if (!students.length) {
        studentResultsList.innerHTML = `<div class="staff-empty-hint">No students found matching “${query}”.</div>`;
        return;
      }

      studentResultsList.innerHTML = students.map(s => {
        const initial = (s.display_name || s.email || 'S').slice(0, 1).toUpperCase();
        return `
          <div class="student-result-card" data-id="${s.id}">
            <div class="student-avatar" aria-hidden="true">${initial}</div>
            <div class="student-info">
              <strong>${s.display_name || s.email?.split('@')[0] || 'Student'}</strong>
              <small>${s.email || 'No email'}</small>
            </div>
            <div class="student-actions">
              <button type="button" class="workspace-button staff-promote-btn" data-promote-role="moderator" data-user-id="${s.id}" data-name="${s.display_name || 'Student'}">+ Mod</button>
              <button type="button" class="workspace-button staff-promote-btn" data-promote-role="admin" data-user-id="${s.id}" data-name="${s.display_name || 'Student'}">+ Admin</button>
            </div>
          </div>
        `;
      }).join('');
    } catch {
      studentResultsList.innerHTML = '<div class="staff-empty-hint">Error searching students.</div>';
    }
  });

  studentResultsList?.addEventListener('click', async (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-promote-role]');
    if (!btn || btn.disabled) return;
    const role = btn.dataset.promoteRole as 'admin' | 'moderator';
    const id = btn.dataset.userId;
    const name = btn.dataset.name || 'Student';
    if (!id || !role) return;

    btn.disabled = true;
    const ok = await updateRole(id, role);
    if (ok) {
      const card = btn.closest('.student-result-card');
      card?.remove();
    } else {
      btn.disabled = false;
    }
  });

  inviteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (inviteEmailInput?.value || '').trim();
    const roleRadio = inviteForm.querySelector<HTMLInputElement>('input[name="invite-role"]:checked');
    const role = (roleRadio?.value || 'moderator') as 'admin' | 'moderator';

    if (!email) return;
    if (inviteStatus) inviteStatus.textContent = 'Generating invitation…';

    try {
      const res = await sfSchoolFetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (inviteStatus) {
          inviteStatus.textContent = data.error || 'Failed to generate invitation.';
          inviteStatus.className = 'workspace-message is-error';
        }
        return;
      }

      if (data.isExisting) {
        if (inviteStatus) {
          inviteStatus.textContent = `User ${email} found and assigned role: ${role}.`;
          inviteStatus.className = 'workspace-message is-success';
        }
        await refreshRoster();
      } else {
        if (inviteStatus) {
          inviteStatus.textContent = `Invite ready for ${email}.`;
          inviteStatus.className = 'workspace-message is-success';
        }
        if (inviteOutput && inviteUrlInput) {
          inviteOutput.hidden = false;
          const origin = window.location.origin;
          inviteUrlInput.value = `${origin}${sfSchoolPath(data.inviteUrl || '/staff-login')}`;
        }
      }
    } catch (err: any) {
      if (inviteStatus) {
        inviteStatus.textContent = err?.message || 'Error creating invitation.';
        inviteStatus.className = 'workspace-message is-error';
      }
    }
  });

  copyInviteBtn?.addEventListener('click', async () => {
    if (!inviteUrlInput) return;
    try {
      await navigator.clipboard.writeText(inviteUrlInput.value);
      copyInviteBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyInviteBtn.textContent = 'Copy';
      }, 2000);
    } catch {
      inviteUrlInput.select();
    }
  });

  renderRoster();
})();
