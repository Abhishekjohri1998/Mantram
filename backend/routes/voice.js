import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
import multer from 'multer';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// Multer config — store audio in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// Indian languages → route to Sarvam AI (Saaras v3)
const INDIAN_LANGUAGES = {
    hindi: 'hi-IN',
    tamil: 'ta-IN',
    telugu: 'te-IN',
    bengali: 'bn-IN',
    marathi: 'mr-IN',
    gujarati: 'gu-IN',
    punjabi: 'pa-IN',
    kannada: 'kn-IN',
    malayalam: 'ml-IN',
    urdu: 'ur-IN',
    odia: 'od-IN',
    assamese: 'as-IN',
    nepali: 'ne-IN',
    konkani: 'kok-IN',
    kashmiri: 'ks-IN',
    sindhi: 'sd-IN',
    sanskrit: 'sa-IN',
    maithili: 'mai-IN',
    dogri: 'doi-IN',
    manipuri: 'mni-IN',
    bodo: 'brx-IN',
    santali: 'sat-IN',
};

// Non-Indian languages → route to OpenAI Whisper
const WHISPER_LANGUAGES = {
    english: 'en',
    spanish: 'es',
    french: 'fr',
    german: 'de',
    italian: 'it',
    portuguese: 'pt',
    japanese: 'ja',
    korean: 'ko',
    chinese: 'zh',
    arabic: 'ar',
    indonesian: 'id',
    thai: 'th',
    turkish: 'tr',
    russian: 'ru',
    dutch: 'nl',
};

/**
 * POST /api/voice/transcribe
 * 
 * Intelligent routing:
 *   - Indian languages → Sarvam AI (Saaras v3) — best for Hindi, Tamil, Telugu etc.
 *   - English & foreign → OpenAI Whisper — best for global languages
 */
router.post('/transcribe', protect, requireCredits('voiceTranscribe'), upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No audio file provided' });
        }

        const language = (req.body.language || 'english').toLowerCase();
        const isIndianLanguage = language in INDIAN_LANGUAGES;

        if (isIndianLanguage || language === 'unknown') {
            // For Indian languages or unknown — try Sarvam first (it auto-detects)
            return await transcribeWithSarvam(req, res, language);
        } else {
            return await transcribeWithWhisper(req, res, language);
        }

    } catch (error) {
        console.error('Voice transcription error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'voiceTranscribe', `Refund: Voice Transcription Sync Failure (${safeErrorMessage(error)})`, 'voice');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * Sarvam AI STT — Saaras v3
 * Best accuracy for Indian languages (22+ languages)
 * Supports auto-detection, code-mixing, transliteration
 */
// Detect file extension from multer upload
function getAudioFileInfo(multerFile) {
    const mime = multerFile.mimetype || 'audio/m4a';
    const extMap = {
        'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
        'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
        'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
        'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
    };
    // Try from original filename first, then from mimetype
    let ext = (multerFile.originalname || '').split('.').pop()?.toLowerCase();
    if (!ext || ext.length > 5) ext = extMap[mime] || 'm4a';
    return { ext, mime, filename: `audio.${ext}` };
}

async function transcribeWithSarvam(req, res, language) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
        console.warn('Sarvam API key missing, falling back to Whisper');
        return transcribeWithWhisper(req, res, language);
    }

    try {
        const langCode = INDIAN_LANGUAGES[language] || 'unknown';
        const fileInfo = getAudioFileInfo(req.file);

        // Build FormData for Sarvam API
        const form = new FormData();
        const audioBlob = new Blob([req.file.buffer], { type: fileInfo.mime });
        form.append('file', audioBlob, fileInfo.filename);
        form.append('model', 'saaras:v3');
        form.append('language_code', langCode);
        form.append('mode', 'transcribe');

        const response = await fetch('https://api.sarvam.ai/speech-to-text', {
            method: 'POST',
            headers: {
                'api-subscription-key': apiKey,
            },
            body: form,
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('Sarvam STT error:', response.status, errData);
            // Fallback to Whisper on Sarvam error
            console.warn('Sarvam failed, falling back to Whisper');
            return transcribeWithWhisper(req, res, language);
        }

        const data = await response.json();

        return res.json({
            success: true,
            text: data.transcript || '',
            language: data.language_code || langCode,
            provider: 'sarvam',
            confidence: data.language_confidence || null,
        });

    } catch (err) {
        console.error('Sarvam STT exception:', err.message);
        // Fallback to Whisper
        return transcribeWithWhisper(req, res, language);
    }
}

/**
 * OpenAI Whisper STT
 * Best for English and foreign languages
 */
async function transcribeWithWhisper(req, res, language) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ success: false, error: 'OpenAI API key not configured' });
    }

    const fileInfo = getAudioFileInfo(req.file);

    const form = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: fileInfo.mime });
    form.append('file', audioBlob, fileInfo.filename);
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');

    // Send language hint for Whisper
    const langCode = WHISPER_LANGUAGES[language] || '';
    if (langCode) {
        form.append('language', langCode);
    }

    if (req.body.contextPrompt) {
        form.append('prompt', req.body.contextPrompt);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: form,
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'voiceTranscribe', `Refund: Whisper STT Failure (${errData.error?.message || 'Unknown'})`, 'voice');
        }
        return res.status(response.status).json({
            success: false,
            error: errData.error?.message || 'Transcription failed',
        });
    }

    const data = await response.json();

    return res.json({
        success: true,
        text: data.text,
        language: data.language || language,
        provider: 'whisper',
    });
}

export default router;
