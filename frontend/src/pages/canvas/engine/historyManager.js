// ═══════════════════════════════════════════════════════════════
// historyManager.js — Undo/Redo with efficient JSON snapshots
// Extracted from monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

const MAX_HISTORY = 50

export function createHistoryManager() {
    const history = []
    let index = -1

    return {
        /** Save current canvas state as a JSON snapshot */
        save(fc) {
            if (!fc) return { canUndo: false, canRedo: false }
            const json = JSON.stringify(fc.toJSON())

            // Remove any redo states
            if (index < history.length - 1) {
                history.splice(index + 1)
            }
            history.push(json)
            // Keep max limit
            if (history.length > MAX_HISTORY) history.shift()
            index = history.length - 1

            return { canUndo: index > 0, canRedo: false }
        },

        /** Undo — restore previous state */
        async undo(fc) {
            if (!fc || index <= 0) return { canUndo: false, canRedo: true }
            index -= 1
            const json = history[index]
            await fc.loadFromJSON(JSON.parse(json))
            fc.renderAll()
            return { canUndo: index > 0, canRedo: true }
        },

        /** Redo — restore next state */
        async redo(fc) {
            if (!fc || index >= history.length - 1) return { canUndo: true, canRedo: false }
            index += 1
            const json = history[index]
            await fc.loadFromJSON(JSON.parse(json))
            fc.renderAll()
            return { canUndo: true, canRedo: index < history.length - 1 }
        },

        /** Get current history state */
        getState() {
            return { canUndo: index > 0, canRedo: index < history.length - 1, length: history.length, index }
        },

        /** Clear all history */
        clear() {
            history.length = 0
            index = -1
        },
    }
}
