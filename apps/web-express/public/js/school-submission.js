"use strict";
(() => {
    const data = document.getElementById('school-presentation-data');
    if (!data)
        return;
    const configuration = JSON.parse(data.textContent || '{}');
    let schema = configuration.form, formVersion = configuration.formVersion || null, uploads = [], uploading = false, preserved = [];
    const fields = document.querySelector('[data-school-question-fields]');
    const say = (text) => { const status = document.querySelector('[data-submission-upload-status]'); if (status)
        status.textContent = text; window.sfSubmissionRecovery?.tell(text); };
    const values = () => Object.fromEntries(Array.from(document.querySelectorAll('[data-school-question]')).map(input => [input.dataset.schoolQuestion, input.value.trim()]));
    function extra() { return { schemaVersion: 2, formVersion, answers: values(), fileIds: [...uploads] }; }
    function preserve(label, answer) { if (answer && !preserved.some(row => row.label === label && row.answer === answer))
        preserved.push({ label, answer }); }
    function renderPreserved() { const host = document.querySelector('[data-school-preserved-answers]'); if (!host)
        return; host.replaceChildren(); if (!preserved.length)
        return; const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Saved text from earlier school questions (not submitted)'; details.append(summary); for (const row of preserved) {
        const label = document.createElement('label');
        label.className = 'school-question';
        label.textContent = row.label;
        const text = document.createElement('textarea');
        text.readOnly = true;
        text.value = row.answer;
        label.append(text);
        details.append(label);
    } host.append(details); }
    function restore(payload) {
        if (Array.isArray(payload?.previousAnswers))
            for (const row of payload.previousAnswers)
                if (typeof row?.label === 'string' && typeof row?.answer === 'string')
                    preserve(row.label, row.answer);
        for (const [id, answer] of Object.entries(payload?.answers || {}))
            if (typeof answer === 'string' && !schema.questions.some((q) => q.id === id))
                preserve('Earlier question ' + id, answer);
        renderPreserved();
        for (const input of document.querySelectorAll('[data-school-question]'))
            input.value = typeof payload?.answers?.[input.dataset.schoolQuestion] === 'string' ? payload.answers[input.dataset.schoolQuestion] : '';
        uploads = Array.isArray(payload?.fileIds) ? payload.fileIds.filter((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)).slice(0, 3) : [];
        renderFiles();
        if (payload?.schemaVersion === 2 && payload.formVersion !== formVersion)
            say('Your school changed its submission form. Your text is preserved. Review the current questions and check any images before sending.');
    }
    function validate() {
        if (new TextEncoder().encode(JSON.stringify(values())).length > 16000)
            throw new Error('Your school answers are too long together. Shorten them before continuing.');
        if (uploading)
            throw new Error('Wait for the supporting image upload to finish.');
        for (const input of document.querySelectorAll('[data-school-question]'))
            if (!input.checkValidity()) {
                input.reportValidity();
                throw new Error('Complete the school’s required questions before continuing.');
            }
        if (schema.attachments === 'off' && uploads.length)
            throw new Error('Your school disabled images. Remove the staged images before sending.');
        if (schema.attachments === 'required' && !uploads.length)
            throw new Error('Your school requires at least one supporting image.');
        if (!configuration.features.anonymous && !document.getElementById('sf-auth-config')?.dataset.user) {
            window.openAuthModal?.('signin');
            throw new Error('Sign in to submit to this school. Anonymous submissions are disabled.');
        }
    }
    function updateSchema(next) {
        if (!next?.form || !fields)
            return;
        const previous = values();
        for (const q of schema.questions)
            if (previous[q.id] && !next.form.questions.some((item) => item.id === q.id && item.label === q.label && (item.type !== 'choice' || item.options.includes(previous[q.id]))))
                preserve(q.label, previous[q.id]);
        schema = next.form;
        formVersion = next.formVersion || null;
        configuration.features = next.features;
        configuration.form = next.form;
        configuration.formVersion = formVersion;
        Object.assign(window.sfSchoolCustomization || {}, { form: next.form, formVersion, features: next.features });
        fields.replaceChildren();
        for (const q of schema.questions) {
            const label = document.createElement('label');
            label.className = 'school-question';
            const text = document.createElement('span');
            text.textContent = q.label + (q.required ? ' *' : '');
            label.append(text);
            let input;
            if (q.type === 'choice') {
                const select = document.createElement('select');
                const empty = document.createElement('option');
                empty.value = '';
                empty.textContent = 'Choose an answer';
                select.append(empty);
                for (const choice of q.options) {
                    const option = document.createElement('option');
                    option.value = choice;
                    option.textContent = choice;
                    select.append(option);
                }
                input = select;
            }
            else {
                const area = document.createElement('textarea');
                area.rows = q.type === 'long' ? 4 : 2;
                area.maxLength = q.type === 'long' ? 1000 : 200;
                input = area;
            }
            input.className = 'workspace-input';
            input.dataset.schoolQuestion = q.id;
            input.required = q.required;
            input.value = q.type === 'choice' && !q.options.includes(previous[q.id]) ? '' : previous[q.id] || '';
            label.append(input);
            if (q.help) {
                const hint = document.createElement('small');
                hint.textContent = q.help;
                label.append(hint);
            }
            fields.append(label);
        }
        const wrapper = document.querySelector('[data-school-attachment-fields]');
        if (wrapper) {
            wrapper.replaceChildren();
            if (schema.attachments !== 'off' || uploads.length) {
                const label = document.createElement('label');
                label.className = 'school-question';
                label.textContent = 'Supporting images ' + (schema.attachments === 'required' ? '(at least one required)' : schema.attachments === 'off' ? '(remove images to continue)' : '(optional)');
                if (schema.attachments !== 'off') {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/webp';
                    input.multiple = true;
                    input.dataset.submissionImages = '';
                    label.append(input);
                }
                const list = document.createElement('ul');
                list.dataset.submissionUploadList = '';
                const status = document.createElement('p');
                status.dataset.submissionUploadStatus = '';
                status.setAttribute('role', 'status');
                wrapper.append(label, list, status);
            }
        }
        if (Array.isArray(next.categories)) {
            const grid = document.querySelector('.sip-cat-grid'), selected = document.querySelector('input[name="sip-category"]:checked')?.value;
            if (grid) {
                const defaults = JSON.parse(grid.dataset.defaultIcons || '{}');
                grid.replaceChildren();
                for (const category of next.categories.filter((c) => c.active)) {
                    const label = document.createElement('label');
                    label.className = 'sip-cat-card';
                    label.id = 'cat-card-' + category.id;
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'sip-category';
                    radio.value = category.id;
                    radio.dataset.categoryName = category.name;
                    radio.className = 'sip-cat-radio';
                    radio.required = true;
                    radio.checked = category.id === selected;
                    radio.dataset.sfChange = 'action-116';
                    const icon = document.createElement('div');
                    icon.className = 'sip-cat-icon-wrap';
                    icon.setAttribute('aria-hidden', 'true');
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    for (const [key, value] of Object.entries({ width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }))
                        svg.setAttribute(key, value);
                    const use = document.createElementNS(svg.namespaceURI, 'use');
                    const defaultIcon = defaults[category.name.trim().toLowerCase()];
                    const name = category.icon && category.icon !== 'message' ? category.icon : typeof defaultIcon === 'string' ? defaultIcon : 'message';
                    use.setAttribute('href', '#ws-' + name);
                    svg.append(use);
                    icon.append(svg);
                    const content = document.createElement('div');
                    content.className = 'sip-cat-card-content';
                    const header = document.createElement('div');
                    header.className = 'sip-cat-card-header';
                    const title = document.createElement('span');
                    title.className = 'sip-cat-card-title';
                    title.textContent = category.name;
                    const check = document.createElement('span');
                    check.className = 'sip-cat-check-dot';
                    header.append(title, check);
                    const description = document.createElement('div');
                    description.className = 'sip-cat-card-sub';
                    description.textContent = category.description || 'Share feedback and suggestions about this topic.';
                    content.append(header, description);
                    label.append(radio, icon, content);
                    grid.append(label);
                }
                if (!document.querySelector('input[name="sip-category"]:checked'))
                    window.sfRestoreSubmissionStep?.(false);
            }
        }
        const anonymous = document.getElementById('sip-anon');
        if (anonymous) {
            anonymous.disabled = !next.features.anonymous;
            if (anonymous.disabled)
                anonymous.checked = false;
        }
        document.body.classList.toggle('school-anonymous-off', !next.features.anonymous);
        renderFiles();
        renderPreserved();
        document.getElementById('submit-idea-form')?.dispatchEvent(new Event('input', { bubbles: true }));
        say('The school form changed. Your title, description and earlier answers are preserved. Review the updated questions and images before sending.');
    }
    async function post(path, body) { const response = await sfSchoolFetch('/api/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok || !result.success)
        throw new Error(result.error || 'Image upload failed.'); return result; }
    function renderFiles() { const list = document.querySelector('[data-submission-upload-list]'); if (!list)
        return; list.replaceChildren(); for (const [index, id] of uploads.entries()) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = sfSchoolPath('/api/submission-files/' + id);
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Supporting image ' + (index + 1);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'workspace-button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async () => { try {
            const response = await sfSchoolFetch('/api/submission-files/' + id, { method: 'DELETE', credentials: 'same-origin' });
            if (!response.ok)
                throw new Error('The image could not be removed.');
            uploads = uploads.filter(value => value !== id);
            renderFiles();
            document.getElementById('submit-idea-form')?.dispatchEvent(new Event('input', { bubbles: true }));
        }
        catch (error) {
            say(error instanceof Error ? error.message : 'The image could not be removed.');
        } });
        li.append(link, remove);
        list.append(li);
    } }
    document.addEventListener('change', async (event) => { const input = event.target; if (!input.matches('[data-submission-images]'))
        return; if (uploading || !input.files?.length)
        return; const files = Array.from(input.files); if (files.length + uploads.length > 3 || files.some(file => file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
        say('Choose up to three PNG, JPEG or WebP images, no larger than 5 MB each.');
        input.value = '';
        return;
    } uploading = true; input.disabled = true; say('Uploading and validating supporting images…'); try {
        const contextResponse = await sfSchoolFetch('/api/submission-context', { credentials: 'same-origin', cache: 'no-store' });
        const context = await contextResponse.json();
        if (!contextResponse.ok || !context.success)
            throw new Error('Reopen the idea form before uploading.');
        for (const file of files) {
            const intent = await post('submission-files/intent', { actor: context.actor, size: file.size });
            const uploaded = await fetch(intent.url, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
            if (!uploaded.ok)
                throw new Error('Image upload failed. Try again.');
            const result = await post('submission-files/finalize', { actor: context.actor, id: intent.id });
            uploads.push(result.id);
            renderFiles();
        }
        say('Images uploaded privately. Complete the idea and submit to attach them. Unsubmitted images expire after one day.');
        document.getElementById('submit-idea-form')?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    catch (error) {
        say(error instanceof Error ? error.message : 'Image upload failed.');
    }
    finally {
        uploading = false;
        input.disabled = false;
        input.value = '';
    } });
    Object.assign(window, { sfSchoolForm: { extra, restore, validate, updateSchema, draftExtra: () => ({ previousAnswers: preserved }), reset: () => { uploads = []; preserved = []; renderFiles(); renderPreserved(); } } });
})();
