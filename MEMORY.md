# Curated Long-Term Memory (MEMORY.md)

## Core Architectures & Feature Pipelines

### Storyboard Studio (Sprint 5)
- **Feature**: Professional 4-Section Structured Storyboards.
- **Goal**: Transition from a single grid-image prompt to a structured storyboard plan mapping style, environment, timings, and cuts.
- **Workflow**:
  - `storyboardDirector.js` outputs a structured JSON representing:
    - colorPalette / paletteNames / materialNotes
    - environmentFingerprint
    - cuts[]: lens, duration, move, shot, scene, framePrompt
    - moodKeywords, cinematographyRules, emotionalArc
  - At animate-time, `generateAnimateVideoPrompt()` builds a timed, rich video prompt with correct `@imageN` references targeting product images, avatars, style refs, and logos.
  - Review UI displays all 4 sections in a modern, dark-themed panel.
- **Gotchas / Learnings**:
  - The storyboard grid poster (`imageUrl`) should only be a `style_reference` during video generation, not the first frame. The product or avatar image acts as the first frame.
  - Subsequent scenes chain using the last frame of the previous scene.
  - Always clean up duplicate schema fields (e.g. `totalDuration`) to avoid validation/consistency confusion.

### Storyboard Audio Sync & Localized Voiceovers (Sprint 9)
- **Feature**: Audio Sync Toggle & Native Voiceover Script Generation.
- **Goal**: Allow users to toggle whether the final video compiled in Storyboard Studio matches the uploaded audio brief ("Sync Audio") or is a video-only compile ("Just Video"). Also, strengthen the director agent to decide if a voiceover is required and write native script voiceover lines in the selected language.
- **Workflow**:
  - `storyboardDirector.js` prompt updated to include a `voiceover` field per cut. The agent writes natural, localized voiceover lines in the selected dialogue language's native script (e.g., Devanagari script for Hindi).
  - The parsed voiceover lines are joined into a unified, editable `voiceoverScript` textarea on the review screen.
  - The user can toggle "Sync Audio" / "Just Video" at the creation phase or review phase. If "Just Video" is chosen, `refAudio` is set to empty when starting the long-form job or compiling segments, skipping the FFmpeg mixing phase.
- **Learnings / Gotchas**:
  - Storing the selected `audioSync` state (Boolean) on the mongoose `VideoProject` ensures that manual compiles (`/storyboard/compile`) and background jobs (`storyboardLongForm.js`) behave consistently when mixed or stitched.

### Gemini Omni Flash Long-Form Video Support (Sprint 8)
- **Feature**: Sequential multi-segment generation and model mapping harmonization.
- **Goal**: Resolve the 10-second limit for Gemini Flash (`gemini-flash` and `gemini-omni-flash`) in both Advanced Mode and Storyboard Studio.
- **Workflow**:
  - **Dynamic Long-Form Threshold**: Threshold for Storyboard segmenting (`isLongForm`) is dynamically adjusted to `10s` for Gemini models (vs. `15s` for Seedance/others).
  - **Advanced Mode Sequential Pipeline**: Refactored `advancedGenerateNode` to support a sequential generator loop when `duration > 10` for Gemini.
  - **Segmenting & Chaining**: Divides total duration into optimal segments ($\le 10$ seconds, $\ge 4$ seconds). Generates segment $N$, extracts its last frame via FFmpeg, uploads it to S3, and passes it as the first frame (`imageUrl`) to segment $N+1$ to ensure visual continuity.
  - **Stitching**: Concat-stitches all completed segments into a single final video using the `stitchVideoClips` utility.
- **Gotchas / Learnings**:
  - Model mappings must support both the database identifier (`gemini-omni-flash`) and the frontend identifier (`gemini-flash`) to prevent config mismatches and fallback errors.

### Visual Grounding & Competitor Style References (Sprint 6)
- **Feature**: Competitor Style Referencing & Human Presence Mandate.
- **Goal**: Elevate aesthetic quality of generated social media visuals by integrating competitor references and mandating human casting.
- **Workflow**:
  - `brandScanner.js` extracts up to 3 style reference image URLs per competitor during onboarding.
  - `brandIntelligenceNode` maps `brand.dna.competitiveIntel.competitorImages` to state.
  - `visualGroundingNode` gathers competitor images (up to 3, keeping combined max under 5) and includes them in MCoT.
  - `prompts.js` (`VISUAL_GROUNDING_PROMPT`) analyzes competitor layout, colors, lighting, and human composition rules while strictly ignoring logos, text, or trademarked branding.
  - Strategy and calendar engines (`monthly-strategy.js`, `social-media-studio.js`) mandate human casting (target demographics, unposed candid settings, hands-on interactions) for 40-50% of visual posts on feed platforms.
