"use strict";
// Build dynamic empty states with text nodes; user input never becomes markup.
function sfEmptyState(options) {
    const state = document.createElement('div');
    state.className = 'sf-empty' + (options.compact ? ' sf-empty--compact' : '');
    const mark = document.createElement('span');
    mark.className = 'sf-empty-mark';
    mark.setAttribute('aria-hidden', 'true');
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), use = document.createElementNS(ns, 'use');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('focusable', 'false');
    use.setAttribute('href', '#ws-' + (options.icon || 'inbox'));
    svg.append(use);
    mark.append(svg);
    const heading = document.createElement('h3');
    heading.textContent = options.heading;
    const copy = document.createElement('p');
    copy.textContent = options.description;
    state.append(mark, heading, copy);
    if (options.href && options.label) {
        const actions = document.createElement('div');
        actions.className = 'sf-empty-actions';
        const link = document.createElement('a');
        link.className = 'sf-empty-action sf-empty-action--secondary';
        link.href = sfSchoolPath(options.href);
        link.textContent = options.label;
        actions.append(link);
        state.append(actions);
    }
    return state;
}
