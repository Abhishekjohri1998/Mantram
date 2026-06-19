import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PRESETS, mapModelToPresetId } from '../agents/videoStudio/presets.js';

describe('Prompt Enhancer Presets Registry', () => {
    describe('mapModelToPresetId', () => {
        it('should map empty/undefined model to seedance', () => {
            assert.equal(mapModelToPresetId(''), 'seedance');
            assert.equal(mapModelToPresetId(null), 'seedance');
            assert.equal(mapModelToPresetId(undefined), 'seedance');
        });

        it('should map Seedance models to seedance preset', () => {
            assert.equal(mapModelToPresetId('seedance-2.0'), 'seedance');
            assert.equal(mapModelToPresetId('SEEDANCE'), 'seedance');
        });

        it('should map Veo models to veo preset', () => {
            assert.equal(mapModelToPresetId('veo-3.1'), 'veo');
            assert.equal(mapModelToPresetId('veo-3.1-fast'), 'veo');
        });

        it('should map Kling models to kling preset', () => {
            assert.equal(mapModelToPresetId('kling-3.0'), 'kling');
        });

        it('should map Sora models to sora preset', () => {
            assert.equal(mapModelToPresetId('Sora-Turbo'), 'sora');
        });

        it('should map Runway models to runway preset', () => {
            assert.equal(mapModelToPresetId('runway-gen4'), 'runway');
            assert.equal(mapModelToPresetId('aleph-1'), 'runway');
        });

        it('should map Wan and Luma models to wan_luma preset', () => {
            assert.equal(mapModelToPresetId('wan-2.1'), 'wan_luma');
            assert.equal(mapModelToPresetId('luma-dream-machine'), 'wan_luma');
        });

        it('should map Flux models to flux preset', () => {
            assert.equal(mapModelToPresetId('flux-pro'), 'flux');
            assert.equal(mapModelToPresetId('flux-schnell'), 'flux');
        });

        it('should map GPT Image models to gpt_image_2 preset', () => {
            assert.equal(mapModelToPresetId('gpt-image-2'), 'gpt_image_2');
            assert.equal(mapModelToPresetId('dall-e-3'), 'gpt_image_2');
        });

        it('should map Imagen/Seedream/Banana models to seedream preset', () => {
            assert.equal(mapModelToPresetId('imagen-3'), 'seedream');
            assert.equal(mapModelToPresetId('seedream-v1'), 'seedream');
            assert.equal(mapModelToPresetId('nano-banana'), 'seedream');
        });

        it('should fallback to seedance for unknown model names', () => {
            assert.equal(mapModelToPresetId('unknown-model-xyz'), 'seedance');
        });
    });

    describe('BUILTIN_PRESETS', () => {
        it('should contain built-in presets with correct properties', () => {
            assert.ok(BUILTIN_PRESETS.length > 0);
            for (const preset of BUILTIN_PRESETS) {
                assert.ok(preset.id);
                assert.ok(preset.name);
                assert.ok(preset.category);
                assert.ok(preset.system_prompt);
                assert.ok(Number.isInteger(preset.char_limit));
                assert.equal(preset.preserve_mentions, true);
                assert.equal(preset.scope, 'builtin');
                assert.equal(preset.editable, false);
            }
        });

        it('should have seedance and veo presets present', () => {
            const ids = BUILTIN_PRESETS.map(p => p.id);
            assert.ok(ids.includes('seedance'));
            assert.ok(ids.includes('veo'));
            assert.ok(ids.includes('flux'));
            assert.ok(ids.includes('kling'));
            assert.ok(ids.includes('character_ref_sheet'));
        });
    });
});