- **Gotchas / Learnings**:
  - Standardizing relative to absolute URL resolution in `web-research.js` is critical to prevent broken image references from reaching the vision LLM.
  - Capping the total images in visual grounding to 5 (prioritized: user ref images > matched product images > competitor references > brand DNA) ensures API call stability and cost-efficiency.

### Pulse Studio & Product Intelligence (Sprint 6/7)
- **Feature**: Context-Aware Product Intelligence (PDI) & Robust Scraper.
- **Goal**: Prevent vision LLMs from misidentifying device form-factors in a vacuum and avoid scraping trust badges/icons.
- **Workflow**:
  - `classifyProductImageView` accepts scraped `productData` (title, category, shortDescription) and prepends it as a context string to the multimodal prompt.
  - This prevents the vision LLM from misidentifying abstract folding device structures (like the FlexiPod stand) as headphones.
  - Expanded `shopifyGallerySelectors` in `brand-studio.js` with custom theme selectors (`.productView-thumbnail-link img`, `.productView-thumbnail img`, `.productView-image img`, etc.) to scrape only true product photos.
- **Learnings**:
  - Vision AI models analyzing product images in a vacuum are prone to form-factor hallucinations (e.g. geometric stands resembling headphones). Surrounding them with product title/listing metadata locks in high-confidence correct classifications.
  - Custom Shopify themes (like Halo) don't use standard Dawn selectors. Explicitly targeting thumbnails and containers is required to filter out policy and trust icons.

### Creative Studio Prompt Enhance (Sprint 7)
- **Feature**: MCoT Visual Grounding & Robust Prompt Enhancement.
- **Goal**: Resolve silent prompt enhancement failures in Creative Studio's AI Create panel.
- **Workflow**:
  - The `/enhance-prompt` route calls the fast agentic pipeline (`runCreativePipeline`), which front-loads MCoT visual grounding context.
  - Separates this grounding block from the engineered prompt with a double-newline `\n\n`.
  - Backend route strips the grounding block before returning it to the user so they only see the styled text prompt.
- **Learnings / Gotchas**:
  - If the grounding block lacks a trailing double-newline, the main prompt concatenates directly, corrupting the text and causing the `.indexOf('\n\n')` cleanup parser to fail and return an empty string (`""`).
  - Added a robust line-by-line fallback parser in `creatives.js` that splits on newlines and filters out any metadata prefix lines if double-newlines are missing.

### TikTok Photo & Video Publishing (Sprint 7)
- **Feature**: TikTok Direct Photo & Video Publishing.
- **Goal**: Resolve publishing failures when users post non-video assets (single image or carousel) to connected TikTok accounts.
- **Workflow**:
  - TikTok Content Posting API v2 requires `/v2/post/publish/video/init/` for videos, and `/v2/post/publish/content/init/` with `media_type: "PHOTO"` and `post_mode: "DIRECT_POST"` for photo/carousel posts.
  - S3-hosted assets are sent directly to TikTok to pull.
  - Dynamically switches the API call depending on whether a `videoUrl` is present vs `imageUrl`/`imageUrls`.
- **Learnings**:
  - The API privacy level for v2 is `PUBLIC_TO_EVERYONE`, not `PUBLIC` (which was an older value and gets rejected).
  - Verify account permissions and visibility settings dynamically via the creator info query endpoint (`/v2/post/publish/creator_info/query/`) to see supported configurations.

### Brand Kit Studio — Identity System & Safe Credit Routing (Sprint 8)
- **Feature**: Identity System boards, data URI upload handling, visual consistency pipeline, and secure credit deduction routing.
- **Goal**: Enable users to upload existing logos or generate new ones, produce visually unified identity system boards (logo variations, palette swatches, type specimens) via `gpt-image-2`, and ensure all marks, stamps, and collateral mockups look like direct visual derivatives of the primary brand logo.
- **Workflow**:
  - `identityAgent.js` maps `existingLogoUrl` (supporting user uploads and pre-existing database `brand.dna.logo.url`) to Claude Art Director to engineer hyper-specific prompts.
  - **Visual Consistency Pipeline**: If no logo exists, the system runs in two stages:
    1. Generates the primary `identity-system-light` board via text-to-image.
    2. Mirrors the board to S3, extracts the URL, and uses it as the reference image (`lightBoardRefUrl`) to generate the remaining 4 assets (`identity-system-dark`, `identity-collateral`, `logo-icon-mark`, `brand-stamp`) in parallel.
  - Image generation utilizes `laozhangGptImageWithRefs` (with image reference) or `laozhangImageGenerate` (without reference).
  - In `laozhangClient.js`, `data:` URIs are parsed directly in-memory to base64 buffers rather than fetched, preventing network failures when using base64 uploaded files.
  - The `/wizard/generate` route is protected by verifying `identityResult`'s success before deducting credits from the user's account.
