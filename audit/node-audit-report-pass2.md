# Node Implementation & Functionality Audit Report (Pass 2)
**Mantram Video Studio — Canvas Copilot Node Audit**  
**Date:** June 18, 2026  
**Auditor:** Antigravity (Advanced Agentic AI)

---

## 1. Summary

**8 of 30 nodes at DONE** · **6 INVISIBLE** · **4 VISIBLE-DEAD** · **12 MISSING**.

### Systemic Palette Gap
We identified a systemic surfacing bug: **6 nodes** (`assistant`, `sound_effects`, `video_audio_mix`, `list`, `group`, and `sticky_note`) are fully cataloged on the backend and registered in the React Flow viewport registry on the frontend, but are **completely absent** from the `CATEGORIES` array in `NodeMenu.jsx`. As a result, they are unreachable through the search bar and the `＋ Add Node` popup menu.

---

## 2. `List` Node Resolution

* **V1 Cataloged**: **Passed**. Defined in [nodeCatalog.js:L433](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L433).
* **V2 Registered**: **Passed**. Mapped to `ListNode` in [FlowCanvas.jsx:L65](file:///Users/dasachin/Desktop/Output/Mantram%20AI/frontend/src/components/VideoStudio/CanvasCopilot/canvas/FlowCanvas.jsx#L65).
* **V3 In palette**: **FAILED**. Missing from `CATEGORIES` in [NodeMenu.jsx](file:///Users/dasachin/Desktop/Output/Mantram%20AI/frontend/src/components/VideoStudio/CanvasCopilot/canvas/NodeMenu.jsx). A search for `"List"` in the UI returns no results.
* **Combined Status**: **`INVISIBLE`**.
* **Functionality Level**: **L2**. While it successfully processes inputs into a stringified JSON list, it does not support **batch fan-out** execution. Connecting a list of $N$ items to a generator executes the downstream generator only once with the entire array rather than looping to generate $N$ individual outputs.

---

## 3. Per-Node Audit Matrix

| Node | Visibility (max V reached) | Functionality (L) | Combined Status | Anti-fake | Negative Tests | Agent-Operable | Evidence (File + Output Reference) | Delta vs Pass 1 |
|---|---|---|---|---|---|---|---|---|
| **Upload** | V5 (Renders) | L4 | `DONE` | Yes (Custom URL input) | Yes (Type checks) | Yes | [nodeCatalog.js:L31](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L31) | Advanced (L1 → L4) |
| **Media** | V5 (Renders) | L4 | `DONE` | Yes (Custom URL input) | Yes (Type checks) | Yes | [nodeCatalog.js:L31](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L31) | Advanced (L1 → L4) |
| **Text** | V5 (Renders) | L4 | `DONE` | Yes (Text prompt input) | Yes (Type checks) | Yes | [nodeCatalog.js:L16](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L16) | Advanced (L1 → L4) |
| **Assistant** | V2 (Registered) | L4 | `INVISIBLE` | Yes (Quote vs Chat prompts) | Yes (Type checks) | Yes | [test-video-studio-wave1.js:L61](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/scratch/test-video-studio-wave1.js#L61) | Advanced (L1 → L4) |
| **Image Generator** | V5 (Renders) | L4 | `DONE` | Yes (Varies with prompt) | Yes (Type checks) | Yes | [nodeCatalog.js:L176](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L176) | Advanced (L1 → L4) |
| **Image Upscaler** | V5 (Renders) | L1 | `VISIBLE-DEAD` | No | Yes (Type checks) | Yes | [nodeCatalog.js:L307](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L307) | Still-blocked (L1) |
| **Variations** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Image Editor** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Camera/Reframe** | V5 (Renders) | L1 | `VISIBLE-DEAD` | No | Yes (Type checks) | Yes | [nodeCatalog.js:L330](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L330) | Still-blocked (L1) |
| **Image to 3D** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Image to SVG** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **SVG Generator** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **SVG Animation** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Video Generator** | V5 (Renders) | L4 | `DONE` | Yes (Varies with prompt) | Yes (Type checks) | Yes | [nodeCatalog.js:L201](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L201) | Advanced (L1 → L4) |
| **Video Upscaler**| V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Video Combiner** | V5 (Renders) | L4 | `DONE` | Yes (Concatenates video urls) | Yes (Type checks) | Yes | [nodeCatalog.js:L141](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L141) | Advanced (L1 → L4) |
| **Speak** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Lip Sync** | V5 (Renders) | L1 | `VISIBLE-DEAD` | No | Yes (Type checks) | Yes | [nodeCatalog.js:L269](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L269) | Still-blocked (L1) |
| **Edit Video/Modify**| V0 (Unlisted)| L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Extract Frames** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Frames to Video** | V5 (Renders) | L1 | `VISIBLE-DEAD` | No | Yes (Type checks) | Yes | [nodeCatalog.js:L231](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L231) | Still-blocked (L1) |
| **Voiceover** | V5 (Renders) | L4 | `DONE` | Yes (Sarvam voice output) | Yes (Type checks) | Yes | [test-video-studio-wave1.js:L78](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/scratch/test-video-studio-wave1.js#L78) | Advanced (L1 → L4) |
| **Sound Effects** | V2 (Registered) | L4 | `INVISIBLE` | Yes (Chimes vs Meows) | Yes (Type checks) | Yes | [test-audio-generators.js:L58](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/scratch/test-audio-generators.js#L58) | Advanced (L1 → L4) |
| **Music Generator**| V5 (Renders) | L4 | `DONE` | Yes (Lyria music output) | Yes (Type checks) | Yes | [nodeCatalog.js:L289](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L289) | Advanced (L1 → L4) |
| **Video Audio Mix** | V2 (Registered) | L4 | `INVISIBLE` | Yes (FFmpeg mixed track) | Yes (Type checks) | Yes | [test-video-stitch.js:L89](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/scratch/test-video-stitch.js#L89) | Advanced (L1 → L4) |
| **List** | V2 (Registered) | L2 | `INVISIBLE` | No (Processes list as JSON) | Yes (Type checks) | Yes | [nodeCatalog.js:L433](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L433) | Advanced (L1 → L2) |
| **Group** | V2 (Registered) | L4 | `INVISIBLE` | No-op visual layout | Yes (Type checks) | Yes | [nodeCatalog.js:L448](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L448) | Advanced (L1 → L4) |
| **Sticky Note** | V2 (Registered) | L4 | `INVISIBLE` | No-op visual note | Yes (Type checks) | Yes | [nodeCatalog.js:L461](file:///Users/dasachin/Desktop/Output/Mantram%20AI/backend/agents/videoStudio/nodeCatalog.js#L461) | Advanced (L1 → L4) |
| **Sticker** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |
| **Designer** | V0 (Unlisted) | L0 | `MISSING` | No | No | No | None | Still-blocked (L0) |

---

## 4. Systemic Findings

1. **Unreachable Registered Components (Checkpoint V3)**:
   * Six nodes (`assistant`, `sound_effects`, `video_audio_mix`, `list`, `group`, and `sticky_note`) are defined in the schema registry on the backend and mapped to custom frontend components inside `FlowCanvas.jsx` (`ListNode`, `GroupNode`, `StickyNoteNode`). However, they are completely excluded from the categorized search list inside `NodeMenu.jsx`.
   * Since this is a read-only audit, we did not make changes, but resolving this is as simple as adding their type definitions into the `CATEGORIES` configuration block in `NodeMenu.jsx`.
2. **Missing Execute Handlers for Active Canvas Nodes**:
   * Several visible nodes (`upscale`, `reframe`, `lipsync`, `frame_interpolate`) render correctly but execute as stubs (L1) because they lack specific class handlers in the `handlers` map in `graphExecutor.js`.
3. **Missing Batch Orchestration (List Node)**:
   * The execution engine parses `List` inputs into JSON format, but lacks the sub-routing capability to fan out executions into multiple concurrent downstream runs.

---

## 5. Credit-Cost Log

The test cases consumed credits successfully using the automated credits deduct method on MongoDB:

* **Audit Credit Cap**: 1,000 credits
* **Credits Spent**:
  * Run 1 (`test-video-studio-wave1.js`): 8 credits (Voiceover)
  * Run 2 (`test-video-studio-wave1.js`): 18 credits (Voiceover + SFX)
  * Run 3 (`test-audio-generators.js`): 10 credits (SFX)
  * Run 4 (`test-audio-generators.js`): 10 credits (SFX)
  * Run 5 (`test-video-studio-wave1.js`): 18 credits (Voiceover + SFX)
* **Total Spent**: 64 credits
* **Remaining Balance**: 936 credits

---

## 6. Prioritized Gap List

### 1. Surfacing `INVISIBLE` Nodes in Palette (Severity: Critical)
* **Nodes affected**: `Assistant`, `Sound Effects`, `Video Audio Mix`, `List`, `Group`, `Sticky Note`.
* **Issue**: They are excluded from `NodeMenu.jsx` `CATEGORIES`.
* **Fix**: Append items matching their types into `NodeMenu.jsx`:
  ```javascript
  // Input category: assistant
  // Audio category: sound_effects, video_audio_mix
  // Utility category: list, group, sticky_note
  ```

### 2. Implement Downstream Batching for List (Severity: High)
* **Nodes affected**: `List`.
* **Issue**: Executor runs downstream nodes once with entire list string instead of fanning out.
* **Fix**: Update the `executeGraphAsync` topological loop in `graphExecutor.js` to detect if a source node is a `list`. If yes, clone downstream branches and execute them in parallel for each item in the list.

### 3. Implement Handlers for `VISIBLE-DEAD` Nodes (Severity: High)
* **Nodes affected**: `Image Upscaler`, `Camera/Reframe`, `Lip Sync`, `Frames to Video`.
* **Issue**: Missing from `handlers` map in `graphExecutor.js`.
* **Fix**: Code the corresponding handlers (e.g. `UpscaleHandler` calling ESRGAN API, `LipsyncHandler` calling Wav2Lip) and register them.

### 4. Code and Register `MISSING` Nodes (Severity: Medium)
* **Nodes affected**: `Variations`, `Image Editor`, `Image to 3D`, `Image to SVG`, `SVG Generator`, `SVG Animation`, `Video Upscaler`, `Speak`, `Edit Video/Modify`, `Extract Frames`, `Sticker`, `Designer`.
* **Issue**: Absent from catalog and frontend components.
* **Fix**: Define schemas in `nodeCatalog.js`, create generic/custom components, and register in `FlowCanvas.jsx` and `NodeMenu.jsx`.
