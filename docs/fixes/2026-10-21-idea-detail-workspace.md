# Full idea detail workspace

The full idea template rendered author/staff private-answer actions before its page container. Its page padding, minimum panel heights, and viewport calculations also ignored the school context bar. This pushed the panel and composer below the screen.

Moved Back into the panel header alongside the tags. Private submission details now appear in a collapsed, explained section inside the details pane with the existing owner/staff visibility checks and destinations. The idea title is the page's h1. Scoped styles bound only the full idea route to the available viewport; long details/discussion scroll internally with keyboard focus and native scroll handling. Mobile retains its existing details/comments tabs and bottom navigation. Empty history containers do not create blank cards. Popup styles and behavior are unchanged.

Verification: full Express type checking and production build passed. Local Chromium inspected long fictional content at 1440, 768, 375 and 320px: document height stayed at the 900px viewport; details wheel scrolling moved the pane 500px while document scroll remained zero. Header Back and private details were inside the panel. Mobile comment tab switched content and selected state. Screenshots inspected for desktop and mobile, including school context and bottom navigation.

No automated test suite or hosted data writes. Live authenticated production behavior and email were not exercised. Local history endpoints were not provided by this isolated fixture, so their fallback errors are fixture limitations, not a claim about live services.