- **Learnings / Gotchas**:
  - Generating multiple visual identity assets in parallel from pure text leads to wild stylistic drift (completely different logo shapes and motifs). Generating the primary light system board first and passing it as a reference image to subsequent generations ensures absolute brand alignment.
  - Pre-parsing data URIs locally in memory avoids network exceptions and prevents fallback to lower-quality models.
  - If a brand already has a pre-existing logo in the database DNA, the agent must resolve it as the default `activeLogoUrl` (even if not passed in the request body) to prevent generating a new logo from scratch.

### Brand Kit Studio — Identity Context Propagation to All Studios (Sprint 8 follow-up)
- **Problem**: Stationery, Brand Guide, and Collection were generating assets completely disconnected from the brand's generated identity. They used plain text-to-image with no logo reference, causing every section to look like a different brand.
- **Root Cause (4 bugs)**:
  1. `runArtDirector()` resolved `activeLogoUrl` from DB/request internally but **never returned it** to callers — so stationery/collection had no access to it.
  2. `stationeryAgent.js` always called `laozhangImageGenerate()` (text-only) — never the reference-image mode.
  3. `collectionAgent.js` same problem — `laozhangImageGenerate()` only.
  4. Wizard ran identity + stationery + guide in `Promise.allSettled()` **simultaneously** — stationery started generating before the logo even existed.
- **Fix Architecture**:
  - `artDirectorAgent.js` — Added `activeLogoUrl` to the return object so every caller can use it.
  - `stationeryAgent.js` — Now uses `laozhangGptImageWithRefs(prompt, [activeLogoUrl])` when a logo exists; graceful text-only fallback when not.
  - `collectionAgent.js` — Same pattern: reference-image mode when logo available.
  - `brandGuideAgent.js` — Accepts `existingLogoUrl`, passes it to Art Director, and renders the actual brand identity image in the HTML Logo Usage section (not a blank placeholder).
  - `brand-kit.js` (Wizard) — **Sequential pipeline**: identity runs first → `logo-icon-mark` URL extracted → stationery + guide run in parallel, both receiving the logo URL as `existingLogoUrl`.
- **Key Pattern**: Every agent now follows: `existingLogoUrl (caller override)` → `resolvedLogoUrl (from artDirector/DB)` → `null (text-only fallback)`. This ensures the brand identity is always the visual source-of-truth.
- **Verification**: 14/14 automated checks passed, server restarted cleanly.

### Video Studio Canvas Copilot — Pass 2 Remediation (Sprint 8)
- **Feature**: Dynamic palette surfacing, list fan-out execution engine, bound handlers, and missing nodes block.
- **Goal**: Bring all 30 nodes to DONE (V5 + L4) with real execution backings.
- **Workflow**:
  - **Dynamic Surfacing**: Frontend index.jsx fetches `/api/video-studio/agent/v2/node-catalog` on mount, storing it in Zustand. NodeMenu.jsx dynamically groups, sorts, and renders nodes from the Zustand store.
  - **List Fan-Out**: ListNode.jsx saves items in `data.params.items` via Command Bus. `resolveNodeInputs` parses/flattens JSON outputs for list/multi input ports. `executeGraphAsync` topological run loops $N$ times for checked items, isolating item failures, memoizing via `inputHash` and `params._batchRuns`, and broadcasting SSE events.
  - **Spend Gate Pricing**: Estimates and authorizes fanned-out runs as $N \times$ cost under a single spend-gate authorization.
  - **Real Backings**: Bound Sharp Lanczos (2K) and Fal Real-ESRGAN (4K) for upscale; Fal Outpaint directional aspect ratio expansion for reframe; Fal Sync Lipsync v2 Pro for lipsync; Fal AMT Frame Interpolation for frame_interpolate.
  - **Structured Blocked Provider Fallbacks**: Wired the 12 missing nodes (`variations`, `image_to_3d`, etc.) to throw structured `BLOCKED: provider` errors.
