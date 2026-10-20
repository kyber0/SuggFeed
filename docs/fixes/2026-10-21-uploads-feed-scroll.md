# Upload controls and feed scrolling

## Changes

- One shared progressive enhancement styles existing file inputs as accessible drop areas. It retains the original input, form fields, labels, accept rules, and upload handlers. Standard input/change events carry dropped files through the existing validation and upload paths.
- Covers studio branding, submission supporting images, staff evidence, and dynamically inserted file fields. Standalone studio and isolated preview load the same enhancement. Preview inputs stay disabled.
- Supports native browsing, multiple files where allowed, selected filenames, drop/type feedback, disabled controls, keyboard focus, native reset, and teardown. No new dependency or upload endpoint.
- Desktop feed uses independently scrolling idea and sidebar panes, keeping the header stationary. The feed viewport rule explicitly outranks Lenis's automatic body height. Native nested scrolling avoids scroll chaining; mobile retains document scrolling.
- Feed pane positions are saved in the current history entry after scrolling/on page exit and restored on Back/Forward. Existing animation checks now target the appropriate scroller.

## Verification

Node 22 full Express type checking and production build passed. Local Chromium inspection confirmed original upload change handlers receive dropped files, single-file controls reject multiple drops, hints remain associated, form reset clears selection/errors, dynamic controls are enhanced, and disabled controls stay unavailable.

At 1440px, a center wheel gesture moved the idea pane to 650px with root and sidebars at zero; a sidebar gesture subsequently moved only that sidebar to 400px. Header stayed at zero. At 375px, root scrolling moved 500px without horizontal overflow. Upload and feed screenshots were inspected. Keyboard PageDown moves the focused feed pane. Back navigation restored the idea pane to its saved 700px position.

No automated test suites were run. No production uploads or live deployment were exercised. Backend upload permissions, file size/content validation, and submission behavior continue to be owned by existing handlers.
