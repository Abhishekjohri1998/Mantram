/**
 * commandBus.js — The single path that mutates a VideoGraph.
 *
 * Rules (non-negotiable):
 * 1. Both the Canvas UI and the copilot agent emit commands here.
 * 2. Every command is validated before apply. Invalid → structured error.
 * 3. Every apply produces an inverse diff for the undo stack.
 * 4. Downstream nodes are marked stale when an upstream input changes.
 * 5. The graph can never enter an invalid state.
 *
 * Commands: add_node | update_params | delete_node | connect |
 *           disconnect | set_input | move_node
 */

import { NODE_CATALOG, getNodeType, portsCompatible } from './nodeCatalog.js';
import { v4 as uuidv4 } from 'uuid';

// ── Error codes (machine-readable for agent self-correction) ─────────────────
export const BUS_ERRORS = {
    MISSING_NODE_TYPE:     'MISSING_NODE_TYPE',
    INVALID_PARAMS:        'INVALID_PARAMS',
    NODE_NOT_FOUND:        'NODE_NOT_FOUND',
    EDGE_NOT_FOUND:        'EDGE_NOT_FOUND',
    SOURCE_PORT_NOT_FOUND: 'SOURCE_PORT_NOT_FOUND',
    TARGET_PORT_NOT_FOUND: 'TARGET_PORT_NOT_FOUND',
    INCOMPATIBLE_PORTS:    'INCOMPATIBLE_PORTS',
    PORT_OVER_SUBSCRIBED:  'PORT_OVER_SUBSCRIBED',
    CYCLE:                 'CYCLE',
    STALE_BASE:            'STALE_BASE',
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a command against the current graph.
 * Returns { ok: true } or { ok: false, code, message, suggestion? }
 */
export function validateCommand(graph, command) {
    const { type, payload } = command;
    switch (type) {
        case 'add_node':     return _validateAddNode(graph, payload);
        case 'update_params':return _validateUpdateParams(graph, payload);
        case 'delete_node':  return _validateDeleteNode(graph, payload);
        case 'connect':      return _validateConnect(graph, payload);
        case 'disconnect':   return _validateDisconnect(graph, payload);
        case 'set_input':    return _validateSetInput(graph, payload);
        case 'move_node':    return _validateMoveNode(graph, payload);
        default:
            return { ok: false, code: 'UNKNOWN_COMMAND', message: `Unknown command type: ${type}` };
    }
}

/**
 * Apply a validated command to a graph (deep-cloned internally).
 * Returns { newGraph, inverseDiff }.
 * ALWAYS call validateCommand first; this function does not re-validate.
 */
export function applyCommand(graph, command) {
    const g = deepCloneGraph(graph);
    const { type, payload, author = 'user' } = command;

    let inverseDiff;
    switch (type) {
        case 'add_node':      inverseDiff = _applyAddNode(g, payload, author); break;
        case 'update_params': inverseDiff = _applyUpdateParams(g, payload, author); break;
        case 'delete_node':   inverseDiff = _applyDeleteNode(g, payload); break;
        case 'connect':       inverseDiff = _applyConnect(g, payload, author); break;
        case 'disconnect':    inverseDiff = _applyDisconnect(g, payload); break;
        case 'set_input':     inverseDiff = _applySetInput(g, payload, author); break;
        case 'move_node':     inverseDiff = _applyMoveNode(g, payload); break;
        default: inverseDiff = null;
    }

    g.version = (g.version || 0) + 1;
    return { newGraph: g, inverseDiff };
}

/**
 * Mark all nodes downstream of changedNodeId as 'stale'.
 * Call after any apply that changes a node's params or output.
 */
export function markDownstreamStale(graph, changedNodeId) {
    const g = deepCloneGraph(graph);
    const staleIds = new Set();
    _collectDownstream(g, changedNodeId, staleIds);
    staleIds.delete(changedNodeId); // don't stale the node itself
    for (const id of staleIds) {
        const node = g.nodes.find(n => n.id === id);
        if (node && node.state !== 'idle') node.state = 'stale';
    }
    return g;
}

// ── Validators ───────────────────────────────────────────────────────────────

function _validateAddNode(graph, { type, params = {} }) {
    const catalog = getNodeType(type);
    if (!catalog) {
        return {
            ok: false,
            code: BUS_ERRORS.MISSING_NODE_TYPE,
            message: `Node type "${type}" does not exist in the catalog.`,
            suggestion: `Call get_node_catalog() to see all valid types.`,
        };
    }
    // Validate params against schema
    for (const [key, schema] of Object.entries(catalog.params || {})) {
        if (params[key] !== undefined) {
            const err = _validateParamValue(key, params[key], schema);
            if (err) return { ok: false, code: BUS_ERRORS.INVALID_PARAMS, message: err };
        }
    }
    return { ok: true };
}

function _validateUpdateParams(graph, { nodeId, params }) {
    const node = _findNode(graph, nodeId);
    if (!node) return _nodeNotFound(nodeId);
    const catalog = getNodeType(node.type);
    if (!catalog) return { ok: false, code: BUS_ERRORS.MISSING_NODE_TYPE, message: `Node type "${node.type}" not in catalog.` };
    for (const [key, value] of Object.entries(params)) {
        const schema = catalog.params?.[key];
        if (!schema) continue; // allow unknown params (pass-through)
        const err = _validateParamValue(key, value, schema);
        if (err) return { ok: false, code: BUS_ERRORS.INVALID_PARAMS, message: err };
    }
    return { ok: true };
}

function _validateDeleteNode(graph, { nodeId }) {
    if (!_findNode(graph, nodeId)) return _nodeNotFound(nodeId);
    return { ok: true };
}

function _validateConnect(graph, { from, to }) {
    // from: { node, port }  to: { node, port }
    const fromNode = _findNode(graph, from.node);
    if (!fromNode) return _nodeNotFound(from.node);
    const toNode = _findNode(graph, to.node);
    if (!toNode) return _nodeNotFound(to.node);

    const fromCatalog = getNodeType(fromNode.type);
    const toCatalog   = getNodeType(toNode.type);

    const fromPort = fromCatalog?.ports.outputs.find(p => p.id === from.port);
    if (!fromPort) {
        return {
            ok: false, code: BUS_ERRORS.SOURCE_PORT_NOT_FOUND,
            message: `Output port "${from.port}" not found on node type "${fromNode.type}".`,
            suggestion: `Valid outputs: ${(fromCatalog?.ports.outputs || []).map(p => p.id).join(', ')}`,
        };
    }

    const toPort = toCatalog?.ports.inputs.find(p => p.id === to.port);
    if (!toPort) {
        return {
            ok: false, code: BUS_ERRORS.TARGET_PORT_NOT_FOUND,
            message: `Input port "${to.port}" not found on node type "${toNode.type}".`,
            suggestion: `Valid inputs: ${(toCatalog?.ports.inputs || []).map(p => p.id).join(', ')}`,
        };
    }

    // Type compatibility
    if (!portsCompatible(fromPort.type, toPort.type)) {
        return {
            ok: false, code: BUS_ERRORS.INCOMPATIBLE_PORTS,
            message: `Port type mismatch: "${fromPort.type}" → "${toPort.type}". These types cannot connect.`,
            suggestion: `Insert a converter node, or choose a compatible source/target port.`,
        };
    }

    // Over-subscription (unless multi: true)
    if (!toPort.multi) {
        const alreadyConnected = graph.edges.some(e => e.to.node === to.node && e.to.port === to.port);
        if (alreadyConnected) {
            return {
                ok: false, code: BUS_ERRORS.PORT_OVER_SUBSCRIBED,
                message: `Input port "${to.port}" on node "${to.node}" already has a connection. Disconnect it first.`,
            };
        }
    }

    // Cycle detection
    if (_wouldCreateCycle(graph, from.node, to.node)) {
        return {
            ok: false, code: BUS_ERRORS.CYCLE,
            message: `This connection would create a cycle in the graph, which is not allowed.`,
            suggestion: `Check the direction of your connections — data must flow from inputs to outputs.`,
        };
    }

    return { ok: true };
}

function _validateDisconnect(graph, { edgeId }) {
    if (!graph.edges.find(e => e.id === edgeId)) {
        return { ok: false, code: BUS_ERRORS.EDGE_NOT_FOUND, message: `Edge "${edgeId}" not found.` };
    }
    return { ok: true };
}

function _validateSetInput(graph, { nodeId }) {
    if (!_findNode(graph, nodeId)) return _nodeNotFound(nodeId);
    return { ok: true };
}

function _validateMoveNode(graph, { nodeId }) {
    if (!_findNode(graph, nodeId)) return _nodeNotFound(nodeId);
    return { ok: true };
}

// ── Applicators ──────────────────────────────────────────────────────────────

function _applyAddNode(g, payload, author) {
    const { type, params = {}, position = { x: 100, y: 100 }, nodeId, _tempId } = payload;
    const catalog = getNodeType(type);
    const id = nodeId || _tempId || `n_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
    const defaults = {};
    for (const [k, schema] of Object.entries(catalog.params || {})) {
        defaults[k] = schema.default;
    }
    const newNode = {
        id,
        type,
        position: { ...position },
        params: { ...defaults, ...params },
        ports: catalog.ports,
        state: 'idle',
        outputRef: null,
        author,
        error: null,
    };
    g.nodes.push(newNode);
    return { type: 'delete_node', payload: { nodeId: id } }; // inverse
}

function _applyUpdateParams(g, { nodeId, params }, author) {
    const node = _findNode(g, nodeId);
    const prevParams = { ...node.params };
    node.params = { ...node.params, ...params };
    node.author = author;
    node.state = 'stale'; // param change invalidates output
    return { type: 'update_params', payload: { nodeId, params: prevParams } };
}

function _applyDeleteNode(g, { nodeId }) {
    const node = _findNode(g, nodeId);
    const snapshot = { ...node };
    // Remove all edges involving this node
    g.edges = g.edges.filter(e => e.from.node !== nodeId && e.to.node !== nodeId);
    g.nodes = g.nodes.filter(n => n.id !== nodeId);
    return { type: 'add_node', payload: { type: snapshot.type, params: snapshot.params, position: snapshot.position } };
}

function _applyConnect(g, { from, to }, author) {
    const edgeId = `e_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
    g.edges.push({ id: edgeId, from, to, author });
    // Mark to-node stale
    const toNode = _findNode(g, to.node);
    if (toNode) toNode.state = 'stale';
    return { type: 'disconnect', payload: { edgeId } };
}

function _applyDisconnect(g, { edgeId }) {
    const edge = g.edges.find(e => e.id === edgeId);
    const snapshot = { ...edge };
    g.edges = g.edges.filter(e => e.id !== edgeId);
    // Mark downstream stale
    const toNode = _findNode(g, snapshot.to.node);
    if (toNode) toNode.state = 'stale';
    return { type: 'connect', payload: { from: snapshot.from, to: snapshot.to } };
}

function _applySetInput(g, { nodeId, value }, author) {
    const node = _findNode(g, nodeId);
    const prev = node.params._inputValue;
    node.params._inputValue = value;
    node.author = author;
    node.state = 'stale';
    return { type: 'set_input', payload: { nodeId, value: prev } };
}

function _applyMoveNode(g, { nodeId, position }) {
    const node = _findNode(g, nodeId);
    const prev = { ...node.position };
    node.position = { ...position };
    return { type: 'move_node', payload: { nodeId, position: prev } };
}

// ── Cycle detection (DFS) ────────────────────────────────────────────────────
function _wouldCreateCycle(graph, fromNodeId, toNodeId) {
    // Check if toNodeId can already reach fromNodeId (if so, adding from→to creates cycle)
    const visited = new Set();
    function dfs(nodeId) {
        if (nodeId === fromNodeId) return true;
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);
        const outEdges = graph.edges.filter(e => e.from.node === nodeId);
        return outEdges.some(e => dfs(e.to.node));
    }
    return dfs(toNodeId);
}

