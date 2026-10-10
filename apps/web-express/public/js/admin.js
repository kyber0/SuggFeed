"use strict";
// Browser source extracted from views/admin.eta.
(function () {
    let modalActiveId = null;
    function sfFilterStatus(status) {
        const url = new URL(window.location.href);
        if (status === 'all')
            url.searchParams.delete('status');
        else
            url.searchParams.set('status', status);
        window.location.href = url.toString();
    }
    function sfFilterQueueCards() {
        const q = (document.getElementById('sp-search').value || '').toLowerCase().trim();
        const cards = document.querySelectorAll('.sp-card');
        let visibleCount = 0;
        cards.forEach(card => {
            const title = card.getAttribute('data-title') || '';
            const desc = card.getAttribute('data-desc') || '';
            const code = card.getAttribute('data-code') || '';
            const match = !q || title.includes(q) || desc.includes(q) || code.includes(q);
            if (match) {
                card.removeAttribute('hidden');
            }
            else {
                card.setAttribute('hidden', '');
            }
            if (match)
                visibleCount++;
        });
        const countSpan = document.getElementById('sp-visible-count');
        if (countSpan)
            countSpan.textContent = String(visibleCount);
    }
    function sfOpenDecisionModal(id, title, status) {
        modalActiveId = id;
        document.getElementById('modal-item-title').textContent = title;
        document.getElementById('modal-staff-note').value = '';
        document.getElementById('sp-decision-modal').removeAttribute('hidden');
    }
    function sfCloseDecisionModal() {
        modalActiveId = null;
        document.getElementById('sp-decision-modal').setAttribute('hidden', '');
    }
    function sfSetModalNote(text) {
        document.getElementById('modal-staff-note').value = text;
    }
    async function sfApplyModalStatus(newStatus) {
        if (!modalActiveId)
            return;
        const note = document.getElementById('modal-staff-note').value.trim();
        await sfUpdateSubmission(modalActiveId, newStatus, note);
        sfCloseDecisionModal();
    }
    async function sfQuickUpdateStatus(id, newStatus) {
        await sfUpdateSubmission(id, newStatus, '');
    }
    async function sfUpdateSubmission(id, newStatus, note) {
        try {
            const res = await fetch(`/api/submissions/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, note })
            });
            const data = await res.json();
            if (!data.success && !data.data) {
                throw new Error(data.error || 'Failed to update status');
            }
            if (window.sfToast)
                sfToast(`Status updated to ${newStatus}!`, 'success');
            setTimeout(() => location.reload(), 600);
        }
        catch (err) {
            if (window.sfToast)
                sfToast(err.message || 'Could not update status.', 'error');
        }
    }
    function sfExportAdminCsv() {
        const cards = document.querySelectorAll('.sp-card');
        const rows = [['ID', 'Title', 'Status', 'Tracking Code']];
        cards.forEach(card => {
            const id = card.getAttribute('data-id');
            const title = card.querySelector('.sp-card-title')?.textContent?.replace(/"/g, '""') || '';
            const status = card.getAttribute('data-status');
            const code = card.getAttribute('data-code');
            rows.push([id, `"${title}"`, status, code]);
        });
        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'suggfeed_moderation_queue.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    Object.assign(window, { sfFilterStatus, sfFilterQueueCards, sfOpenDecisionModal, sfCloseDecisionModal, sfSetModalNote, sfApplyModalStatus, sfQuickUpdateStatus, sfUpdateSubmission, sfExportAdminCsv });
})();