- **Key Pattern / Learnings**:
  - Always filter out unchecked items (`checked === false`) in batch loops.
  - Standardize batch list item shapes as `{ id, value }` objects, allowing downstream nodes to resolve `value` and track progress state by `id`.
  - Supply mock arguments or default params in test configurations to satisfy required input port checks on blocked nodes.

### Super Admin Templates Manager Preview Regeneration (Sprint 8)
- **Feature**: Live preview regeneration for existing templates in-place.
- **Goal**: Allow Super Admins to adjust prompt formulas and assets for existing templates and trigger a regeneration job that updates the existing template rather than spawning a duplicate.
- **Workflow**:
  - **Backend Mutability**: Removed the strict immutability constraint on `savedPrompt` in the `PUT /:id` template route, adding it to `ALLOWED_UPDATES`.
  - **In-Place Update Support**: Modified the POST `/generate` route to accept `templateId`. If provided, it finds the existing template and performs a `Template.findByIdAndUpdate` in-place, preserving `isActive`, `isPublished`, and `createdBy` flags. The video status polling logic matches the task ID to the template's `sourceJobId`, updating the S3 video URL on completion automatically.
  - **Frontend Editor**: Extended the Edit Template Modal with a live preview media container (images/videos) and a collapsible "AI Generation Parameters" section (Prompt formula textarea, AI Model, Duration, Format, and Upload/URL inputs for Avatar and Product Images). Added a **Regenerate Media** action button that submits the generation task and polls progress inside the modal.
- **Key Pattern / Learnings**:
  - In-place updating is highly cohesive when leveraging existing asynchronous polling systems (matching by `sourceJobId`). Changing the `sourceJobId` on the target template automatically chains it to the global status poller without changing any background handler logic.
  - Adding a preview of the active asset within the edit modal is critical to closing the loop for the user, allowing them to verify regeneration before saving.

### Backend LLM Error Recovery & Gemini Router Fallbacks (Sprint 9)
- **Feature**: Type safety for raw agent returns and automatic native Gemini routing fallbacks.
- **Goal**: Prevent type errors (`.trim is not a function`) when multimodal agents return structured errors during API outages/quota limits, and implement robust fallback paths to native Gemini if the primary Laozhang proxy fails.
- **Workflow**:
  - Added strict checks to verify that outputs of `callMultimodalAgent` with `returnRaw: true` are strings and do not contain `.error` keys before performing `.trim()` or regex replacements.
  - Initialized direct native Gemini provider as `'native_gemini'` in `ModelRouter` to make its name unique from the primary `'gemini'` (Laozhang proxy) provider.
  - Enhanced `getTextProvider()` and the `generateText()` fallback loop to route requests to `'native_gemini'` if the primary `'gemini'` provider hits billing limits, is in cooldown, or trips the circuit breaker.
- **Learnings**:
  - Downstream agents must never assume that LLM calls returning raw strings will succeed. If the underlying provider is rate-limited or out of credit, the agent helper returns a structured error object. Callers must validate the type and error keys before executing string manipulations.
  - Designing a parallel direct API client alongside a proxy client allows seamless failover fallback routing, keeping client studios functional even during billing or proxy outages.

### Video Generation Prompt Sanitization & Safety Bypass (Sprint 9)
- **Feature**: Banned Deity name substitution and dynamic proper name-to-role dynamic mapping.
- **Goal**: Prevent safety policy violations on AI video models (Seedance, Kling, Veo, Grok, Gemini) by sanitizing prompts pre-flight.
- **Workflow**:
  - `promptSanitizer.js` intercepts video prompts pre-flight and maps sensitive deities (e.g. Shiva, Ganesha, Jesus, Sai Baba) to safe visual/physical descriptions.
  - Proper names (common names and custom cast names) are scanned and dynamically replaced with generic roles (`"the presenter"`, `"the co-presenter"`, etc.) in order of appearance in the prompt.
  - Redundant prefix contexts (e.g. `"presenter the presenter"`) and phantom `@image` tags (referencing images not provided in the payload) are cleaned up.
  - Express routes `/ugc-pro/generate`, `/ugc-pro/qads/generate`, and `/ugc-pro/qads/v2/generate-video` fetch active cast names from MongoDB `Cast` model and feed them as `customCharacterNames` into the client functions.
  - Scoping is preserved for superadmins (bypassing the `userId` filter) to maintain administrative control.
- **Learnings / Gotchas**:
  - Sanitization must run *only* for video-generation prompts (not image or story generation prompts) and must preserve `@ImageN` tag formatting expected by providers for face/product locking.
  - Handling safe-mode retries on status routes requires fetching and sanitizing retry prompts with the same context to ensure they don't trigger subsequent blocks.

