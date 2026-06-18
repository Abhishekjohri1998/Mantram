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
- **Feature**: Identity System boards, data URI upload handling, and secure credit deduction routing.
- **Goal**: Enable users to upload existing logos, generate comprehensive visual identity system boards (logo variations, palette swatches, type specimens) via `gpt-image-2`, and ensure they are never charged credits for failed runs.
- **Workflow**:
  - `identityAgent.js` maps `existingLogoUrl` and `collateralBrief` to Claude Art Director to engineer hyper-specific prompts.
  - Image generation utilizes `laozhangGptImageWithRefs` (with image reference) or `laozhangImageGenerate` (without reference).
  - In `laozhangClient.js`, `data:` URIs are parsed directly in-memory to base64 buffers rather than fetched, preventing network failures when using base64 uploaded files.
  - `identityAgent.js` bypasses `mirrorUrlToS3` if the returned URL is already hosted in our S3 bucket.
  - The `/wizard/generate` route is protected by verifying `identityResult`'s success before deducting credits from the user's account.
- **Learnings / Gotchas**:
  - When users upload images as base64 strings in the body, trying to fetch them via Node `fetch` will fail. Pre-parsing data URIs locally in memory avoids network exceptions and prevents fallback to lower-quality models like Gemini-3.1-flash.
  - Credit deduction must only happen after verifying the core asset (Identity) generation. If the core visual asset fails to generate, the entire package (stationery, guide) becomes unusable, so the user should not be charged.



