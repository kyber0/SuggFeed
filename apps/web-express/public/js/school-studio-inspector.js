"use strict";
(() => {
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const input = (field, label, value, max = 200, kind = 'text') => '<label>' + escape(label) + (kind === 'textarea' ? '<textarea rows="3" maxlength="' + max + '" data-property="' + field + '">' + escape(value) + '</textarea><span class="studio-field-count" aria-hidden="true">' + String(value ?? '').length + ' / ' + max + '</span>' : '<input type="' + kind + '" maxlength="' + max + '" data-property="' + field + '" value="' + escape(value) + '">') + '</label>';
    function colors(value) { return '<fieldset class="studio-colors"><legend>Brand color presets</legend><div class="studio-color-presets">' + Object.entries(SfSchoolColors.presets).map(([name, color]) => '<button type="button" data-palette="' + name + '" aria-pressed="' + (value === name || value === color) + '" title="' + name + '" aria-label="Use ' + name + ' primary"><span style="background:' + color + '"></span></button>').join('') + '</div><p>Choose a preset or fine-tune the colors below.</p></fieldset>'; }
    const select = (field, label, value, options, disabled = false) => '<label>' + escape(label) + '<select data-property="' + field + '" ' + (disabled ? 'disabled' : '') + '>' + options.map(option => { const [key, text] = Array.isArray(option) ? option : [option, option]; return '<option value="' + escape(key) + '" ' + (key === value ? 'selected' : '') + '>' + escape(text) + '</option>'; }).join('') + '</select></label>';
    const check = (field, label, value, hint = '') => '<label class="studio-check"><input type="checkbox" data-property="' + field + '" ' + (value ? 'checked' : '') + '><span>' + escape(label) + (hint ? '<small style="display:block;font-weight:400">' + escape(hint) + '</small>' : '') + '</span></label>';
    function themeEditor(p) { const d = p.design || SfSchoolDesign.defaults(p.palette); let html = '<p class="studio-scope-badge">Workspace · all student and staff screens</p><p>Customize either appearance. Contrast is checked before saving.</p>' + colors(d.light.primary) + '<div class="studio-theme-modes">'; for (const mode of ['light', 'dark']) {
        html += '<details class="studio-theme-mode" ' + (mode === 'light' ? 'open' : '') + '><summary>' + mode[0].toUpperCase() + mode.slice(1) + ' appearance</summary>';
        for (const role of SfSchoolDesign.roles)
            html += '<div class="studio-theme-row"><label for="sd-' + mode + '-' + role + '">' + role[0].toUpperCase() + role.slice(1) + '</label><input class="workspace-input" id="sd-' + mode + '-' + role + '" aria-label="' + mode + ' ' + role + ' color" type="color" data-theme-mode="' + mode + '" data-theme-role="' + role + '" value="' + (d[mode][role] || SfSchoolDesign.defaults(p.palette)[mode][role]) + '"><input aria-label="' + mode + ' ' + role + ' hex" class="workspace-input" type="text" data-theme-mode="' + mode + '" data-theme-role="' + role + '" value="' + (d[mode][role] || SfSchoolDesign.defaults(p.palette)[mode][role]) + '" maxlength="7" required pattern="#[0-9a-fA-F]{6}" spellcheck="false"><button type="button" data-reset-color="' + mode + ':' + role + '" aria-label="Reset ' + mode + ' ' + role + '">↺</button></div>';
        html += '</details>';
    } html += '</div><p id="studio-theme-issues" role="status">' + escape(SfSchoolDesign.issues(d).join(' ') || 'Text contrast meets 4.5:1 in both appearances.') + '</p><div class="studio-theme-sample" style="background:' + d.light.surface + ';color:' + d.light.text + ';border-color:' + d.light.border + '"><strong>Theme sample</strong><p style="color:' + d.light.muted + '">A readable school workspace.</p><span style="background:' + d.light.primary + ';color:' + (SfSchoolDesign.contrast(d.light.primary, '#000000') >= 4.5 ? '#000000' : '#ffffff') + '">Primary action</span><a href="#" tabindex="-1" style="color:' + d.light.link + '">School link</a></div>'; html += select('design-corners', 'Card corners', d.corners, [['square', 'Subtle · 4 px'], ['rounded', 'Rounded · 12 px'], ['soft', 'Soft · 20 px']]) + select('design-font', 'Workspace typeface', d.font, [['brand', 'SuggFeed brand'], ['inter', 'Inter'], ['system', 'System font']]) + '<button type="button" data-reset-design>Reset theme & page layouts</button><p>State colors, permission rules and SuggFeed branding keep their meaning.</p>'; return html; }
    function pageEditor(p, selected) {
        const [, pageId, sectionId] = selected.split('.'), definition = SfSchoolDesign.pages[pageId], settings = p.design?.pages[pageId] || SfSchoolDesign.pageDefaults();
        let html = '<p class="studio-scope-badge">This screen · ' + escape(definition.label) + '</p>';
        if (sectionId) {
            const section = definition.sections[sectionId];
            html += '<p>' + escape(section.label) + ' uses the workspace theme. Its real content remains owned by its author.</p>';
            const styling = settings.sections?.[sectionId] || { spacing: 'inherit', surface: 'inherit', alignment: 'inherit' };
            html += select('section-spacing', 'Component spacing', styling.spacing, [['inherit', 'Use page spacing'], ['compact', 'Compact'], ['comfortable', 'Comfortable'], ['airy', 'Airy']]) + select('section-surface', 'Component surface', styling.surface, [['inherit', 'Use existing surface'], ['card', 'Card surface'], ['raised', 'Raised surface'], ['transparent', 'Transparent']]) + select('section-alignment', 'Text alignment', styling.alignment, [['inherit', 'Use existing alignment'], ['start', 'Start'], ['center', 'Center']]) + '<button type="button" data-reset-section="' + sectionId + '">Reset this component style</button>';
            if (section.optional)
                html += '<label class="studio-check"><input type="checkbox" data-section-visible="' + sectionId + '" ' + (!settings.hidden.includes(sectionId) ? 'checked' : '') + '><span>Show this section</span></label>';
            if (section.reorder)
                html += '<div class="studio-section-move"><button type="button" data-move-section="' + sectionId + '" data-direction="-1">Move earlier</button><button type="button" data-move-section="' + sectionId + '" data-direction="1">Move later</button></div><p>Order changes apply to eligible sections in the same group.</p>';
            const target = pageId === 'home' ? (sectionId === 'hero' ? 'home.hero' : null) : pageId === 'submit' ? (sectionId === 'categories' ? 'community.categories' : 'submission.instructions') : sectionId === 'progress' ? 'progress.labels' : null;
            if (target)
                html += '<button type="button" data-select="' + target + '">Edit section content</button>';
            html += '<button type="button" data-select="page.' + pageId + '">Edit ' + escape(definition.label) + ' layout</button>';
            return html;
        }
        html += select('layout', 'Content layout', settings.layout, [['default', 'Balanced'], ['wide', 'Expanded'], ['focused', 'Focused']]) + select('spacing', 'Content spacing', settings.spacing, [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['airy', 'Airy']]) + select('cards', 'Card treatment', settings.cards, [['outlined', 'Outlined'], ['soft', 'Soft surface'], ['flat', 'Flat']]);
        if (pageId === 'roadmap')
            html += select('view', 'Default roadmap view', settings.view || 'board', [['board', 'Board'], ['tree', 'Category tree'], ['timeline', 'Timeline'], ['done', 'Completed']]);
        html += '<h3>Optional sections</h3>';
        let optional = 0;
        for (const [id, section] of Object.entries(definition.sections))
            if (section.optional) {
                optional++;
                html += '<label class="studio-check"><input type="checkbox" data-section-visible="' + id + '" ' + (!settings.hidden.includes(id) ? 'checked' : '') + '><span>' + escape(section.label) + '</span></label>';
            }
        if (!optional)
            html += '<p>This screen keeps its essential actions visible.</p>';
        html += '<button type="button" data-reset-page="' + pageId + '">Reset this screen</button>';
        return html;
    }
    function mount(host, model, settings) {
        let selected = 'school.identity', renderedSelection = '';
        const state = () => model.getState(), apply = (property, value) => model.applyChange(selected, property, value);
        const toolbar = (label, kind, id, index) => '<div class="studio-repeat-toolbar" draggable="true" data-drag-kind="' + kind + '" data-drag-id="' + id + '"><strong>' + escape(label) + '</strong><button type="button" data-reorder="' + kind + '" data-id="' + id + '" data-direction="-1" aria-label="Move ' + escape(label) + ' up">↑</button><button type="button" data-reorder="' + kind + '" data-id="' + id + '" data-direction="1" aria-label="Move ' + escape(label) + ' down">↓</button></div>';
        function render() {
            const p = state().configuration;
            selected = state().selection?.componentId || '';
            let html = '';
            const focused = host.contains(document.activeElement) ? document.activeElement : null;
            const source = focused?.classList.contains('sf-control-select-trigger') || focused?.classList.contains('sf-control-color-trigger') ? focused.previousElementSibling : focused;
            const focusProperty = source?.dataset.property, focusMode = source?.dataset.themeMode, focusRole = source?.dataset.themeRole;
            const caret = focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement && ['text', 'url', 'search'].includes(focused.type) ? [focused.selectionStart, focused.selectionEnd] : null;
            const panel = host.closest('.studio-panel'), scroll = panel?.scrollTop || 0, openDetails = renderedSelection === selected ? new Map(Array.from(host.querySelectorAll('details')).map(d => [d.querySelector('summary')?.textContent, d.open])) : null;
            settings.controls?.close();
            const row = selected.startsWith('category:') ? p.categories.find((c) => c.id === selected.slice(9)) : selected.startsWith('question:') ? p.form.questions.find((q) => q.id === selected.slice(9)) : null;
            if (!selected)
                html = '<div class="studio-selection-empty"><h3>Select something to customize</h3><p>Click an outlined component in the preview, or choose from this screen’s component list. Workspace theme controls apply to every school screen.</p><button type="button" data-select="school.theme">Open workspace theme</button></div>';
            else if (selected === 'school.theme')
                html = themeEditor(p);
            else if (selected.startsWith('page.') || selected.startsWith('section.'))
                html = pageEditor(p, selected);
            else if (selected === 'school.identity') {
                html = input('displayName', 'Short school name', p.displayName || settings.schoolName, 60);
                for (const kind of ['logo', 'cover'])
                    html += '<div class="studio-asset"><h3>' + escape(kind === 'logo' ? 'School logo' : 'Landing-page cover') + '</h3>' + (p[kind] ? '<img src="' + escape(settings.base + '/assets/' + p[kind]) + '" alt="Current ' + kind + '"><button type="button" data-clear-asset="' + kind + '">Remove ' + kind + '</button>' : '<p>No ' + kind + ' selected.</p>') + '<p data-upload-feedback role="status" hidden></p><label>Choose image<input type="file" data-upload="' + kind + '" accept="image/png,image/jpeg,image/webp" ' + (!settings.uploadsReady ? 'disabled' : '') + '></label><p>PNG, JPEG or WebP · ' + (kind === 'logo' ? '2' : '5') + ' MB maximum.</p></div>';
                if (!settings.uploadsReady)
                    html += '<p>Image uploads need service setup. Ask the platform operator to enable file cleanup.</p>';
            }
            else if (selected === 'home.hero')
                html = input('headline', 'Welcome headline', p.welcome.headline || 'Make campus better, one idea at a time.', 100) + input('intro', 'Introduction', p.welcome.intro || 'Share a suggestion, choose whether to attach your account, and use a private tracking code to check for updates.', 500, 'textarea') + input('message', 'Welcome message', p.welcome.message, 1500, 'textarea') + '<button type="button" data-select="school.identity">Edit logo & cover</button>';
            else if (selected === 'home.links') {
                html = input('help', 'Help & contact information', p.welcome.help, 500, 'textarea');
                for (const [i, link] of p.welcome.links.entries())
                    html += '<div class="studio-repeat" data-link-index="' + i + '">' + toolbar(link.label || 'School link', 'links', String(i), i) + input('link-label', 'Link label', link.label, 60) + input('link-url', 'HTTPS address', link.url, 500, 'url') + '<button type="button" data-remove-link="' + i + '">Remove link</button></div>';
                html += '<button type="button" data-add="link">Add official link</button><p>Up to five HTTPS links. Links do not open external websites inside the preview.</p>';
            }
            else if (selected === 'community.categories') {
                for (const [i, c] of p.categories.entries())
                    html += '<div class="studio-repeat">' + toolbar(c.name || 'Category', 'categories', c.id, i) + '<button type="button" data-select="category:' + c.id + '">Edit ' + escape(c.name || 'category') + '</button><p>' + escape(c.active ? 'Available for new ideas' : 'Archived · existing ideas stay readable') + '</p></div>';
                html += '<button type="button" data-add="category">Add category</button><p>Keep 1–20 active categories. Categories keep stable IDs; archive rather than delete.</p>';
            }
            else if (selected.startsWith('category:') && row)
                html = input('name', 'Category name', row.name, 40) + input('slug', 'Stable address', row.slug, 63) + input('description', 'Description', row.description, 200, 'textarea') + select('icon', 'Icon', row.icon, settings.icons) + check('active', 'Available for new ideas', row.active, 'Archiving preserves existing ideas and their category.') + '<button type="button" data-select="community.categories">All categories & order</button>';
            else if (selected === 'submission.instructions') {
                html = input('instructions', 'Submission instructions', p.form.instructions, 1000, 'textarea') + input('example', 'Helpful example', p.form.example, 1000, 'textarea') + select('attachments', 'Image attachments', p.form.attachments, [['off', 'Off'], ['optional', 'Optional'], ['required', 'At least one required']], !settings.uploadsReady) + '<p>Questions and images stay private to the author and authorized school staff. Collection changes require platform review before publication.</p>';
                for (const [i, q] of p.form.questions.entries())
                    html += '<div class="studio-repeat">' + toolbar(q.label || 'Question', 'questions', q.id, i) + '<button type="button" data-select="question:' + q.id + '">Edit ' + escape(q.label || 'question') + '</button></div>';
                html += '<button type="button" data-add="question">Add question</button>';
            }
            else if (selected.startsWith('question:') && row) {
                html = input('label', 'Question', row.label, 120) + input('help', 'Helpful guidance', row.help, 240, 'textarea') + select('type', 'Answer type', row.type, [['short', 'Short text'], ['long', 'Longer text'], ['choice', 'Single choice']]) + check('required', 'Answer required', row.required);
                if (row.type === 'choice')
                    html += input('options', 'Choices — one per line', row.options.join('\n'), 1000, 'textarea');
                html += '<button type="button" data-remove-question="' + row.id + '">Remove from future forms</button><p>Historical wording and submitted answers are preserved.</p>';
            }
            else if (selected === 'community.features') {
                for (const [key, label, hint] of [['comments', 'Allow new comments', 'Existing comments remain readable.'], ['voting', 'Allow voting', 'Existing vote records are retained.'], ['roadmap', 'Show student roadmap', 'Staff workflow remains available.'], ['sharing', 'Allow sharing controls', 'Public URLs can still be copied. This does not change privacy.'], ['anonymous', 'Allow anonymous ideas', 'Existing anonymous ideas stay anonymous.']])
                    html += check(key, label, p.features[key], hint);
            }
            else if (selected === 'progress.labels') {
                for (const key of ['approved', 'in_progress', 'resolved'])
                    html += '<div class="studio-repeat">' + input('label:' + key, 'Public label · ' + key, p.labels[key], 40) + input('description:' + key, 'Stage explanation', p.stageDescriptions[key], 240, 'textarea') + '</div>';
                html += '<p>These words do not change workflow values, transition rules or audit history.</p>';
            }
            else if (selected === 'school.email')
                html = input('invitation', 'Invitation welcome', p.email.invitation, 1000, 'textarea') + input('introduction', 'School email introduction', p.email.introduction, 1000, 'textarea') + select('digest', 'Digest availability', p.email.digest, [['weekly', 'Weekly, for opted-in users'], ['off', 'Off']]) + '<p>SuggFeed identification, verified sender, security instructions and unsubscribe choices are retained.</p>';
            else
                html = '<p>SuggFeed branding, shared navigation, security state colors and account permissions are managed by the platform. Select a school component to edit its supported properties.</p>';
            host.innerHTML = '<section class="studio-inspector-section">' + html + '</section>';
            const section = host.firstElementChild, groups = new Map();
            let current = 'Content';
            function group(name) { let target = groups.get(name); if (!target) {
                const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
                fieldset.className = 'studio-property-group';
                legend.textContent = name;
                fieldset.append(legend);
                groups.set(name, fieldset);
                target = fieldset;
            } return target; }
            for (const child of Array.from(section.children)) {
                if (child.classList.contains('studio-scope-badge') || child.classList.contains('studio-selection-empty'))
                    continue;
                const property = (child.matches('[data-property]') ? child : child.querySelector('[data-property]'))?.dataset.property;
                if (child.matches('button[data-reset-design],button[data-reset-page],button[data-reset-section]'))
                    current = 'Advanced';
                else if (child.matches('.studio-colors,.studio-theme-modes,.studio-theme-sample,.studio-asset,#studio-theme-issues') || property === 'icon' || property === 'section-surface')
                    current = 'Appearance';
                else if (property && ['layout', 'spacing', 'cards', 'view', 'section-spacing', 'section-alignment', 'design-corners', 'design-font'].includes(property))
                    current = 'Layout';
                else if (child.querySelector('input[type="checkbox"]') || property === 'attachments' || property === 'digest' || child.matches('h3') && child.textContent === 'Optional sections')
                    current = 'Behavior';
                else if (property || child.classList.contains('studio-repeat'))
                    current = 'Content';
                else if (!groups.size && child.tagName === 'P')
                    continue;
                if (child.tagName === 'H3' && child.textContent === 'Optional sections')
                    child.remove();
                else
                    group(current).append(child);
            }
            if (selected && !section.querySelector('.studio-scope-badge')) {
                const scope = document.createElement('p');
                scope.className = 'studio-scope-badge';
                scope.textContent = selected.startsWith('home.') ? 'This page · Home' : selected.startsWith('category:') ? 'School category' : selected.startsWith('question:') ? 'School submission form' : 'School workspace';
                section.prepend(scope);
            }
            for (const name of ['Content', 'Appearance', 'Layout', 'Behavior', 'Advanced']) {
                const content = groups.get(name);
                if (!content)
                    continue;
                if (name === 'Advanced') {
                    const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
                    details.className = 'studio-advanced';
                    summary.textContent = 'Advanced';
                    content.querySelector('legend')?.remove();
                    body.append(...Array.from(content.children));
                    details.append(summary, body);
                    section.append(details);
                }
                else
                    section.append(content);
            }
            if (openDetails)
                for (const details of host.querySelectorAll('details'))
                    if (openDetails.has(details.querySelector('summary')?.textContent))
                        details.open = !!openDetails.get(details.querySelector('summary')?.textContent);
            renderedSelection = selected;
            settings.controls?.refresh();
            window.sfFileUpload?.refresh(host);
            if (focused) {
                let next = null;
                if (focusProperty)
                    next = host.querySelector('[data-property="' + CSS.escape(focusProperty) + '"]');
                else if (focusMode && focusRole)
                    next = host.querySelector('input[type="text"][data-theme-mode="' + focusMode + '"][data-theme-role="' + focusRole + '"]');
                if (next) {
                    next.focus();
                    if (caret && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement))
                        try {
                            next.setSelectionRange(caret[0], caret[1]);
                        }
                        catch { }
                }
            }
            if (panel)
                panel.scrollTop = scroll;
        }
        host.addEventListener('focusout', () => model.endGroup());
        host.addEventListener('input', event => {
            const changed = event.target;
            const count = changed.closest('label')?.querySelector('.studio-field-count');
            if (count)
                count.textContent = changed.value.length + ' / ' + changed.maxLength;
            const element = event.target;
            const property = element.dataset.property;
            const config = state().configuration;
            if (element.dataset.themeMode && element.dataset.themeRole) {
                if (!/^#[0-9a-f]{6}$/i.test(element.value))
                    return;
                const design = structuredClone(config.design || SfSchoolDesign.defaults(config.palette));
                const mode = element.dataset.themeMode, role = element.dataset.themeRole;
                design[mode][role] = element.value.toLowerCase();
                model.applyChange('school.theme', 'design', design);
                for (const other of host.querySelectorAll('[data-theme-mode="' + mode + '"][data-theme-role="' + role + '"]'))
                    if (other !== element)
                        other.value = element.value;
                document.getElementById('studio-theme-issues').textContent = SfSchoolDesign.issues(design).join(' ') || 'Text contrast meets 4.5:1 in both appearances.';
                return;
            }
            if (element.dataset.sectionVisible) {
                const page = selected.split('.')[1], pd = config.design?.pages[page] || SfSchoolDesign.pageDefaults();
                const hidden = pd.hidden.filter((id) => id !== element.dataset.sectionVisible);
                if (!element.checked)
                    hidden.push(element.dataset.sectionVisible);
                model.applyChange('page.' + page, 'hidden', hidden);
                return;
            }
            if (!property)
                return;
            if (property.startsWith('section-')) {
                const [, pageId, sectionId] = selected.split('.'), pd = config.design?.pages[pageId] || SfSchoolDesign.pageDefaults(), sections = structuredClone(pd.sections || {});
                sections[sectionId] = { spacing: 'inherit', surface: 'inherit', alignment: 'inherit', ...sections[sectionId], [property.slice(8)]: element.value };
                model.applyChange('page.' + pageId, 'sections', sections);
                return;
            }
            if (property.startsWith('design-')) {
                const design = structuredClone(config.design || SfSchoolDesign.defaults(config.palette));
                design[property.slice(7)] = element.value;
                model.applyChange('school.theme', 'design', design);
                return;
            }
            let value = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element.value;
            const p = state().configuration;
            if (property === 'palette') {
                if (!/^#[0-9a-f]{6}$/i.test(value))
                    return;
                for (const other of host.querySelectorAll('[data-property="palette"]'))
                    if (other !== element)
                        other.value = value;
                for (const preset of host.querySelectorAll('[data-palette]'))
                    preset.setAttribute('aria-pressed', 'false');
                model.applyChange('school.identity', 'palette', value);
                const design = structuredClone(p.design || SfSchoolDesign.defaults(value));
                design.light.primary = design.dark.primary = value;
                model.applyChange('school.theme', 'design', design);
                return;
            }
            const index = element.closest('[data-link-index]')?.dataset.linkIndex;
            if (index !== undefined) {
                const links = structuredClone(p.welcome.links);
                links[Number(index)][property === 'link-label' ? 'label' : 'url'] = value;
                apply('links', links);
            }
            else if (property.startsWith('label:') || property.startsWith('description:')) {
                const [kind, key] = property.split(':');
                const field = kind === 'label' ? 'labels' : 'stageDescriptions';
                apply(field, { ...p[field], [key]: value });
            }
            else {
                if (property === 'options')
                    value = value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
                if (property === 'type') {
                    if (value !== 'choice')
                        model.applyChange(selected, 'options', []);
                    else if (!p.form.questions.find((q) => q.id === selected.slice(9))?.options.length)
                        model.applyChange(selected, 'options', ['Option 1', 'Option 2']);
                }
                apply(property, value);
                if (property === 'type')
                    render();
            }
        });
        host.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button)
                return;
            const p = state().configuration;
            if (button.dataset.palette) {
                model.applyChange('school.identity', 'palette', button.dataset.palette);
                const design = structuredClone(p.design || SfSchoolDesign.defaults(button.dataset.palette));
                design.light.primary = design.dark.primary = SfSchoolColors.resolve(button.dataset.palette);
                model.applyChange('school.theme', 'design', design);
                render();
                return;
            }
            if (button.dataset.select) {
                settings.select(button.dataset.select);
                return;
            }
            if (button.hasAttribute('data-reset-design')) {
                if (settings.confirm && !await settings.confirm('Reset the school theme and every page layout? School content, members and the published version are preserved until you save and publish.', 'Reset theme & layouts'))
                    return;
                model.applyChange('school.theme', 'design', SfSchoolDesign.defaults(p.palette));
                render();
                return;
            }
            if (button.dataset.resetColor) {
                const [mode, role] = button.dataset.resetColor.split(':');
                const design = structuredClone(p.design || SfSchoolDesign.defaults(p.palette));
                design[mode][role] = SfSchoolDesign.defaults(p.palette)[mode][role];
                model.applyChange('school.theme', 'design', design);
                render();
                return;
            }
            if (button.dataset.resetSection) {
                const pageId = selected.split('.')[1], sections = structuredClone(p.design?.pages[pageId]?.sections || {});
                delete sections[button.dataset.resetSection];
                model.applyChange('page.' + pageId, 'sections', sections);
                render();
                return;
            }
            if (button.dataset.resetPage) {
                const design = structuredClone(p.design || SfSchoolDesign.defaults(p.palette));
                delete design.pages[button.dataset.resetPage];
                model.applyChange('school.theme', 'design', design);
                render();
                return;
            }
            if (button.dataset.moveSection) {
                const pageId = selected.split('.')[1], pd = p.design?.pages[pageId] || SfSchoolDesign.pageDefaults(), ids = Object.keys(SfSchoolDesign.pages[pageId].sections).filter(id => SfSchoolDesign.pages[pageId].sections[id].reorder), order = [...pd.order, ...ids.filter(id => !pd.order.includes(id))], from = order.indexOf(button.dataset.moveSection), to = from + Number(button.dataset.direction);
                if (from >= 0 && to >= 0 && to < order.length) {
                    [order[from], order[to]] = [order[to], order[from]];
                    model.applyChange('page.' + pageId, 'order', order);
                }
                return;
            }
            if (button.dataset.add) {
                const kind = button.dataset.add;
                if (kind === 'category') {
                    if (p.categories.length >= 60 || p.categories.filter((c) => c.active).length >= 20)
                        return settings.say('Archive a category before adding more active categories.');
                    const id = crypto.randomUUID();
                    model.applyChange('community.categories', 'categories', [...p.categories, { id, name: 'New category', slug: 'category-' + id.slice(0, 8), description: '', icon: 'message', active: true }]);
                    settings.select('category:' + id);
                }
                if (kind === 'question') {
                    if (p.form.questions.length >= 8)
                        return settings.say('Use at most eight additional questions.');
                    const id = crypto.randomUUID();
                    model.applyChange('submission.instructions', 'questions', [...p.form.questions, { id, label: 'New question', help: '', type: 'short', required: false, options: [] }]);
                    settings.select('question:' + id);
                }
                if (kind === 'link') {
                    if (p.welcome.links.length >= 5)
                        return settings.say('Use up to five official links.');
                    apply('links', [...p.welcome.links, { label: 'School website', url: 'https://example.edu.ph/' }]);
                    render();
                }
            }
            if (button.dataset.removeLink !== undefined) {
                apply('links', p.welcome.links.filter((_l, i) => i !== Number(button.dataset.removeLink)));
                render();
            }
            if (button.dataset.removeQuestion) {
                model.applyChange('submission.instructions', 'questions', p.form.questions.filter((q) => q.id !== button.dataset.removeQuestion));
                settings.select('submission.instructions');
            }
            if (button.dataset.clearAsset) {
                model.applyChange('school.identity', button.dataset.clearAsset, null);
                render();
            }
            if (button.dataset.reorder) {
                const kind = button.dataset.reorder;
                const array = structuredClone(kind === 'categories' ? p.categories : kind === 'questions' ? p.form.questions : p.welcome.links);
                const index = kind === 'links' ? Number(button.dataset.id) : array.findIndex((item) => item.id === button.dataset.id);
                const target = index + Number(button.dataset.direction);
                if (target < 0 || target >= array.length)
                    return;
                [array[index], array[target]] = [array[target], array[index]];
                model.applyChange(kind === 'categories' ? 'community.categories' : kind === 'questions' ? 'submission.instructions' : 'home.links', kind === 'questions' ? 'questions' : kind === 'categories' ? 'categories' : 'links', array);
                render();
            }
        });
        host.addEventListener('dragstart', event => { const row = event.target.closest('[data-drag-kind]'); if (!row || !event.dataTransfer)
            return; event.dataTransfer.setData('application/x-suggfeed-studio', JSON.stringify({ kind: row.dataset.dragKind, id: row.dataset.dragId })); event.dataTransfer.effectAllowed = 'move'; });
        host.addEventListener('dragover', event => { const target = event.target.closest('[data-drag-kind]'); for (const row of host.querySelectorAll('[data-drop-target]'))
            row.removeAttribute('data-drop-target'); if (target) {
            target.setAttribute('data-drop-target', '');
            event.preventDefault();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = 'move';
        } });
        host.addEventListener('dragend', () => { for (const row of host.querySelectorAll('[data-drop-target]'))
            row.removeAttribute('data-drop-target'); });
        host.addEventListener('drop', event => { for (const row of host.querySelectorAll('[data-drop-target]'))
            row.removeAttribute('data-drop-target'); const target = event.target.closest('[data-drag-kind]'); if (!target || !event.dataTransfer)
            return; event.preventDefault(); try {
            const source = JSON.parse(event.dataTransfer.getData('application/x-suggfeed-studio'));
            const kind = target.dataset.dragKind;
            if (source.kind !== kind || !['categories', 'questions', 'links'].includes(kind))
                return;
            const p = state().configuration;
            const items = structuredClone(kind === 'categories' ? p.categories : kind === 'questions' ? p.form.questions : p.welcome.links);
            const from = kind === 'links' ? Number(source.id) : items.findIndex((item) => item.id === source.id), to = kind === 'links' ? Number(target.dataset.dragId) : items.findIndex((item) => item.id === target.dataset.dragId);
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length)
                return;
            items.splice(to, 0, items.splice(from, 1)[0]);
            model.applyChange(kind === 'categories' ? 'community.categories' : kind === 'questions' ? 'submission.instructions' : 'home.links', kind, items);
            render();
        }
        catch {
            settings.say('Use the move buttons to reorder this item.');
        } });
        host.addEventListener('change', async (event) => { const input = event.target; if (!input.dataset.upload)
            return; const file = input.files?.[0], kind = input.dataset.upload; if (!file)
            return; const feedback = input.closest('.studio-asset')?.querySelector('[data-upload-feedback]'); const uploadStatus = (message) => { if (feedback) {
            feedback.hidden = false;
            feedback.textContent = message;
        } }; if (file.size > (kind === 'logo' ? 2 : 5) * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            uploadStatus('Choose PNG, JPEG or WebP within the displayed size limit.');
            return settings.say('Choose a supported image within its size limit.', true);
        } uploadStatus('Uploading and processing…'); input.disabled = true; settings.uploading(true); try {
            settings.say('Uploading and processing image…');
            const intent = await settings.request('assets/intent', { kind, size: file.size });
            const response = await fetch(intent.url, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
            if (!response.ok)
                throw new Error('Image upload failed. Choose it again.');
            const result = await settings.request('assets/finalize', { kind, id: intent.id });
            model.applyChange('school.identity', kind, result.id);
            render();
            settings.say('Image ready. Save the draft to keep this change.');
        }
        catch (error) {
            uploadStatus(error instanceof Error ? error.message : 'Image upload failed.');
            settings.say(error instanceof Error ? error.message : 'Image upload failed.', true);
        }
        finally {
            settings.uploading(false);
            input.disabled = false;
            input.value = '';
        } });
        return { render };
    }
    Object.assign(window, { sfSchoolStudioInspector: { mount } });
})();
