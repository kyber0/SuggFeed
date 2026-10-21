"use strict";
/** Shared allowlisted presentation schema used by the server, studio and published pages. */
var SfSchoolDesign;
(function (SfSchoolDesign) {
    SfSchoolDesign.roles = ['primary', 'secondary', 'background', 'surface', 'raised', 'text', 'muted', 'border', 'link', 'cursor'];
    SfSchoolDesign.pages = {
        home: { label: 'Home', root: '.sf-main', sections: { hero: { label: 'Welcome hero', selector: '.sf-hero', reorder: true }, hub: { label: 'Share & track', selector: '#action-hub', reorder: true }, ideas: { label: 'Community highlights', selector: '#feed', reorder: true }, points: { label: 'Welcome benefits', selector: '.sf-hero-points', optional: true } } },
        feed: { label: 'Community ideas', root: '.community-page-wrapper', sections: { topics: { label: 'Topics sidebar', selector: '.community-left-nav' }, cards: { label: 'Idea cards', selector: '.community-feed-main' }, promo: { label: 'Roadmap invitation', selector: '.feed-roadmap-promo', optional: true, reorder: true }, supported: { label: 'Most supported', selector: '.feed-side-card--supported', optional: true, reorder: true }, help: { label: 'Community guidance', selector: '.feed-guidance-panel', optional: true, reorder: true } } },
        roadmap: { label: 'Roadmap', root: '.campus-roadmap', sections: { heading: { label: 'Roadmap heading', selector: '.roadmap-heading' }, summary: { label: 'Stage summary', selector: '.roadmap-summary-pills', optional: true }, filters: { label: 'Search & filters', selector: '.roadmap-controls' }, board: { label: 'Progress cards & views', selector: '.roadmap-board,.roadmap-timeline,.roadmap-tree,.roadmap-done-list' } } },
        idea: { label: 'Idea detail', root: '.standalone-idea-page', sections: { header: { label: 'Header & tags', selector: '.detail-panel-header' }, description: { label: 'Proposal description', selector: '.detail-description-section' }, progress: { label: 'Progress stepper', selector: '.status-stepper', optional: true }, support: { label: 'Community support', selector: '.detail-support-card' }, discussion: { label: 'Discussion', selector: '.detail-col-right' } } },
        profile: { label: 'Student profile', root: '.prof-page', sections: { identity: { label: 'Profile presentation', selector: '.prof-hero' }, stats: { label: 'Activity summary', selector: '.prof-hero-stats', optional: true }, shortcuts: { label: 'Account shortcuts', selector: '.prof-shortcuts' }, activity: { label: 'Activity cards', selector: '.prof-activity,.prof-activity-section,.prof-main' } } },
        submit: { label: 'Submission form', root: '#submit-panel', sections: { steps: { label: 'Form steps', selector: '.sip-stepper' }, categories: { label: 'Category choices', selector: '.sip-cat-grid' }, questions: { label: 'Additional questions', selector: '.school-custom-questions' }, review: { label: 'Review & confirmation', selector: '#sip-step-3,#sip-step-3-content' } } },
        notifications: { label: 'School updates', root: '.notifications-page', sections: { heading: { label: 'Updates heading', selector: '.workspace-heading' }, stream: { label: 'Update cards', selector: '.notification-stream' }, preferences: { label: 'Preference panel', selector: '.notification-settings' } } },
        inbox: { label: 'Private messages', root: '.community-care-page', sections: { heading: { label: 'Messages heading', selector: '.workspace-heading' }, tracking: { label: 'Tracking-code panel', selector: '.inbox-code-panel' }, messages: { label: 'School conversations', selector: '#private-messages' } } },
        staff: { label: 'Staff workspace', root: '.staff-workspace', sections: { navigation: { label: 'Staff navigation', selector: '.staff-sidebar' }, heading: { label: 'Workspace heading', selector: '.workspace-heading' }, board: { label: 'Work cards', selector: '.staff-flow-board' }, tools: { label: 'Work filters', selector: '.staff-board-filters,.staff-board-toolbar' } } }
    };
    function page(value) { const p = value.replace(/^\/s\/[^/]+/, '').split('?')[0]; return p === '/' ? 'home' : p.startsWith('/idea/') ? 'idea' : p.startsWith('/admin') || p.startsWith('/staff') ? 'staff' : p.startsWith('/notifications') ? 'notifications' : p.startsWith('/inbox') ? 'inbox' : p.startsWith('/profile') ? 'profile' : p.startsWith('/roadmap') ? 'roadmap' : p.startsWith('/feed') ? 'feed' : ''; }
    SfSchoolDesign.page = page;
    SfSchoolDesign.pageDefaults = () => ({ layout: 'default', spacing: 'comfortable', cards: 'outlined', hidden: [], order: [], sections: {} });
    // Cursor defaults match tokens.css: light --sky-2 and dark --accent.
    function defaults(palette = 'navy') { const colors = typeof SfSchoolColors !== 'undefined' ? SfSchoolColors : require('./school-colors'); const primary = colors.resolve(palette); return { light: { primary, secondary: '#c2410c', background: '#f8fafc', surface: '#ffffff', raised: '#f1f5f9', text: '#0f172a', muted: '#526278', border: '#cbd5e1', link: '#164e83', cursor: '#dbeafe' }, dark: { primary, secondary: '#fdba74', background: '#0f172a', surface: '#162238', raised: '#1e293b', text: '#f1f5f9', muted: '#b4c1d3', border: '#475569', link: '#93c5fd', cursor: '#f97316' }, corners: 'rounded', font: 'brand', pages: {} }; }
    SfSchoolDesign.defaults = defaults;
    const object = (v, keys) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k)))
        throw new Error('Unsupported design fields.'); return v; };
    function lum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }
    function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
    SfSchoolDesign.contrast = contrast;
    function issues(design) { const errors = []; for (const mode of ['light', 'dark'])
        for (const text of ['text', 'muted', 'link'])
            for (const surface of ['background', 'surface', 'raised']) {
                const c = design[mode];
                if (contrast(c[text], c[surface]) < 4.5)
                    errors.push(`${mode}: ${text} needs 4.5:1 contrast on ${surface}.`);
            } return errors; }
    SfSchoolDesign.issues = issues;
    function normalize(value, palette = 'navy') {
        if (value === undefined)
            return defaults(palette);
        const d = object(value, ['light', 'dark', 'corners', 'font', 'pages']);
        for (const mode of ['light', 'dark']) {
            const c = object(d[mode], SfSchoolDesign.roles);
            for (const key of SfSchoolDesign.roles) {
                if (key === 'cursor' && c[key] === undefined)
                    c[key] = defaults(palette)[mode].cursor;
                if (typeof c[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(c[key]))
                    throw new Error('Use six-digit hex colors for ' + mode + ' ' + key + '.');
                c[key] = c[key].toLowerCase();
            }
        }
        if (!['square', 'rounded', 'soft'].includes(d.corners) || !['brand', 'inter', 'system'].includes(d.font))
            throw new Error('Choose supported corners and typography.');
        const configured = object(d.pages, Object.keys(SfSchoolDesign.pages));
        for (const [key, v] of Object.entries(configured)) {
            const p = object(v, ['layout', 'spacing', 'cards', 'hidden', 'order', 'sections', 'view']);
            if (!['default', 'wide', 'focused'].includes(p.layout) || !['compact', 'comfortable', 'airy'].includes(p.spacing) || !['outlined', 'soft', 'flat'].includes(p.cards))
                throw new Error('Choose supported page presentation.');
            if (p.view !== undefined && (key !== 'roadmap' || !['board', 'tree', 'timeline', 'done'].includes(p.view)))
                throw new Error('Choose a supported roadmap default view.');
            if (p.sections !== undefined) {
                const sections = object(p.sections, Object.keys(SfSchoolDesign.pages[key].sections));
                for (const item of Object.values(sections)) {
                    const v = object(item, ['spacing', 'surface', 'alignment']);
                    if (!['inherit', 'compact', 'comfortable', 'airy'].includes(v.spacing) || !['inherit', 'card', 'raised', 'transparent'].includes(v.surface) || !['inherit', 'start', 'center'].includes(v.alignment))
                        throw new Error('Choose supported component styling.');
                }
            }
            for (const list of ['hidden', 'order']) {
                if (!Array.isArray(p[list]) || new Set(p[list]).size !== p[list].length || p[list].some((id) => typeof id !== 'string' || !SfSchoolDesign.pages[key].sections[id] || (list === 'hidden' ? !SfSchoolDesign.pages[key].sections[id].optional : !SfSchoolDesign.pages[key].sections[id].reorder)))
                    throw new Error('Choose supported page sections.');
            }
        }
        const result = d, error = issues(result)[0];
        if (error)
            throw new Error(error);
        return result;
    }
    SfSchoolDesign.normalize = normalize;
    // A solid black outline remains identical in all hand states.
    function handCursor(color, shape) {
        const fill = /^#[0-9a-f]{6}$/i.test(color) ? color : '#dbeafe';
        const paths = { pointer: 'M9 21 5 14Q4 11 7 12L10 15V4Q10 1 13 2Q14 2 14 4V10Q17 8 18 11Q21 9 22 13Q25 12 25 16V20Q25 26 20 27H14Q12 27 9 21Z', grab: 'M7 17 4 13Q2 10 5 9Q6 9 8 12L10 14V5Q10 2 13 3V12H14V3Q14 0 17 2V12H18V5Q18 2 21 4V13H22V9Q22 6 25 8V20Q25 28 18 28H15Q12 28 10 24Z', grabbing: 'M7 18V12Q7 9 10 10V8Q10 5 14 7Q17 4 19 8Q23 6 24 10L25 18Q25 26 19 27H14Q9 27 7 18Z' };
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="' + paths[shape] + '" fill="' + fill + '" stroke="black" stroke-width="2.5" stroke-linejoin="round"/></svg>';
        return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + (shape === 'pointer' ? '12 3' : '16 16') + ',' + shape;
    }
    function cursorStyle(value = defaults()) { let result = ''; for (const mode of ['light', 'dark'])
        for (const shape of ['pointer', 'grab', 'grabbing'])
            result += `--sd-${mode}-cursor-${shape}:${handCursor(value[mode].cursor || defaults()[mode].cursor, shape)};`; return result; }
    SfSchoolDesign.cursorStyle = cursorStyle;
    function style(value) {
        let style = cursorStyle(value);
        for (const mode of ['light', 'dark']) {
            const c = value[mode];
            for (const role of SfSchoolDesign.roles)
                style += `--sd-${mode}-${role}:${(c[role] || defaults()[mode][role])};`;
            style += `--sd-${mode}-on-primary:${contrast(c.primary, '#000000') >= 4.5 ? '#000000' : '#ffffff'};`;
            style += `--sd-${mode}-primary-text:${contrast(c.primary, c.surface) >= 4.5 ? c.primary : c.link};`;
        }
        const radius = { square: 4, rounded: 12, soft: 20 }[value.corners];
        return style + `--school-accent:var(--sd-primary);--school-on-accent:var(--sd-on-primary);--school-text-accent:var(--sd-primary-text);--school-soft:var(--sd-raised);--sd-radius:${radius}px;--sd-font:${value.font === 'brand' ? "'Plus Jakarta Sans','Inter',system-ui,sans-serif" : value.font === 'inter' ? "'Inter',system-ui,sans-serif" : 'system-ui,sans-serif'};`;
    }
    SfSchoolDesign.style = style;
    function apply(root, design, pageId, palette = 'navy') {
        if (!design) {
            if (root.hasAttribute('data-school-design')) {
                apply(root, defaults(palette), pageId, palette);
                for (const key of ['schoolDesign', 'schoolPage', 'schoolLayout', 'schoolSpacing', 'schoolCards'])
                    delete root.dataset[key];
                for (const name of Array.from(root.style))
                    if (name.startsWith('--sd-'))
                        root.style.removeProperty(name);
                for (const el of root.querySelectorAll('[data-school-section-hidden]'))
                    el.removeAttribute('data-school-section-hidden');
                SfSchoolColors.apply(root, palette);
            }
            const cursors = document.createElement('span');
            cursors.style.cssText = cursorStyle();
            for (const name of Array.from(cursors.style))
                root.style.setProperty(name, cursors.style.getPropertyValue(name));
            return;
        }
        root.dataset.schoolDesign = '';
        const css = document.createElement('span');
        css.style.cssText = style(design);
        for (let i = 0; i < css.style.length; i++) {
            const name = css.style[i];
            root.style.setProperty(name, css.style.getPropertyValue(name));
        }
        root.dataset.schoolPage = pageId;
        const p = design.pages[pageId] || SfSchoolDesign.pageDefaults();
        root.dataset.schoolLayout = p.layout;
        root.dataset.schoolSpacing = p.spacing;
        root.dataset.schoolCards = p.cards;
        const definition = SfSchoolDesign.pages[pageId];
        if (!definition)
            return;
        for (const [id, section] of Object.entries(definition.sections))
            for (const el of root.querySelectorAll(section.selector)) {
                el.dataset.schoolSection = id;
                const styling = p.sections?.[id];
                el.dataset.schoolSectionSpacing = styling?.spacing || 'inherit';
                el.dataset.schoolSectionSurface = styling?.surface || 'inherit';
                el.dataset.schoolSectionAlignment = styling?.alignment || 'inherit';
                if (section.optional) {
                    const hidden = p.hidden.includes(id);
                    el.toggleAttribute('data-school-section-hidden', hidden);
                }
            }
        // Reorder actual siblings, preserving unselected nodes and keyboard reading order.
        const groups = new Map();
        for (const id of Object.keys(definition.sections).filter(id => definition.sections[id].reorder))
            for (const el of root.querySelectorAll(definition.sections[id].selector)) {
                const parent = el.parentElement;
                if (parent) {
                    const group = groups.get(parent) || [];
                    group.push(el);
                    groups.set(parent, group);
                }
            }
        for (const [parent, elements] of groups) {
            if (elements.length < 2)
                continue;
            const canonical = Object.keys(definition.sections), order = [...p.order, ...canonical.filter(id => !p.order.includes(id))];
            const sorted = [...elements].sort((a, b) => order.indexOf(a.dataset.schoolSection) - order.indexOf(b.dataset.schoolSection));
            const positions = Array.from(parent.children).filter(el => elements.includes(el));
            if (positions.every((el, i) => el === sorted[i]))
                continue;
            const slots = positions.map(el => { const mark = document.createComment('school-section'); el.replaceWith(mark); return mark; });
            slots.forEach((mark, i) => mark.replaceWith(sorted[i]));
        }
    }
    SfSchoolDesign.apply = apply;
})(SfSchoolDesign || (SfSchoolDesign = {}));
if (typeof module !== 'undefined')
    module.exports = SfSchoolDesign;
