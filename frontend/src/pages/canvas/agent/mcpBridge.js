// ═══════════════════════════════════════════════════════════════
// mcpBridge.js — MCP (Model Context Protocol) Bridge
// Orchestrates Fidato agent <-> Canvas tool calls
// Handles canvas state serialization, tool execution pipeline,
// progressive UI updates, and error recovery
// ═══════════════════════════════════════════════════════════════

import { executeToolCall } from './toolExecutors'
import { extractLayers } from '../engine/fabricEngine'

/**
 * Build canvas state snapshot for sending to the AI agent
 * This is the "context" in Model Context Protocol
 */
export function buildCanvasContext(fc) {
    if (!fc) return { width: 1080, height: 1080, elements: [], selectedElements: [], selectedCount: 0 }

    const canvasElements = fc.getObjects()
        .filter(o => o.id !== 'artboard')
        .map((obj) => ({
            type: obj.type,
            name: obj.customName || obj._customName || obj.type,
            left: Math.round(obj.left || 0),
            top: Math.round(obj.top || 0),
            width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
            height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
            fill: obj.fill,
            text: obj.text?.substring(0, 50),
            _nodeType: obj._nodeType || null,
            _audioUrl: obj._audioUrl || null,
            src: obj.type === 'image' ? (obj._element?.src || obj.getSrc?.() || '').substring(0, 200) : null,
        }))

    const activeObjects = fc.getActiveObjects?.() || []
    const selectedElements = activeObjects.map(obj => ({
        type: obj.type,
        name: obj.customName || obj._customName || obj.type,
        text: obj.text?.substring(0, 100),
        src: obj.type === 'image' ? (obj._element?.src || obj.getSrc?.() || '').substring(0, 200) : null,
        fill: obj.fill,
        _nodeType: obj._nodeType || null,
        width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
        height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
    }))

    const artboard = fc.getObjects().find(o => o.id === 'artboard')
    return {
        width: artboard ? Math.round(artboard.width) : fc._logicalWidth || 1080,
        height: artboard ? Math.round(artboard.height) : fc._logicalHeight || 1080,
        elements: canvasElements,
        selectedElements: selectedElements.length > 0 ? selectedElements : undefined,
        selectedCount: selectedElements.length,
    }
}

/**
 * Build conversation history for agent context window
 */
export function buildConversationHistory(messages, maxMessages = 6) {
    return messages.slice(-maxMessages).map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : 'image',
    }))
}

/**
 * Augment user message with selection context
 */
export function augmentMessageWithSelection(msg, selectedElements) {
    if (selectedElements.length > 0) {
        const selDesc = selectedElements.map(e =>
            e.type === 'image' ? `Image(${e.src?.substring(0, 80) || 'uploaded'})` : `${e.type}("${e.text || e.name}")`
        ).join(', ')
        return `${msg}\n\n[USER HAS ${selectedElements.length} ELEMENT(S) SELECTED ON CANVAS: ${selDesc}. WORK WITH THESE SELECTED ELEMENTS WHEN RELEVANT.]`
    }
    return msg
}

/**
 * Create progressive thinking steps for UI
 */
export function createThinkingSteps(selectedCount) {
    return [
        { icon: 'psychology', text: 'Analyzing your request...', status: 'active' },
        { icon: 'photo_library', text: selectedCount > 0 ? `Reviewing ${selectedCount} selected element(s)...` : 'Scanning canvas state...', status: 'pending' },
        { icon: 'architecture', text: 'Planning creative actions...', status: 'pending' },
    ]
}

/**
 * Execute a sequence of tool calls with progressive UI updates
 * @param {Array} toolCalls — array of { name, args } from agent
 * @param {fabric.Canvas} fc — Fabric canvas
 * @param {Object} deps — { brand, canvasAssets, addImageUrlToCanvas, ... }
 * @param {Object} callbacks — { onPlanInit, onTaskActive, onTaskDone, onTaskError, onLog, onComplete }
 * @returns {Array} — tool results
 */
export async function executeToolSequence(toolCalls, fc, deps, callbacks = {}) {
    const { onPlanInit, onTaskActive, onTaskDone, onTaskError, onLog, onComplete } = callbacks
    const totalTools = toolCalls.length
    const toolResults = []

    // Initialize plan
    const initTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    if (onPlanInit) {
        onPlanInit({
            title: `Created plan 0/${totalTools}`,
            items: toolCalls.map(tc => ({
                id: tc.name + Math.random(),
                text: tc.name.replace(/_/g, ' '),
                status: 'pending',
            })),
        }, [{ time: initTime, text: `[System] Parsed ${totalTools} task sequence(s) from agent strategy.` }])
    }

    // Execute sequentially
    const executionContext = {
        scenes: [], videos: [], voiceovers: [], music: [],
        referenceImages: deps.referenceImages || [],
    }

    if (executionContext.referenceImages.length > 0 && onLog) {
        onLog(`[Agent] Downloaded ${executionContext.referenceImages.length} reference images from the web`)
    }

    for (let ti = 0; ti < totalTools; ti++) {
        const tc = toolCalls[ti]
        const startTime = Date.now()

        if (onLog) {
            onLog(`[TaskRunner] Executing ${tc.name}...`)
            onLog(`[Payload] ${JSON.stringify(tc.args)}`)
        }

        if (onTaskActive) onTaskActive(ti, totalTools)

        try {
            let result = await executeToolCall(tc, fc, executionContext, deps)
            let text = result
            let mediaUrls = []

            if (typeof result === 'object' && result !== null) {
                text = result.text
                if (result.thumbnail) mediaUrls = [result.thumbnail]
                if (result.thumbnails) mediaUrls = result.thumbnails
            }

            if (onTaskDone) onTaskDone(ti, text, mediaUrls)
            toolResults.push(`✅ ${text}`)
            if (onLog) onLog(`[Success] Call returned ok in ${Date.now() - startTime}ms.`)
        } catch (err) {
            console.error('Tool execution error:', err)
            if (onLog) onLog(`[Error] Execution failed in ${Date.now() - startTime}ms: ${err.message}`)
            if (onTaskError) onTaskError(ti)
            toolResults.push(`❌ Failed ${tc.name}`)
        }
    }

    if (onComplete) onComplete(totalTools)
    return toolResults
}

/**
 * Extract search queries from agent reasoning
 */
export function extractSearches(reasoning) {
    let searches = []
    let cleanReasoning = reasoning || ''
    const searchRegex = /<search query="([^"]+)">([\s\S]*?)<\/search>/gi
    let match
    while ((match = searchRegex.exec(cleanReasoning)) !== null) {
        searches.push({ query: match[1], result: match[2].trim() })
    }
    cleanReasoning = cleanReasoning.replace(searchRegex, '').trim()
    return { searches, cleanReasoning }
}
