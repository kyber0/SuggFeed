"use strict";
(() => {
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const input = (field, label, value, max = 200, kind = 'text') => '<label>' + escape(label) + (kind === 'textarea' ? '<textarea rows="3" maxlength="' + max + '" data-property="' + field + '">' + escape(value) + '</textarea>' : '<input type="' + kind + '" maxlength="' + max + '" data-property="' + field + '" value="' + escape(value) + '">') + '</label>';
    const select = (field, label, value, options, disabled = false) => '<label>' + escape(label) + '<select data-property="' + field + '" ' + (disabled ? 'disabled' : '') + '>' + options.map(option => { const [key, text] = Array.isArray(option) ? option : [option, option]; return '<option value="' + escape(key) + '" ' + (key === value ? 'selected' : '') + '>' + escape(text) + '</option>'; }).join('') + '</select></label>';
    const check = (field, label, value, hint = '') => '<label class="studio-check"><input type="checkbox" data-property="' + field + '" ' + (value ? 'checked' : '') + '><span>' + escape(label) + (hint ? '<small style="display:block;font-weight:400">' + escape(hint) + '</small>' : '') + '</span></label>';
    function mount(host, model, settings) {
        let selected = 'school.identity';
        const state = () => model.getState(), apply = (property, value) => model.applyChange(selected, property, value);
        const toolbar = (label, kind, id, index) => '<div class="studio-repeat-toolbar" draggable="true" data-drag-kind="' + kind + '" data-drag-id="' + id + '"><strong>' + escape(label) + '</strong><button type="button" data-reorder="' + kind + '" data-id="' + id + '" data-direction="-1" aria-label="Move ' + escape(label) + ' up">↑</button><button type="button" data-reorder="' + kind + '" data-id="' + id + '" data-direction="1" aria-label="Move ' + escape(label) + ' down">↓</button></div>';
        function render() {
            const p = state().configuration;
            selected = state().selection?.componentId || 'school.identity';
            let html = '';
            const row = selected.startsWith('category:') ? p.categories.find((c) => c.id === selected.slice(9)) : selected.startsWith('question:') ? p.form.questions.find((q) => q.id === selected.slice(9)) : null;
            if (selected === 'school.identity') {
                html = input('displayName', 'Short school name', p.displayName, 60) + select('palette', 'Accent palette', p.palette, settings.palettes);
                for (const kind of ['logo', 'cover'])
                    html += '<div class="studio-asset"><h3>' + escape(kind === 'logo' ? 'School logo' : 'Landing-page cover') + '</h3>' + (p[kind] ? '<img src="' + escape(settings.base + '/assets/' + p[kind]) + '" alt="Current ' + kind + '"><button type="button" data-clear-asset="' + kind + '">Remove ' + kind + '</button>' : '<p>No ' + kind + ' selected.</p>') + '<label>Choose image<input type="file" data-upload="' + kind + '" accept="image/png,image/jpeg,image/webp" ' + (!settings.uploadsReady ? 'disabled' : '') + '></label><p>PNG, JPEG or WebP · ' + (kind === 'logo' ? '2' : '5') + ' MB maximum.</p></div>';
                if (!settings.uploadsReady)
                    html += '<p>Image uploads need service setup. Ask the platform operator to enable file cleanup.</p>';
            }
            else if (selected === 'home.hero')
                html = input('headline', 'Welcome headline', p.welcome.headline, 100) + input('intro', 'Introduction', p.welcome.intro, 500, 'textarea') + input('message', 'Welcome message', p.welcome.message, 1500, 'textarea') + '<button type="button" data-select="school.identity">Edit logo & cover</button>';
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
                html = '<p>SuggFeed branding, shared navigation, security colors, typography and account permissions are managed by the platform. Select a school component to edit its supported properties.</p>';
            host.innerHTML = '<section class="studio-inspector-section">' + html + '</section>';
        }
        host.addEventListener('focusout', () => model.endGroup());
        host.addEventListener('input', event => {
            const element = event.target;
            const property = element.dataset.property;
            if (!property)
                return;
            let value = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element.value;
            const p = state().configuration;
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
        host.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button)
                return;
            const p = state().configuration;
            if (button.dataset.select) {
                settings.select(button.dataset.select);
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
        host.addEventListener('dragover', event => { if (event.target.closest('[data-drag-kind]')) {
            event.preventDefault();
            if (event.dataTransfer)
                event.dataTransfer.dropEffect = 'move';
        } });
        host.addEventListener('drop', event => { const target = event.target.closest('[data-drag-kind]'); if (!target || !event.dataTransfer)
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
            return; if (file.size > (kind === 'logo' ? 2 : 5) * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
            return settings.say('Choose a supported image within its size limit.', true); input.disabled = true; settings.uploading(true); try {
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
