"use strict";
(() => {
    const dataScript = document.getElementById('analytics-data-json');
    let data = {};
    try {
        data = JSON.parse(dataScript?.textContent || '{}');
    }
    catch {
        data = {};
    }
    let isCumulative = false;
    const chartContainer = document.getElementById('analytics-timeline-chart');
    const btnDaily = document.getElementById('btn-toggle-daily');
    const btnCum = document.getElementById('btn-toggle-cum');
    const exportBtn = document.getElementById('analytics-export-csv');
    const filters = document.getElementById('analytics-filters');
    filters?.addEventListener('change', () => filters.querySelectorAll('.analytics-pill').forEach(label => label.classList.toggle('is-active', !!label.querySelector('input')?.checked)));
    function renderChart() {
        if (!chartContainer)
            return;
        const timeline = data.timeline || [];
        if (!timeline.length || !timeline.some(item => item.submissions || item.approved || item.votes)) {
            chartContainer.replaceChildren(sfEmptyState({ icon: 'chart', heading: 'No activity in this snapshot', description: 'Try another category or a wider date range. New school ideas will appear here.' }));
            return;
        }
        let cumSubs = 0;
        let cumApp = 0;
        let cumVotes = 0;
        const points = timeline.map(item => {
            cumSubs += item.submissions;
            cumApp += item.approved;
            cumVotes += item.votes;
            return {
                key: item.key, date: item.date,
                fullDate: item.fullDate,
                subs: isCumulative ? cumSubs : item.submissions,
                approved: isCumulative ? cumApp : item.approved,
                votes: isCumulative ? cumVotes : item.votes,
            };
        });
        const maxVal = Math.max(1, ...points.map(p => Math.max(p.subs, p.approved, p.votes)));
        const w = 840;
        const h = 240;
        const padX = 40;
        const padY = 24;
        const plotW = w - padX * 2;
        const plotH = h - padY * 2;
        const first = Date.parse(points[0].key || ''), last = Date.parse(points[points.length - 1].key || '');
        const getX = (idx) => points.length === 1 ? w / 2 : padX + (Number.isFinite(first) && last > first ? (Date.parse(points[idx].key || '') - first) / (last - first) : idx / Math.max(1, points.length - 1)) * plotW;
        const getY = (val) => h - padY - (val / maxVal) * plotH;
        const subsPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(p.subs).toFixed(1)}`).join(' ');
        const appPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(p.approved).toFixed(1)}`).join(' ');
        const votesPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(p.votes).toFixed(1)}`).join(' ');
        const areaPath = `${subsPath} L${getX(points.length - 1)},${h - padY} L${padX},${h - padY} Z`;
        const stepLabel = Math.max(1, Math.floor(points.length / 6));
        const xLabels = points.filter((_, i) => i % stepLabel === 0 || i === points.length - 1);
        chartContainer.innerHTML = `
      <svg role="img" aria-label="Submission and current support trends. The chart data table provides exact values." class="analytics-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0284c7" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <!-- Horizontal Grid Lines -->
        <line x1="${padX}" y1="${getY(maxVal)}" x2="${w - padX}" y2="${getY(maxVal)}" stroke="var(--line)" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${getY(maxVal / 2)}" x2="${w - padX}" y2="${getY(maxVal / 2)}" stroke="var(--line)" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="var(--line)"/>

        <!-- Y Axis Scale Labels -->
        <text x="${padX - 8}" y="${getY(maxVal) + 4}" font-size="10" fill="var(--muted)" text-anchor="end">${maxVal}</text>
        <text x="${padX - 8}" y="${getY(maxVal / 2) + 4}" font-size="10" fill="var(--muted)" text-anchor="end">${Math.round(maxVal / 2)}</text>
        <text x="${padX - 8}" y="${h - padY + 4}" font-size="10" fill="var(--muted)" text-anchor="end">0</text>

        <!-- Area Fill -->
        <path d="${areaPath}" fill="url(#areaGrad)"/>

        <!-- Trend Lines -->
        <path d="${subsPath}" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${appPath}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${votesPath}" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4,3" stroke-linecap="round" stroke-linejoin="round"/>

        ${points.map((p, i) => `<circle cx="${getX(i)}" cy="${getY(p.subs)}" r="3" fill="#0284c7"/><circle cx="${getX(i)}" cy="${getY(p.approved)}" r="2" fill="#10b981"/>`).join('')}
        <!-- X Axis Labels -->
        ${xLabels.map(p => {
            const idx = points.indexOf(p);
            return `<text x="${getX(idx)}" y="${h - 6}" font-size="10" fill="var(--muted)" text-anchor="middle">${sfEscapeAttribute(p.date)}</text>`;
        }).join('')}
      </svg>
    `;
    }
    btnDaily?.addEventListener('click', () => {
        isCumulative = false;
        btnDaily.classList.add('is-active');
        btnDaily.setAttribute('aria-pressed', 'true');
        btnCum?.setAttribute('aria-pressed', 'false');
        btnCum?.classList.remove('is-active');
        renderChart();
    });
    btnCum?.addEventListener('click', () => {
        isCumulative = true;
        btnCum.classList.add('is-active');
        btnCum.setAttribute('aria-pressed', 'true');
        btnDaily?.setAttribute('aria-pressed', 'false');
        btnDaily?.classList.remove('is-active');
        renderChart();
    });
    exportBtn?.addEventListener('click', () => {
        const categories = data.categories || [];
        let csv = 'Category,Total Ideas,Community Votes,Approved Count,Resolved Count,Approval Rate (%)\n';
        categories.forEach(c => {
            const rate = c.count > 0 ? Math.round((c.approved / c.count) * 100) : 0;
            const name = '\"' + (/^(?:\s*[=+@-]|[\t\r\n])/.test(c.name) ? "'" : '') + c.name.replace(/\"/g, '\"\"') + '\"';
            csv += `${name},${c.count},${c.votes},${c.approved},${c.resolved},${rate}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `suggfeed-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    });
    renderChart();
})();
