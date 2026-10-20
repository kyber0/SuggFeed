"use strict";
var SfMotion;
(function (SfMotion) {
    SfMotion.factories.push(context => {
        const records = new Map(), active = new Set();
        const restore = (heading) => { for (const record of records.get(heading) || []) {
            const first = record.nodes[0];
            if (first?.parentNode) {
                first.parentNode.insertBefore(record.original, first);
                record.nodes.forEach(node => node.parentNode?.removeChild(node));
            }
        } records.delete(heading); };
        return { refresh(root) {
                if (SfMotion.editing() || !Element.prototype.animate)
                    return;
                for (const heading of SfMotion.elements(root, '[data-sf-split-text="words"]')) {
                    if (records.has(heading) || SfMotion.blocked(heading))
                        continue;
                    const tree = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT), texts = [];
                    let node;
                    while ((node = tree.nextNode()))
                        if (node.textContent?.trim() && !node.parentElement?.closest('script,style,[aria-hidden="true"]'))
                            texts.push(node);
                    const words = [], originals = [];
                    for (const text of texts) {
                        const fragment = document.createDocumentFragment(), nodes = [];
                        for (const part of text.data.split(/(\s+)/)) {
                            if (!part)
                                continue;
                            let child;
                            if (/^\s+$/.test(part))
                                child = document.createTextNode(part);
                            else {
                                const span = document.createElement('span');
                                span.dataset.sfWord = '';
                                span.dataset.sfGenerated = '';
                                span.textContent = part;
                                words.push(span);
                                child = span;
                            }
                            nodes.push(child);
                            fragment.append(child);
                        }
                        text.replaceWith(fragment);
                        originals.push({ original: text, nodes });
                    }
                    records.set(heading, originals);
                    if (context.seen.has(heading))
                        continue;
                    context.seen.add(heading);
                    const interval = Math.min(SfMotion.config.stagger, (SfMotion.config.headline - SfMotion.config.word) / Math.max(1, words.length - 1));
                    words.forEach((word, index) => { const animation = word.animate([{ opacity: .9 }, { opacity: 1 }], { duration: SfMotion.config.word, delay: index * interval, easing: SfMotion.config.ease }); active.add(animation); animation.onfinish = animation.oncancel = () => active.delete(animation); });
                }
            }, remove(root) { for (const heading of records.keys())
                if (root === heading || (root instanceof Node && root.contains(heading)))
                    restore(heading); }, pause(value) { if (value)
                active.forEach(animation => animation.finish()); }, destroy() { active.forEach(animation => animation.cancel()); active.clear(); for (const heading of records.keys())
                restore(heading); } };
    });
})(SfMotion || (SfMotion = {}));
