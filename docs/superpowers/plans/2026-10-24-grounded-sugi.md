# Grounded Sugi implementation

Approved: natural answers supported by shared app help and the current school's published settings and reviewed documents; source links; unknown fallback; server-enforced school separation.

1. Add bounded plain-text/Markdown/PDF extraction and approved document drafts/publications. Reuse school-admin MFA, origin guards, revisions and service-only RPC patterns. Preserve optional FAQs.
2. Add a shared app guide and retrieve bounded excerpts from app help, published school documents and approved settings. Never load other schools, private student content, URLs or drafts.
3. Gemini writes a short answer with validated source IDs. Use existing budget/concurrency/circuit controls; plain-text output; unknown on missing evidence, failure or invalid citations. No generated-answer cache or raw-question logs. Keep exact FAQ fallback offline.
4. Replace the main school editor with title/body + document upload, Save draft and Publish. FAQs become optional. Display sources and the limits of generated answers.
5. Verify isolation, publication, extraction, provider failure/citation validation, API boundaries and responsive browser flows. Apply additive migration, publish authorized code, check live deployment.

Ruling: no vector/embedding service is needed for bounded school libraries. Use local lexical chunk ranking; send a small catalog for questions without exact keyword matches. This costs some semantic recall; Gemini can only use the selected approved excerpts.
Ruling: use one free server PDF extraction dependency (unpdf), bounded by bytes, pages, text, worker memory and timeout. Scanned image PDFs require a text version; no OCR or arbitrary URL fetch.
Ruling: school settings are read fresh from reviewed rows; documents and FAQ publication are independent and never activate a school or reset policy approval. Existing assistant AI opt-in stays authoritative.
