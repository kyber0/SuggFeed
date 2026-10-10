"use strict";
/** Typed event bindings for server-rendered and dynamically loaded UI. */
(function () {
    function sfEscapeAttribute(value) {
        return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    }
    Object.assign(window, { sfEscapeAttribute });
    const actions = {
        'expand-comment': (_event, element) => { element.closest('form')?.classList.add('expanded'); },
        'action-27': (event, element) => { const actionEvent = event; sfSetLeftTopic('All'); },
        'action-28': (event, element) => { const actionEvent = event; sfSetLeftTopic(element.getAttribute('data-sf-click-arg-0')); },
        'action-29': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-30': (event, element) => { const actionEvent = event; sfFeedSearch(element.value); },
        'action-31': (event, element) => { const actionEvent = event; sfClearSearch(); },
        'action-32': (event, element) => { const actionEvent = event; sfSetSort('all'); },
        'action-33': (event, element) => { const actionEvent = event; sfSetSort('popular'); },
        'action-34': (event, element) => { const actionEvent = event; sfToggleTopicsChips(); },
        'action-35': (event, element) => { const actionEvent = event; location.reload(); },
        'action-36': (event, element) => { const actionEvent = event; sfSetTopic('All'); },
        'action-37': (event, element) => { const actionEvent = event; sfSetTopic(element.getAttribute('data-sf-click-arg-0')); },
        'action-38': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-39': (event, element) => { const actionEvent = event; if (!actionEvent.ctrlKey && !actionEvent.metaKey) {
            actionEvent.preventDefault();
            sfOpenIdeaDetail(element.getAttribute('data-sf-click-arg-0'));
        } ; },
        'action-40': (event, element) => { const actionEvent = event; if (actionEvent.key === 'Enter')
            sfOpenIdeaDetail(element.getAttribute('data-sf-keydown-arg-0')); },
        'action-41': (event, element) => { const actionEvent = event; actionEvent.stopPropagation(); },
        'action-42': (event, element) => { const actionEvent = event; sfOpenIdeaDetail(element.getAttribute('data-sf-click-arg-0'), 'details'); },
        'action-43': (event, element) => { const actionEvent = event; actionEvent.stopPropagation(); },
        'action-44': (event, element) => { const actionEvent = event; sfVoteFeed(element.getAttribute('data-sf-click-arg-0'), element); },
        'action-45': (event, element) => { const actionEvent = event; sfOpenIdeaDetail(element.getAttribute('data-sf-click-arg-0'), 'comments'); },
        'action-46': (event, element) => { const actionEvent = event; sfBookmarkPost(element.getAttribute('data-sf-click-arg-0'), element, actionEvent); },
        'action-47': (event, element) => { const actionEvent = event; sfSharePost(element.getAttribute('data-sf-click-arg-0'), actionEvent, element); },
        'action-48': (event, element) => { const actionEvent = event; sfLoadMoreFeed(); },
        'action-49': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-50': (event, element) => { const actionEvent = event; sfCloseMobileFilter(); },
        'action-51': (event, element) => { const actionEvent = event; actionEvent.stopPropagation(); },
        'action-52': (event, element) => { const actionEvent = event; sfCloseMobileFilter(); },
        'action-53': (event, element) => { const actionEvent = event; sfSetSort('all'); sfCloseMobileFilter(); },
        'action-54': (event, element) => { const actionEvent = event; sfSetSort('popular'); sfCloseMobileFilter(); },
        'action-55': (event, element) => { const actionEvent = event; sfSetTopic('All'); sfCloseMobileFilter(); },
        'action-56': (event, element) => { const actionEvent = event; sfSetTopic(element.getAttribute('data-sf-click-arg-0')); sfCloseMobileFilter(); },
        'action-57': (event, element) => { const actionEvent = event; sfCloseMobileFilter(); },
        'action-58': (event, element) => { const actionEvent = event; sfSwitchTab('share'); },
        'action-59': (event, element) => { const actionEvent = event; sfSwitchTab('track'); },
        'action-60': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-61': (event, element) => { const actionEvent = event; openSubmitPanel('Facilities'); },
        'action-62': (event, element) => { const actionEvent = event; openSubmitPanel('Learning'); },
        'action-63': (event, element) => { const actionEvent = event; openSubmitPanel('Safety'); },
        'action-64': (event, element) => { const actionEvent = event; openSubmitPanel('Student life'); },
        'action-65': (event, element) => { const actionEvent = event; openSubmitPanel('Other'); },
        'action-66': (event, element) => { const actionEvent = event; sfTrackSubmission(actionEvent); },
        'action-67': (event, element) => { const actionEvent = event; element.value = element.value.toUpperCase(); sfTrackInputChanged(); },
        'action-68': (event, element) => { const actionEvent = event; sfClearTrack(); },
        'action-69': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-70': (event, element) => { const actionEvent = event; sfFilterFeed(); },
        'action-71': (event, element) => { const actionEvent = event; sfClearSearch(); },
        'action-72': (event, element) => { const actionEvent = event; actionEvent.stopPropagation(); },
        'action-73': (event, element) => { const actionEvent = event; sfToggleSortMenu(); },
        'action-74': (event, element) => { const actionEvent = event; sfSetSortOption('popular', 'Most Supported'); },
        'action-75': (event, element) => { const actionEvent = event; sfSetSortOption('newest', 'Newest First'); },
        'action-76': (event, element) => { const actionEvent = event; sfSetSortOption('oldest', 'Oldest First'); },
        'action-77': (event, element) => { const actionEvent = event; sfSetCategory(element, 'All'); },
        'action-78': (event, element) => { const actionEvent = event; sfSetCategory(element, element.getAttribute('data-sf-click-arg-0')); },
        'action-79': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-80': (event, element) => { const actionEvent = event; actionEvent.stopPropagation(); sfVote(element.getAttribute('data-sf-click-arg-0'), element); },
        'action-81': (event, element) => { const actionEvent = event; sfResetFilters(); },
        'action-82': (event, element) => { const actionEvent = event; sfShareIdea(); },
        'action-83': (event, element) => { const actionEvent = event; sfSetMobileDetailTab('details'); },
        'action-84': (event, element) => { const actionEvent = event; sfSetMobileDetailTab('comments'); },
        'action-85': (event, element) => { const actionEvent = event; sfVoteDetail(element.getAttribute('data-sf-click-arg-0')); },
        'action-86': (event, element) => { const actionEvent = event; sfSetMobileDetailTab('comments'); },
        'action-87': (event, element) => { const actionEvent = event; sfSetMobileDetailTab('details'); },
        'action-88': (event, element) => { const actionEvent = event; sfReplyTo(element.dataset.replyId, element.dataset.replyAuthor); },
        'action-89': (event, element) => { const actionEvent = event; sfReplyTo(element.dataset.replyId, element.dataset.replyAuthor); },
        'action-90': (event, element) => { const actionEvent = event; sfSubmitComment(actionEvent, element.getAttribute('data-sf-submit-arg-0')); },
        'action-91': (event, element) => { const actionEvent = event; sfCancelReply(); },
        'action-92': (event, element) => { const actionEvent = event; sfCommentInputChanged(element); },
        'action-93': (event, element) => { const actionEvent = event; sfCollapseComposer(); },
        'action-94': (event, element) => { const actionEvent = event; openAuthModal('signin'); },
        'action-95': (event, element) => { const actionEvent = event; sfToggleTheme(); },
        'action-96': (event, element) => { const actionEvent = event; sfCloseIdeaDrawer(); },
        'action-97': (event, element) => { const actionEvent = event; sfDrawerShare(); },
        'action-98': (event, element) => { const actionEvent = event; sfCloseIdeaDrawer(); },
        'action-99': (event, element) => { const actionEvent = event; sfSetDrawerMobileTab('details'); },
        'action-100': (event, element) => { const actionEvent = event; sfSetDrawerMobileTab('comments'); },
        'action-101': (event, element) => { const actionEvent = event; sfDrawerVote(); },
        'action-102': (event, element) => { const actionEvent = event; sfSetDrawerMobileTab('comments'); },
        'action-103': (event, element) => { const actionEvent = event; sfSetDrawerMobileTab('details'); },
        'action-104': (event, element) => { const actionEvent = event; sfSubmitDrawerComment(actionEvent); },
        'action-105': (event, element) => { const actionEvent = event; sfCancelDrawerReply(); },
        'action-106': (event, element) => { const actionEvent = event; sfDrawerCommentInputChanged(element); },
        'action-107': (event, element) => { const actionEvent = event; sfCollapseDrawerComposer(); },
        'action-108': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-109': (event, element) => { const actionEvent = event; closeSubmitPanel(); },
        'action-110': (event, element) => { const actionEvent = event; closeSubmitPanel(); },
        'action-111': (event, element) => { const actionEvent = event; closeSubmitPanel(); },
        'action-112': (event, element) => { const actionEvent = event; goToStep(1); },
        'action-113': (event, element) => { const actionEvent = event; goToStep(2); },
        'action-114': (event, element) => { const actionEvent = event; goToStep(3); },
        'action-115': (event, element) => { const actionEvent = event; handleIdeaSubmit(actionEvent); },
        'action-116': (event, element) => { const actionEvent = event; onCategorySelected('Facilities'); },
        'action-117': (event, element) => { const actionEvent = event; onCategorySelected('Learning'); },
        'action-118': (event, element) => { const actionEvent = event; onCategorySelected('Safety'); },
        'action-119': (event, element) => { const actionEvent = event; onCategorySelected('Student life'); },
        'action-120': (event, element) => { const actionEvent = event; onCategorySelected('Other'); },
        'action-121': (event, element) => { const actionEvent = event; handleTitleInput(); },
        'action-122': (event, element) => { const actionEvent = event; handleDescInput(); },
        'action-123': (event, element) => { const actionEvent = event; handleAnonToggle(); },
        'action-124': (event, element) => { const actionEvent = event; goToStep(2); },
        'action-125': (event, element) => { const actionEvent = event; handleConsentChange(); },
        'action-126': (event, element) => { const actionEvent = event; copyTrackingCode(); },
        'action-127': (event, element) => { const actionEvent = event; if (actionEvent.key === 'Enter' || actionEvent.key === ' ')
            copyTrackingCode(); },
        'action-128': (event, element) => { const actionEvent = event; actionEvent.stopPropagation(); copyTrackingCode(); },
        'action-129': (event, element) => { const actionEvent = event; closeSubmitPanel(); },
        'action-130': (event, element) => { const actionEvent = event; sipPrevStep(); },
        'action-131': (event, element) => { const actionEvent = event; sipNextStep(); },
        'action-132': (event, element) => { const actionEvent = event; openAuthModal('signin'); },
        'action-133': (event, element) => { const actionEvent = event; sfToggleSettings(); },
        'action-134': (event, element) => { const actionEvent = event; openAuthModal('signin'); },
        'action-135': (event, element) => { const actionEvent = event; openAuthModal('signup'); },
        'action-136': (event, element) => { const actionEvent = event; sfSaveProfilePrefs(); },
        'action-137': (event, element) => { const actionEvent = event; sfSetProfileTab('submissions'); },
        'action-138': (event, element) => { const actionEvent = event; sfSetProfileTab('bookmarks'); },
        'action-139': (event, element) => { const actionEvent = event; sfSetProfileTab('shared'); },
        'action-140': (event, element) => { const actionEvent = event; sfSetProfileTab('voted'); },
        'action-141': (event, element) => { const actionEvent = event; openSubmitPanel(); },
        'action-162': (event, element) => { const actionEvent = event; window.location.reload(); },
        'open-detail': (event, element) => {
            const click = event;
            if (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey || (typeof click.button === 'number' && click.button !== 0))
                return;
            if (typeof sfOpenIdeaDetail !== 'function')
                return;
            event.preventDefault();
            sfOpenIdeaDetail(element.dataset.ideaId, element.dataset.tab || 'details');
        },
        'open-detail-key': (event, element) => { const actionEvent = event; if (actionEvent.key === 'Enter')
            sfOpenIdeaDetail(element.dataset.ideaId); },
        'stop': (event, element) => { const actionEvent = event; event.stopPropagation(); },
        'vote-feed': (event, element) => { const actionEvent = event; sfVoteFeed(element.dataset.id, element); },
        'comment-feed': (event, element) => { const actionEvent = event; sfOpenIdeaDetail(element.dataset.ideaId, 'comments'); },
        'bookmark-feed': (event, element) => { const actionEvent = event; sfBookmarkPost(element.dataset.id, element, event); },
        'share-feed': (event, element) => { const actionEvent = event; sfSharePost(element.dataset.id, event, element); },
        'reply-idea': (event, element) => { const actionEvent = event; sfReplyTo(element.dataset.replyId, element.dataset.replyAuthor); },
        'reply-drawer': (event, element) => { const actionEvent = event; sfDrawerReplyTo(element.dataset.replyId, element.dataset.replyAuthor); }
    };
    ['click', 'input', 'change', 'submit', 'keydown', 'focusin'].forEach(type => {
        document.addEventListener(type, event => {
            let element = event.target instanceof Element ? event.target : null;
            while (element) {
                const action = element.getAttribute('data-sf-' + type);
                if (action && actions[action])
                    actions[action](event, element);
                if (event.cancelBubble) {
                    event.stopImmediatePropagation();
                    break;
                }
                element = element.parentElement;
            }
        });
    });
})();
