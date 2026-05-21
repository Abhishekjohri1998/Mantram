# Mantram AI Ecosystem: Complete Architecture & Context Synthesis

This document provides a holistic, detailed overview of the entire Mantram AI ecosystem, encompassing the web platform (`Mantram AI`) and the mobile application (`MantramApp`).

## 1. High-Level Ecosystem Architecture

The Mantram ecosystem consists of three primary, decoupled applications:
*   **Web Backend (`/Mantram AI/backend`)**: A Node.js & Express.js REST API acting as the central intelligence hub, database interface, and orchestration layer for AI tasks.
*   **Web Frontend (`/Mantram AI/frontend`)**: A React 19 Single Page Application (SPA) powered by Vite, providing the rich dashboard and content creation studio suite.
*   **Mobile App (`/MantramApp`)**: A cross-platform mobile application built with React Native and Expo, bringing the studio experience to iOS and Android devices.

The common thread across all three is the API backend, which centralizes the state, autonomous workflows, integrations, and AI generation logic.

---

## 2. Mantram AI: Web Backend & Frontend

### 2.1 Backend Ecosystem (`/backend`)
*   **Core Stack**: Express 5.2.1, MongoDB (via Mongoose), Upstash Redis (for caching, though the Bull queue was removed to optimize connection costs).
*   **AI Integrations**: Seamlessly routes prompts and orchestration through multiple LLMs: Google Vertex AI / GenAI, Anthropic Claude, and OpenAI.
*   **Key "Studios"**: The API maps to diverse functional domains, including Video Studio, YouTube Studio, SEO Studio, Performance Marketing (PM) Studio, Brainstorm Studio, and Funnel Studio.
*   **Autonomous Agents**: Background tasks run continuously to serve users.
    *   *Autonomous Agent* & *Intelligence Agent* (runs every 4-6 hours).
    *   *Funnel Scheduler*, *Subscription Manager*, *Pricing Monitor*.
    *   *Scheduled Post Publisher* & *Video Archival Sweep*.
*   **Integrations**: Direct APIs bridging Shopify, Etsy, WooCommerce, YouTube, and LinkedIn.
*   **Tooling**: Features an internal MCP (Model Context Protocol) server (`/mcp/tools`) to provide AI agents with platform tools.

### 2.2 Web Frontend (`/frontend`)
*   **Core Stack**: React 19.2 + Vite 7.3, Tailwind CSS v4.
*   **State & Routing**: Uses `zustand` for lightweight global state management and `react-router-dom` for navigation.
*   **Media & Editing Capabilities**:
    *   **Rich Text**: Deep integration with `@tiptap/react` for advanced document editing.
    *   **Visual Generation**: Utilizes `fabric.js` (v7) for advanced canvas operations, image manipulation, and visual editing.
    *   **Analytics**: `chart.js` for data visualization.
*   **Deployment & Scripts**: Supported by a suite of QA scripts in the root directory (e.g., `test_gemini.js`, `full-qa-test.js`) to test AI provider pipelines independently.

---

## 3. MantramApp: The Mobile Ecosystem

The `/MantramApp` directory houses the mobile counterpart, bringing the power of Mantram AI to users on the go.

### 3.1 Mobile Core Stack
*   **Framework**: React Native 0.81.5 paired with Expo SDK 54 (`expo: ~54.0.33`).
*   **Routing**: Utilizes `expo-router` (~6.0.13) for file-based routing.
*   **Animations & Gestures**: Employs `react-native-reanimated` (~4.1.1) and `react-native-gesture-handler`.

### 3.2 Mobile Capabilities & Features
*   **Media & Video Handling**: Uses `expo-video`, `expo-av`, `expo-audio`, and `expo-media-library` for a complete multimedia playback, creation, and gallery integration experience.
*   **Notifications**: Integrated with `expo-notifications` for real-time remote push notifications.
*   **Secure Storage & Preferences**: `expo-secure-store` and `@react-native-async-storage/async-storage` for holding session tokens and offline states securely.
*   **UI & Design**: Features `@expo-google-fonts/inter` and `@expo-google-fonts/space-grotesk` for premium typography, alongside `expo-linear-gradient` and `@expo/vector-icons` for a rich UI experience consistent with the web design system.
*   **Device Permissions**: Explicit configuration in `app.json` for audio recording (`RECORD_AUDIO` / `NSMicrophoneUsageDescription`) to support Voice Commands/Voice Studio inputs.

### 3.3 Mobile Build & Configuration
*   **EAS Integration**: Configured for Expo Application Services (EAS) under the project ID `ef3600f4-6077-44eb-bd6c-dde2fd9d3661`.
*   **Styling**: Employs a dark UI scheme as the default (`userInterfaceStyle: "dark"`).

## Summary

The Mantram ecosystem represents a highly cohesive, multi-platform product suite. The **Node.js backend** acts as the brain—orchestrating AI APIs, autonomous background tasks, and data persistence. The **Web Frontend** offers a robust, desktop-class creative environment using advanced canvas and text editors. The **Mobile App** acts as a portable extension, leveraging Expo and React Native's modern APIs to provide on-the-go media creation, push notifications, and voice-activated intelligence. Together, they form a unified platform for automated content generation, digital marketing, and AI-driven insights.
