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
