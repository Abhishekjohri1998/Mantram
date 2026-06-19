import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getRouter } from '../ai/router.js';
import { _enhancePromptInternal } from '../routes/video-studio.js';
import { BUILTIN_PRESETS } from '../agents/videoStudio/presets.js';

describe('Prompt Enhancer Core Logic', () => {
    let originalGenerateText;
    let routerInstance;
    let lastSystemPrompt = '';
    let lastUserPrompt = '';
    let mockResponseText = '';

    before(() => {
        routerInstance = getRouter();
        originalGenerateText = routerInstance.generateText;
        
        // Mock generateText
        routerInstance.generateText = async (params) => {
            lastSystemPrompt = params.systemPrompt || '';
            lastUserPrompt = params.userPrompt || '';
            return {
                text: mockResponseText,
                tokensUsed: 100
            };
        };
    });

    after(() => {
        // Restore original method
        routerInstance.generateText = originalGenerateText;
    });

    it('should correctly auto-target the downstream veo-3.1-fast video model', async () => {
        mockResponseText = JSON.stringify({
            enhancedPrompt: 'A beautiful video of a husky dog chasing a red frisbee in a sunny park, cinematic lighting, 4k.',
            changes: ['Added cinematic lighting', 'Specified husky breed']
        });

        const mockGraph = {
            nodes: [
                {
                    id: 'text_node_1',
                    type: 'text_input',
                    params: { text: 'a dog chasing a frisbee' }
                },
                {
                    id: 'video_gen_1',
                    type: 'video_generate',
                    params: { model: 'veo-3.1-fast' }
                }
            ],
            edges: [
                {
                    id: 'edge_1',
                    from: { node: 'text_node_1' },
                    to: { node: 'video_gen_1', port: 'prompt' }
                }
            ]
        };

        const result = await _enhancePromptInternal(
            'session-123',
            'user-123',
            'text_node_1',
            'auto',
            'a dog chasing a frisbee',
            mockGraph
        );

        assert.equal(result.success, true);
        assert.equal(result.presetId, 'veo');
        assert.equal(result.presetName, 'Veo');
        assert.match(lastSystemPrompt, /Preset: "Veo"/);
        assert.match(lastSystemPrompt, /Rewrite the user idea into natural-language scene paragraphs optimized for Veo/);
    });

    it('should correctly auto-target the downstream flux image model', async () => {
        mockResponseText = JSON.stringify({
            enhancedPrompt: 'A close-up photorealistic shot of an astronaut riding a horse on Mars, Flux style.',
            changes: ['Added photorealistic detail', 'Set background on Mars']
        });

        const mockGraph = {
            nodes: [
                {
                    id: 'text_node_1',
                    type: 'text_input',
                    params: { text: 'astronaut on a horse' }
                },
                {
                    id: 'image_gen_1',
                    type: 'image_generate',
                    params: { model: 'flux-pro' }
                }
            ],
            edges: [
                {
                    id: 'edge_1',
                    from: { node: 'text_node_1' },
                    to: { node: 'image_gen_1', port: 'prompt' }
                }
            ]
        };

        const result = await _enhancePromptInternal(
            'session-123',
            'user-123',
            'text_node_1',
            'auto',
            'astronaut on a horse',
            mockGraph
        );

        assert.equal(result.success, true);
        assert.equal(result.presetId, 'flux');
        assert.equal(result.presetName, 'Flux');
        assert.match(lastSystemPrompt, /Preset: "Flux"/);
    });

    it('should preserve @-mention variables in system prompt guidelines', async () => {
        mockResponseText = JSON.stringify({
            enhancedPrompt: 'Enhancement description where @image_gen_1 is placed on the table next to @text_node_2.',
            changes: ['Added table placement']
        });

        const mockGraph = { nodes: [], edges: [] };
        
        const result = await _enhancePromptInternal(
            'session-123',
            'user-123',
            'text_node_1',
            'seedance',
            'Some prompt with @image_gen_1 and @text_node_2',
            mockGraph
        );

        assert.equal(result.success, true);
        assert.match(lastSystemPrompt, /Incorporate all @-mentions \(such as @image1, @n_123, @text_input\) exactly as written/);
        assert.ok(result.enhancedPrompt.includes('@image_gen_1'));
        assert.ok(result.enhancedPrompt.includes('@text_node_2'));
    });

    it('should enforce the hard character limit on the enhanced prompt', async () => {
        // Return a very long text exceeding seedance limit
        const limit = BUILTIN_PRESETS.find(p => p.id === 'seedance').char_limit;
        const ultraLongText = 'A'.repeat(limit + 500);

        mockResponseText = JSON.stringify({
            enhancedPrompt: ultraLongText,
            changes: ['Generated ultra long response']
        });

        const mockGraph = { nodes: [], edges: [] };

        const result = await _enhancePromptInternal(
            'session-123',
            'user-123',
            'text_node_1',
            'seedance',
            'A basic prompt',
            mockGraph
        );

        assert.equal(result.success, true);
        assert.ok(result.enhancedPrompt.length <= limit);
        assert.equal(result.enhancedPrompt, 'A'.repeat(limit));
    });
});
