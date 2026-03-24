import { BaseProvider } from './base.js';

/**
 * Anthropic Claude Provider
 * Drop-in replacement for other providers — text only.
 */
export class AnthropicProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.name = 'anthropic';
        this.baseUrl = 'https://api.anthropic.com/v1';
    }

    async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 2048, model }) {
        const modelId = model || this.config.defaultModel || 'claude-sonnet-4-20250514';

        const startTime = Date.now();
        const response = await fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: modelId,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                temperature,
            }),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(`Claude Error [${response.status}]: ${data.error?.message || response.statusText}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(`Claude Error: ${data.error.message}`);

        return {
            text: data.content?.[0]?.text || '',
            tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            model: modelId,
            provider: 'anthropic',
            generationTime: Date.now() - startTime,
        };
    }

    async analyzeText({ text, task, model }) {
        const result = await this.generateText({
            systemPrompt: 'You are a precise brand analysis AI. Always respond with valid JSON only.',
            userPrompt: `Task: ${task}\n\nAnalyze:\n${text}`,
            temperature: 0.2,
            model,
        });
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: result.text };
        } catch {
            return { analysis: result.text };
        }
    }

    /**
     * Generate text with Claude tool-use support.
     * Claude decides which tools to call based on the user's request.
     * Returns both the text response and the array of tool calls made.
     */
    async generateWithTools({ systemPrompt, userPrompt, tools, temperature = 0.5, maxTokens = 4096, model }) {
        const modelId = model || this.config.defaultModel || 'claude-sonnet-4-20250514';
        const startTime = Date.now();

        let messages = [{ role: 'user', content: userPrompt }];
        const allToolCalls = [];
        let finalText = '';
        let totalTokens = 0;

        // Tool-use loop: Claude may call multiple tools across turns
        for (let turn = 0; turn < 10; turn++) {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: modelId,
                    max_tokens: maxTokens,
                    system: systemPrompt,
                    messages,
                    tools,
                    temperature,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(`Claude Error [${response.status}]: ${data.error?.message || response.statusText}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(`Claude Error: ${data.error.message}`);

            totalTokens += (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

            // Process response content blocks
            const toolUseBlocks = [];
            for (const block of (data.content || [])) {
                if (block.type === 'text') {
                    finalText += block.text;
                } else if (block.type === 'tool_use') {
                    toolUseBlocks.push(block);
                    allToolCalls.push({
                        id: block.id,
                        name: block.name,
                        args: block.input,
                    });
                }
            }

            // If Claude didn't call any tools or stop_reason is 'end_turn', we're done
            if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
                break;
            }

            // Build tool results for next turn
            // We return the tool calls to the frontend — the frontend executes them
            // and we just acknowledge them as successful here
            messages.push({ role: 'assistant', content: data.content });
            messages.push({
                role: 'user',
                content: toolUseBlocks.map(tb => ({
                    type: 'tool_result',
                    tool_use_id: tb.id,
                    content: JSON.stringify({ success: true, message: `${tb.name} executed successfully` }),
                })),
            });
        }

        return {
            text: finalText,
            toolCalls: allToolCalls,
            tokensUsed: totalTokens,
            model: modelId,
            provider: 'anthropic',
            generationTime: Date.now() - startTime,
        };
    }

    // Claude doesn't support image gen — router will fallback to another provider
    async generateImage() {
        throw new Error('Anthropic Claude does not support image generation. Use OpenAI or Stability provider.');
    }
}
