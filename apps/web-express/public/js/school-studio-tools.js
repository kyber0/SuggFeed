"use strict";
var SfStudioTools;
(function (SfStudioTools) {
    const names = { displayName: 'School display name', palette: 'Brand palette', logo: 'School logo', cover: 'Cover image', headline: 'Welcome headline', intro: 'Introduction', message: 'Welcome message', help: 'Help information', links: 'Official links', comments: 'New comments', voting: 'Voting', roadmap: 'Student progress view', sharing: 'Sharing controls', anonymous: 'Anonymous submissions', instructions: 'Submission instructions', example: 'Submission example', attachments: 'Submission attachments', questions: 'Additional questions', approved: 'Planned stage', in_progress: 'In-progress stage', resolved: 'Completed stage', invitation: 'Invitation welcome', introduction: 'School email introduction', digest: 'Digest availability', layout: 'Page layout', spacing: 'Spacing', cards: 'Card treatment', hidden: 'Hidden sections', order: 'Section order', sections: 'Component styles', view: 'Default progress view' };
    SfStudioTools.equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function value(v) { if (v === undefined || v === null || v === '')
        return 'Default / none'; if (typeof v === 'boolean')
        return v ? 'Enabled' : 'Disabled'; if (Array.isArray(v))
        return v.length ? v.map(x => typeof x === 'object' && x ? String(x.name || x.label || 'Item') : String(x)).join(', ') : 'None'; if (typeof v === 'object')
        return Object.entries(v).map(([key, item]) => (names[key] || key) + ': ' + value(item)).join('; ') || 'Default'; return String(v); }
    SfStudioTools.value = value;
    function changes(before, after) {
        const result = [];
        const add = (label, scope, a, b, component, effect) => { if (!SfStudioTools.equal(a, b))
            result.push({ label, scope, before: value(a), after: value(b), component, effect }); };
        for (const key of ['displayName', 'palette', 'logo', 'cover'])
            add(names[key], 'School-wide', before[key], after[key], 'school.identity');
        for (const [group, component, scope] of [['welcome', 'home.hero', 'Home'], ['features', 'community.features', 'School-wide'], ['form', 'submission.instructions', 'Submission form'], ['labels', 'progress.labels', 'School-wide'], ['stageDescriptions', 'progress.labels', 'School-wide'], ['email', 'school.email', 'School-wide']])
            for (const key of new Set([...Object.keys(before[group] || {}), ...Object.keys(after[group] || {})])) {
                if (group === 'form' && key === 'questions')
                    continue;
                const effect = group === 'features' && after[group][key] === false ? { comments: 'Existing comments remain readable; new comments are blocked.', voting: 'Existing votes remain; new voting actions are blocked.', roadmap: 'Student progress navigation is disabled. Staff work continues.', sharing: 'Sharing controls are disabled. Public URLs can still be copied.', anonymous: 'Existing anonymous ideas keep their privacy.' }[key] : group === 'form' && ['questions', 'attachments'].includes(key) ? 'Historical answers remain. Collection changes may require platform review.' : undefined;
                const defaults = { headline: 'Your ideas can shape your campus.', intro: 'Share what could be better, support useful suggestions, and follow your school’s progress.' };
                add(names[key] || key, scope, group === 'welcome' ? (before[group]?.[key] || defaults[key] || '') : before[group]?.[key], group === 'welcome' ? (after[group]?.[key] || defaults[key] || '') : after[group]?.[key], group === 'welcome' && ['links', 'help'].includes(key) ? 'home.links' : component, effect);
            }
        for (const id of new Set([...(before.form?.questions || []).map((q) => q.id), ...(after.form?.questions || []).map((q) => q.id)])) {
            const old = before.form.questions.find((q) => q.id === id), next = after.form.questions.find((q) => q.id === id);
            if (!old || !next)
                add((!old ? 'Added question: ' : 'Removed question: ') + (next?.label || old?.label), 'Submission form', old?.label, next?.label, next ? 'question:' + id : 'submission.instructions', 'Historical answers and wording remain available. Collection changes may require review.');
            else
                for (const key of ['label', 'help', 'type', 'required', 'options'])
                    add('Question: ' + next.label + ' · ' + key, 'Submission form', old[key], next[key], 'question:' + id);
        }
        const oldCats = before.categories || [], newCats = after.categories || [];
        for (const cat of newCats) {
            const old = oldCats.find((c) => c.id === cat.id);
            if (!old)
                add('New category: ' + cat.name, 'School-wide', null, cat.name, 'category:' + cat.id);
            else
                for (const key of ['name', 'slug', 'description', 'icon', 'active'])
                    add('Category: ' + cat.name + ' · ' + key, 'School-wide', old[key], cat[key], 'category:' + cat.id, key === 'active' && !cat.active ? 'Archived for new submissions; existing ideas retain the category.' : undefined);
        }
        if (!SfStudioTools.equal(oldCats.map((c) => c.id), newCats.map((c) => c.id)))
            add('Category order', 'School-wide', oldCats.map((c) => c.name), newCats.map((c) => c.name), 'community.categories');
        const a = before.design || SfSchoolDesign.defaults(before.palette), b = after.design || SfSchoolDesign.defaults(after.palette);
        for (const mode of ['light', 'dark'])
            for (const role of SfSchoolDesign.roles)
                add(mode + ' · ' + role, 'School-wide', a[mode]?.[role], b[mode]?.[role], 'school.theme');
        for (const key of ['corners', 'font'])
            add(key === 'font' ? 'Workspace typeface' : 'Corner style', 'School-wide', a[key], b[key], 'school.theme');
        for (const page of new Set([...Object.keys(a.pages || {}), ...Object.keys(b.pages || {})]))
            for (const key of new Set([...Object.keys(a.pages?.[page] || {}), ...Object.keys(b.pages?.[page] || {})]))
                add((SfSchoolDesign.pages[page]?.label || page) + ' · ' + (names[key] || key), 'This page', a.pages?.[page]?.[key], b.pages?.[page]?.[key], 'page.' + page);
        return result;
    }
    SfStudioTools.changes = changes;
    function renderChanges(root, items, select) { root.replaceChildren(); if (!items.length) {
        const p = document.createElement('p');
        p.textContent = 'No differences from the compared version.';
        root.append(p);
        return;
    } for (const item of items) {
        const row = document.createElement('article');
        row.className = 'studio-change';
        const heading = document.createElement('strong');
        heading.textContent = item.label;
        const scope = document.createElement('small');
        scope.textContent = item.scope;
        const values = document.createElement('dl');
        for (const [label, text] of [['Before', item.before], ['After', item.after]]) {
            const pair = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
            dt.textContent = label;
            dd.textContent = text;
            pair.append(dt, dd);
            values.append(pair);
        }
        row.append(scope, heading, values);
        if (item.effect) {
            const effect = document.createElement('p');
            effect.textContent = item.effect;
            row.append(effect);
        }
        if (select) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Edit setting →';
            button.addEventListener('click', () => select(item.component));
            row.append(button);
        }
        root.append(row);
    } }
    SfStudioTools.renderChanges = renderChanges;
})(SfStudioTools || (SfStudioTools = {}));