function _collectDownstream(graph, startId, collected) {
    const outEdges = graph.edges.filter(e => e.from.node === startId);
    for (const edge of outEdges) {
        if (!collected.has(edge.to.node)) {
            collected.add(edge.to.node);
            _collectDownstream(graph, edge.to.node, collected);
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _findNode(graph, nodeId) { return graph.nodes.find(n => n.id === nodeId); }
function _nodeNotFound(nodeId) {
    return { ok: false, code: BUS_ERRORS.NODE_NOT_FOUND, message: `Node "${nodeId}" not found in graph.` };
}

function _validateParamValue(key, value, schema) {
    if (schema.type === 'number' && typeof value !== 'number') {
        return `Param "${key}" must be a number, got ${typeof value}.`;
    }
    if (schema.type === 'enum' && schema.options && !schema.options.includes(value)) {
        return `Param "${key}" must be one of: ${schema.options.join(', ')}. Got "${value}".`;
    }
    return null;
}

function deepCloneGraph(graph) {
    return JSON.parse(JSON.stringify(graph));
}

// ── Topo sort (Kahn's algorithm) ─────────────────────────────────────────────
export function topologicalSort(graph) {
    const inDegree = {};
    const adj = {};
    for (const node of graph.nodes) {
        inDegree[node.id] = 0;
        adj[node.id] = [];
    }
    for (const edge of graph.edges) {
        adj[edge.from.node].push(edge.to.node);
        inDegree[edge.to.node] = (inDegree[edge.to.node] || 0) + 1;
    }
    const queue = graph.nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const order = [];
    while (queue.length) {
        const nodeId = queue.shift();
        order.push(nodeId);
        for (const neighbor of (adj[nodeId] || [])) {
            inDegree[neighbor]--;
            if (inDegree[neighbor] === 0) queue.push(neighbor);
        }
    }
    if (order.length !== graph.nodes.length) throw new Error('Graph has a cycle — cannot execute.');
    return order;
}
