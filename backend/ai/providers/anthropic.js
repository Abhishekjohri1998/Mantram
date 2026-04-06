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
        const modelId = model || this.config.defaultModel || 'claude-3-5-sonnet-20241022';

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
            const errMsg = data.error?.message || response.statusText;
            console.error(`❌ [Anthropic] API Error [${response.status}]: ${errMsg} | Model: ${modelId}`);
            throw new Error(`Claude Error [${response.status}]: ${errMsg}`);
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
    async generateWithTools({ systemPrompt, userPrompt, tools, toolHandlers = {}, temperature = 0.5, maxTokens = 4096, model }) {
        const modelId = model || this.config.defaultModel || 'claude-3-5-sonnet-20241022';
        const startTime = Date.now();

        let messages = [{ role: 'user', content: userPrompt }];
        const allToolCalls = [];
        let finalText = '';
        let totalTokens = 0;

        // Tool-use loop: Claude may call multiple tools across turns
        for (let turn = 0; turn < 6; turn++) {
            // Trim messages to prevent token explosion: keep first (user prompt) + last 4
            if (messages.length > 5) {
                messages = [messages[0], ...messages.slice(-4)];
            }
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
                }
            }

            // If Claude didn't call any tools or stop_reason is 'end_turn', we're done
            if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
                break;
            }

            // Separate server-side vs frontend tools
            const serverToolBlocks = toolUseBlocks.filter(tb => toolHandlers[tb.name]);
            const frontendToolBlocks = toolUseBlocks.filter(tb => !toolHandlers[tb.name]);

            // CRITICAL: If there are server-side tools (search_web, download_brand_assets),
            // execute ONLY those and send results back to Claude so it SEES the results
            // BEFORE deciding on creative tools like create_storyboard_frames.
            if (serverToolBlocks.length > 0) {
                console.log(`[AnthropicProvider] Turn ${turn}: ${serverToolBlocks.length} server-side tools, ${frontendToolBlocks.length} frontend tools (deferred)`);
                
                const toolResults = [];
                for (const tb of serverToolBlocks) {
                    console.log(`[AnthropicProvider] ⚡ Executing server tool: ${tb.name}`);
                    try {
                        const result = await toolHandlers[tb.name](tb.input);
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: tb.id,
                            content: JSON.stringify({ success: true, result }),
                        });
                        console.log(`[AnthropicProvider] ↳ ${tb.name} succeeded`);
                    } catch (err) {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: tb.id,
                            content: JSON.stringify({ success: false, error: err.message }),
                        });
                        console.error(`[AnthropicProvider] ↳ ${tb.name} failed: ${err.message}`);
                    }
                }

                // For frontend tools in the SAME turn: send back a result telling Claude
                // to RE-EMIT these tools AFTER it has seen the search/download results
                for (const tb of frontendToolBlocks) {
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tb.id,
                        content: JSON.stringify({ 
                            success: true, 
                            message: `IMPORTANT: ${tb.name} acknowledged. Now that you have the web research and brand asset results, please call ${tb.name} again with content informed by the research data you just received. Use the actual product details and reference images.` 
                        }),
                    });
                }

                messages.push({ role: 'assistant', content: data.content });
                messages.push({ role: 'user', content: toolResults });
                // Continue loop — Claude will re-emit frontend tools WITH research knowledge
                continue;
            }

            // No server-side tools — these are all frontend tools
            // Collect them and send simple acknowledgments so Claude continues to the next step
            console.log(`[AnthropicProvider] Turn ${turn}: ${frontendToolBlocks.length} frontend tool(s) → collecting`);
            const toolResults = [];
            for (const tb of frontendToolBlocks) {
                allToolCalls.push({
                    id: tb.id,
                    name: tb.name,
                    args: tb.input,
                });
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tb.id,
                    content: JSON.stringify({ success: true, message: `${tb.name} executed successfully. Proceed to the next step in the pipeline.` }),
                });
            }

            // Send acknowledgments back so Claude continues to the next tool
            messages.push({ role: 'assistant', content: data.content });
            messages.push({ role: 'user', content: toolResults });
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
