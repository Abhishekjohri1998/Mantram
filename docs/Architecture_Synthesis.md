# Mantram AI: Architectural Context & Synthesis

This document provides a comprehensive overview of the Mantram AI codebase, summarizing its structural architecture, technology stack, backend systems, and frontend capabilities. 

## 1. High-Level System Architecture

Mantram AI is built on a modern decoupled architecture:
*   **Backend:** Node.js & Express.js REST API serving as the central orchestration layer, database interface, and AI gateway.
*   **Frontend:** React 19 Single Page Application (SPA) powered by Vite, providing the user interface and rich studio experiences.
*   **Database:** MongoDB (via Mongoose) used for all persistent data storage, including users, agents, campaigns, content, and credit systems.

> [!NOTE]
> The repository is split into two primary, standalone directories (`/backend` and `/frontend`), ensuring independent deployments, dependency management, and scalability.

## 2. Backend Ecosystem (`/backend`)

The backend is a robust monolithic API service with deep AI and autonomous agent integrations.

### Core Stack
*   **Server Framework:** Express 5.2.1
*   **Database:** MongoDB (`mongoose`) + Upstash Redis (`ioredis` / `@upstash/redis`)
*   **Security & Middleware:** `cors` (with a custom brute-force interceptor), `helmet`, `express-rate-limit`, JWT for authentication.
*   **Payments:** Stripe and Razorpay integrations.

### Key Functional Domains (Studios & Features)
The backend routes are highly modularized, mapping to distinct functional "Studios" in the application:
*   **Content Generation:** `brainstorm-studio`, `research-studio`, `seo-studio`, `content-agentic`, `brand-studio`.
*   **Media & Creative:** `video-studio`, `youtube-studio`, `social-media-studio`, `avatar-studio`, `canvas-direct`, media uploads (AWS S3 + Multer).
*   **Marketing & Funnels:** `pm-studio` (Performance Marketing), `funnel-studio`, `nurture-sequences`, `virality-predictor`.
*   **E-Commerce Integrations:** `shopify` (with dedicated `shopify.app.toml` config), `etsy`, `woocommerce`.
*   **Core Systems:** `agents`, `team`, `fidato`, `nexus`, `intelMissions`, `credits`, `subscriptions`.

### AI Provider Integrations
The system aggregates multiple LLM and AI service providers:
*   **Google:** `@google/genai`, `@google-cloud/vertexai`
*   **Anthropic:** Used for complex orchestration and reasoning.
*   **OpenAI:** Standard generations and embeddings.
*   **MCP (Model Context Protocol):** Implements an internal MCP Tool Server (`/mcp/tools`) to expose platform intelligence and tools to studio agents via `mcpBridge`.

### Autonomous Background Agents
Mantram AI relies heavily on background tasks initialized via `index.js`:
*   **Autonomous Agent:** Runs every 4 hours for follow-up checks.
*   **Intelligence Agent (`runIntelMissions`):** Runs every 6 hours for data gathering.
*   **Scheduled Post Publisher:** Handles automated social media publishing.
*   **Pricing Monitor:** Runs every 24 hours.
*   **Funnel Scheduler:** Manages nurture sequences, automations, and score decay.
*   **Subscription Manager:** Handles hourly subscription validations.
*   **Video Archival Sweep:** Cleans up and archives videos to S3.

> [!WARNING]
> Bull Queue was historically used for creative jobs but was removed due to high Redis connection overhead. Creative generation now relies on Node's native `setImmediate()`.

## 3. Frontend Ecosystem (`/frontend`)

The frontend is a highly interactive React application designed to support rich media manipulation and complex data workflows.

### Core Stack
*   **Framework:** React 19.2 + Vite 7.3
*   **Styling:** Tailwind CSS v4 + PostCSS
*   **State & Routing:** `zustand` (global state), `react-router-dom` (routing).

### Core Libraries & Capabilities
*   **Rich Text Editing:** Extensive use of `@tiptap/react` and its ecosystem (`starter-kit`, `extension-color`, `extension-image`, `extension-link`) for robust document and content editors.
*   **Visual Manipulations:** `fabric.js` (v7) for advanced canvas operations, image manipulation, and visual editing (used heavily in creatives and studio tools).
*   **Data Visualization:** `chart.js` + `react-chartjs-2` for rendering analytics in the dashboard.
*   **Drag and Drop:** `@dnd-kit/core` and utilities for complex drag-and-drop interfaces (likely used in funnel builders or kanban boards).
*   **Animations:** `framer-motion` for fluid, dynamic UI interactions.
*   **Icons:** `@tabler/icons-react` and `lucide-react`.
*   **Utilities:** `html2pdf.js` for document exports.

## 4. Root Directory & Deployment Structure
The root of the repository houses deployment scripts, documentation, and a massive suite of ad-hoc testing tools.
*   **Test Scripts:** Numerous scripts prefixed with `test_` or `qa_` (e.g., `test_gemini.js`, `test-api.js`, `full-qa-test.js`) used for rapid testing of endpoints, AI providers, and specific feature pipelines outside the main application lifecycle.
*   **Deployment:** `deploy.sh` and related folders for pushing updates.
*   **Documentation:** Various Markdown notes (`README.md`, `.agent/`, `docs/`) that track architectural changes and project context.

## Summary

Mantram AI is a sophisticated, multi-tenant AI orchestration platform. It separates presentation (a React-based studio suite with deep canvas and text editing tools) from business logic (a monolithic Express backend with sprawling API endpoints catering to various "studios"). It heavily leverages autonomous, scheduled background processes to act as persistent "agents" for the users, integrating across e-commerce channels (Shopify, Etsy) and social platforms while managing billing and generative media via multiple top-tier AI providers.
