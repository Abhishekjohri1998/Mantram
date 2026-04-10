// ═══════════════════════════════════════════════════════════════
// Canvas Module — Barrel Exports
// ═══════════════════════════════════════════════════════════════

// State
export { default as useCanvasStore } from './state/useCanvasStore'

// Engine
export * from './engine/fabricEngine'
export { createHistoryManager } from './engine/historyManager'

// Tools
export * from './tools/shapeTools'
export * from './tools/textTools'
export * from './tools/imageTools'
export * from './tools/maskTools'

// Agent (MCP)
export * from './agent/mcpBridge'
export * from './agent/toolExecutors'

// Data
export * from './data/presets'
export * from './data/fonts'

// UI Panels
export * from './panels'

