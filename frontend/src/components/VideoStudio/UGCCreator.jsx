import { useState, useEffect, useRef, useCallback } from 'react'
import { CreditTooltipWrapper } from '../CreditBadge'

const API = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error(`Server returned ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

/* ── Constants ── */
const STYLES = [
    { id: 'testimonial', label: 'Testimonial', icon: '⭐' },
    { id: 'unboxing', label: 'Unboxing', icon: '📦' },
    { id: 'review', label: 'Review', icon: '🔍' },
    { id: 'tutorial', label: 'Tutorial', icon: '📝' },
    { id: 'before-after', label: 'Before & After', icon: '✨' },
    { id: 'grwm', label: 'GRWM', icon: '💄' },
    { id: 'day-in-life', label: 'Day in Life', icon: '☀️' },
    { id: 'comparison', label: 'Comparison', icon: '⚖️' },
    { id: 'hack', label: 'Life Hack', icon: '💡' },
    { id: 'reaction', label: 'Reaction', icon: '😮' },
]

const AGES = ['Young Adult', 'Early Middle Age', 'Late Middle Age', 'Senior', 'Unspecified']
const GENDERS = ['Woman', 'Man', 'Unspecified']
const ETHNICITIES = ['White', 'Black', 'Asian American', 'East Asian', 'South East Asian', 'South Asian', 'Middle Eastern', 'Pacific', 'Hispanic', 'Unspecified']
const POSES = [{ id: 'half_body', label: 'Upper Body' }, { id: 'close_up', label: 'Face' }, { id: 'full_body', label: 'Full Body' }]
const AV_STYLES = ['Realistic', 'Cinematic', 'Vintage', 'Cyberpunk', 'Pixar', 'Noir', 'Unspecified']
const ORIENTATIONS = [{ id: 'vertical', label: 'Portrait' }, { id: 'horizontal', label: 'Landscape' }, { id: 'square', label: 'Square' }]
const EXPRESSIVENESS = ['low', 'medium', 'high']

const SCRIPT_LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
    { code: 'mr', label: 'Marathi', flag: '🇮🇳' },
    { code: 'ta', label: 'Tamil', flag: '🇮🇳' },
    { code: 'te', label: 'Telugu', flag: '🇮🇳' },
    { code: 'bn', label: 'Bengali', flag: '🇮🇳' },
    { code: 'kn', label: 'Kannada', flag: '🇮🇳' },
    { code: 'gu', label: 'Gujarati', flag: '🇮🇳' },
    { code: 'es', label: 'Spanish', flag: '🇪🇸' },
    { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
    { code: 'zh', label: 'Mandarin', flag: '🇨🇳' },
    { code: 'fr', label: 'French', flag: '🇫🇷' },
    { code: 'de', label: 'German', flag: '🇩🇪' },
    { code: 'pt', label: 'Portuguese', flag: '🇧🇷' },
    { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', label: 'Korean', flag: '🇰🇷' },
]

const SAMPLE_PROMPTS = [
    'A cheerful Indian woman in a modern kitchen, casual outfit, warm lighting',
    'Professional man in business suit at a tech office, confident pose',
    'Young woman at a coffee shop, trendy streetwear, natural lighting',
    'South Asian man in traditional kurta, outdoor market background',
]

export default function UGCCreator({ activeBrand }) {
    /* ── Core State ── */
    const [step, setStep] = useState(1) // 1=Script, 2=Avatar, 3=Voice, 4=Settings, 5=Review
    const [script, setScript] = useState('')
    const [scriptLang, setScriptLang] = useState('en')
    const [style, setStyle] = useState('testimonial')
    const [platform, setPlatform] = useState('instagram')
    const [duration, setDuration] = useState('30s')

    /* ── Avatar State ── */
    const [avatars, setAvatars] = useState([])
    const [voices, setVoices] = useState([])
    const [sarvamVoices, setSarvamVoices] = useState([])
    const [selectedAvatar, setSelectedAvatar] = useState(null)
    const [selectedVoice, setSelectedVoice] = useState(null)
    const [avatarSearch, setAvatarSearch] = useState('')
    const [avatarTab, setAvatarTab] = useState('stock') // stock | photo | create
    const [photoUrl, setPhotoUrl] = useState('')
    const [voiceTab, setVoiceTab] = useState('heygen')

    /* ── AI Avatar Creator State ── */
    const [showAvatarCreator, setShowAvatarCreator] = useState(false)
    const [avName, setAvName] = useState('')
    const [avAge, setAvAge] = useState('Young Adult')
    const [avGender, setAvGender] = useState('Woman')
    const [avEthnicity, setAvEthnicity] = useState('Unspecified')
    const [avOrientation, setAvOrientation] = useState('vertical')
    const [avPose, setAvPose] = useState('half_body')
    const [avStyle, setAvStyle] = useState('Realistic')
    const [avAppearance, setAvAppearance] = useState('')
    const [creatingAvatar, setCreatingAvatar] = useState(false)
    const [avatarGenId, setAvatarGenId] = useState(null)
    const [avatarGenStatus, setAvatarGenStatus] = useState('')

    /* ── Settings State ── */
    const [motionPrompt, setMotionPrompt] = useState('')
    const [expressiveness, setExpressiveness] = useState('medium')
    const [voiceSpeed, setVoiceSpeed] = useState(1.0)
    const [voicePitch, setVoicePitch] = useState(0)
    const [aspectRatio, setAspectRatio] = useState('9:16')
    const [bgType, setBgType] = useState('none') // none | color | product
    const [bgColor, setBgColor] = useState('#f0f0f0')
    const [productImage, setProductImage] = useState(null) // { s3Url, heygenAssetId }
    const [productUploading, setProductUploading] = useState(false)

    /* ── Language Filter State ── */
    const [voiceLang, setVoiceLang] = useState('all')

    /* ── Product Placement Poses State ── */
    const [placementPoses, setPlacementPoses] = useState([]) // array of image URLs
    const [selectedPose, setSelectedPose] = useState(null)
    const [loadingPoses, setLoadingPoses] = useState(false)

    /* ── Photo Enhancement State ── */
    const [enhancePrompt, setEnhancePrompt] = useState('')
    const [enhancing, setEnhancing] = useState(false)
    const [enhancedUrl, setEnhancedUrl] = useState('')

    /* ── HeyGen Pro Features State ── */
    const [showProFeatures, setShowProFeatures] = useState(false)
    const [lookPrompt, setLookPrompt] = useState('')
    const [generatingLook, setGeneratingLook] = useState(false)
    const [lookResults, setLookResults] = useState([])
    const [addingMotion, setAddingMotion] = useState(false)
    const [motionStatus, setMotionStatus] = useState('')
    const [avatarGroups, setAvatarGroups] = useState([])
    const [selectedGroup, setSelectedGroup] = useState(null)
    const [groupLooks, setGroupLooks] = useState([])

    /* ── Brand Products State ── */
    const [brandProducts, setBrandProducts] = useState([])
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [loadingProducts, setLoadingProducts] = useState(false)

    /* ── Voice Cloning State ── */
    const [clonedVoices, setClonedVoices] = useState([])
    const [loadingClonedVoices, setLoadingClonedVoices] = useState(false)
    const [showClonePanel, setShowClonePanel] = useState(false)
    const [cloneMethod, setCloneMethod] = useState('upload') // 'upload' | 'record'
    const [cloneName, setCloneName] = useState('')
    const [cloneLanguage, setCloneLanguage] = useState('English')
    const [cloneGender, setCloneGender] = useState('Unknown')
    const [cloning, setCloning] = useState(false)
    const [cloneProgress, setCloneProgress] = useState('')
    const [isRecording, setIsRecording] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const [recordedBlob, setRecordedBlob] = useState(null)

    /* ── Emotion Tags / Humanize State ── */
    const [humanizing, setHumanizing] = useState(false)
    const [selectedEmotion, setSelectedEmotion] = useState('auto')

    /* ── Loading / Progress ── */
    const [loadingAvatars, setLoadingAvatars] = useState(false)
    const [loadingVoices, setLoadingVoices] = useState(false)
    const [generatingScript, setGeneratingScript] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [progress, setProgress] = useState(0)
    const [projectId, setProjectId] = useState(null)
    const [videoUrl, setVideoUrl] = useState('')
    const [error, setError] = useState('')
    const [showHistory, setShowHistory] = useState(false)
    const [ugcHistory, setUgcHistory] = useState([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    /* ── Refs ── */
    const pollRef = useRef(null)
    const photoInputRef = useRef(null)
    const productInputRef = useRef(null)
    const currentAudioRef = useRef(null)
    const sarvamPreviewCache = useRef({}) // cache: voiceId -> audioUrl
    const mediaRecorderRef = useRef(null)
    const recordingTimerRef = useRef(null)
    const audioChunksRef = useRef([])
    const cloneAudioInputRef = useRef(null)

    /* ── Saved Avatars (from enhanced/generated photos) ── */
    const [savedAvatars, setSavedAvatars] = useState(() => {
        try { return JSON.parse(localStorage.getItem('mantram-ugc-saved-avatars') || '[]') } catch { return [] }
    })
    const saveSavedAvatar = (url, label) => {
        const newAvatar = { url, label: label || 'Custom Avatar', createdAt: new Date().toISOString() }
        const updated = [newAvatar, ...savedAvatars].slice(0, 20) // Keep max 20
        setSavedAvatars(updated)
        localStorage.setItem('mantram-ugc-saved-avatars', JSON.stringify(updated))
    }

    /* ── Load brand products when brand changes ── */
    async function loadBrandProducts() {
        if (!activeBrand?._id) return
        setLoadingProducts(true)
        try {
            const d = await api(`/products?brandId=${activeBrand._id}&limit=50`)
            setBrandProducts(d.products || [])
        } catch { setBrandProducts([]) }
        setLoadingProducts(false)
    }

    useEffect(() => {
        if (activeBrand?._id) loadBrandProducts()
    }, [activeBrand?._id])

    /* ── Load on mount ── */
    useEffect(() => {
        loadAvatars(); loadVoices(); loadSarvamVoices()
        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
            if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null }
        }
    }, [])

    /* ── Avatar creation polling ── */
    useEffect(() => {
        if (!avatarGenId) return
        const timer = setInterval(async () => {
            try {
                const d = await api(`/video-studio/ugc/avatar-status/${avatarGenId}`)
                setAvatarGenStatus(d.status)
                if (d.status === 'completed') {
                    clearInterval(timer)
                    setCreatingAvatar(false)
                    setShowAvatarCreator(false)
                    // Refresh avatar list
                    loadAvatars()
                    setAvatarGenId(null)
                } else if (d.status === 'failed') {
                    clearInterval(timer)
                    setCreatingAvatar(false)
                    setError(d.error || 'Avatar creation failed')
                    setAvatarGenId(null)
                }
            } catch { }
        }, 5000)
        return () => clearInterval(timer)
    }, [avatarGenId])

    /* ── Audio singleton ── */
    function stopAudio() { if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current.currentTime = 0; currentAudioRef.current = null } }
    function playPreview(url) { stopAudio(); const a = new Audio(url); currentAudioRef.current = a; a.play().catch(() => {}); a.onended = () => { currentAudioRef.current = null } }

    /* ── API calls ── */
    async function loadAvatars() {
        setLoadingAvatars(true)
        try { const d = await api('/video-studio/heygen/avatars'); setAvatars(d.avatars || []) } catch { }
        setLoadingAvatars(false)
    }
    async function loadVoices() {
        setLoadingVoices(true)
        try {
            const d = await api('/video-studio/heygen/voices')
            setVoices(d.voices || [])
            const en = (d.voices || []).find(v => v.language?.toLowerCase().includes('en'))
            if (en) setSelectedVoice(en)
        } catch { }
        setLoadingVoices(false)
    }
    async function loadSarvamVoices() {
        try { const d = await api('/video-studio/ugc/sarvam-voices'); setSarvamVoices(d.voices || []) } catch { }
    }

    /* ── Voice Cloning Functions ── */
    async function loadClonedVoices() {
        setLoadingClonedVoices(true)
        try {
            const d = await api('/video-studio/ugc/voice-clone/list')
            setClonedVoices(d.voices || [])
        } catch { }
        setLoadingClonedVoices(false)
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
            audioChunksRef.current = []
            recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                setRecordedBlob(blob)
                stream.getTracks().forEach(t => t.stop())
                clearInterval(recordingTimerRef.current)
            }
            mediaRecorderRef.current = recorder
            recorder.start()
            setIsRecording(true)
            setRecordingTime(0)
            recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
        } catch (err) {
            setError('Microphone access denied. Please allow mic permission.')
        }
    }

    function stopRecording() {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
        }
    }

    async function handleVoiceClone(audioFile) {
        setCloning(true); setCloneProgress('Uploading audio sample...')
        try {
            // 1. Upload audio
            const formData = new FormData()
            formData.append('audio', audioFile, audioFile.name || 'voice-sample.webm')
            const uploadResp = await fetch(`${API}/video-studio/ugc/voice-clone/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: formData,
            })
            const uploadData = await uploadResp.json()
            if (!uploadData.success) throw new Error(uploadData.error)

            // 2. Submit for cloning
            setCloneProgress('Cloning your voice...')
            const cloneResp = await api('/video-studio/ugc/voice-clone/clone', {
                method: 'POST',
                body: JSON.stringify({
                    audioUrl: uploadData.audioUrl,
                    name: cloneName || 'My Cloned Voice',
                    language: cloneLanguage,
                    gender: cloneGender,
                    brandId: activeBrand?._id,
                }),
            })

            if (!cloneResp.success) throw new Error(cloneResp.error)

            // 3. Poll for completion (Minimax takes 30-60s)
            if (cloneResp.status === 'cloning') {
                setCloneProgress('Processing — this takes 30-60 seconds...')
                const cloneId = cloneResp.cloneId
                let attempts = 0
                const poll = setInterval(async () => {
                    attempts++
                    try {
                        const statusResp = await api(`/video-studio/ugc/voice-clone/status/${cloneId}`)
                        if (statusResp.status === 'ready') {
                            clearInterval(poll)
                            setCloneProgress('✅ Voice cloned successfully!')
                            await loadClonedVoices()
                            setShowClonePanel(false)
                            setCloneName(''); setRecordedBlob(null)
                            setVoiceTab('cloned') // Switch to cloned tab
                            setTimeout(() => setCloneProgress(''), 3000)
                            setCloning(false)
                        } else if (statusResp.status === 'failed' || attempts > 40) {
                            clearInterval(poll)
                            setCloneProgress('❌ Cloning failed. Please try again.')
                            setCloning(false)
                        }
                    } catch { }
                }, 3000)
            } else {
                // Sarvam — instant
                setCloneProgress('✅ Voice profile created!')
                await loadClonedVoices()
                setShowClonePanel(false)
                setCloneName(''); setRecordedBlob(null)
                setVoiceTab('cloned')
                setTimeout(() => { setCloneProgress(''); setCloning(false) }, 2000)
            }
        } catch (err) {
            setCloneProgress(`❌ ${err.message}`)
            setCloning(false)
        }
    }

    async function deleteClonedVoice(id) {
        if (!confirm('Delete this cloned voice?')) return
        try {
            await api(`/video-studio/ugc/voice-clone/${id}`, { method: 'DELETE' })
            setClonedVoices(prev => prev.filter(v => v._id !== id))
        } catch { }
    }

    /* ── Humanize / Emotion Tags ── */
    async function handleHumanize() {
        if (!script.trim()) { setError('Write a script first'); return }
        setHumanizing(true)
        try {
            const langLabel = SCRIPT_LANGUAGES.find(l => l.code === scriptLang)?.label || 'English'
            const d = await api('/video-studio/ugc/script/humanize', {
                method: 'POST',
                body: JSON.stringify({
                    script,
                    emotionTag: selectedEmotion,
                    language: langLabel,
                }),
            })
            if (d.humanizedScript) setScript(d.humanizedScript)
        } catch (err) { setError(err.message) }
        setHumanizing(false)
    }

    function insertEmotionTag(tag) {
        const textarea = document.querySelector('.ugc2-textarea')
        if (!textarea) { setScript(prev => prev + ` ${tag} `); return }
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newScript = script.substring(0, start) + ` ${tag} ` + script.substring(end)
        setScript(newScript)
        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + tag.length + 2, start + tag.length + 2) }, 50)
    }

    async function handleAIScript() {
        if (!activeBrand?._id) { setError('Select a brand first'); return }
        setGeneratingScript(true); setError('')
        try {
            const langLabel = SCRIPT_LANGUAGES.find(l => l.code === scriptLang)?.label || 'English'
            // Build payload with product context and user instructions
            const payload = {
                brandId: activeBrand._id,
                style,
                platform,
                duration,
                language: langLabel,
            }
            // If user selected a specific product, send productId for full DB lookup
            if (selectedProduct?._id) {
                payload.productId = selectedProduct._id
                payload.productName = selectedProduct.title
                payload.productDescription = selectedProduct.description || selectedProduct.shortDescription || ''
            } else {
                payload.productName = activeBrand.name
            }
            // If user typed instructions/brief in textarea, pass as customPrompt
            if (script.trim()) {
                payload.customPrompt = script.trim()
            }
            const d = await api('/video-studio/ugc/generate-script', {
                method: 'POST',
                body: JSON.stringify(payload),
            })
            setScript(d.script || '')
        } catch (e) { setError(e.message) }
        setGeneratingScript(false)
    }

    /* ── Sarvam Voice Preview ── */
    async function handleSarvamPreview(voice) {
        // Check cache first
        if (sarvamPreviewCache.current[voice.voice_id]) {
            playPreview(sarvamPreviewCache.current[voice.voice_id])
            return
        }
        try {
            const d = await api('/video-studio/ugc/sarvam-preview', {
                method: 'POST',
                body: JSON.stringify({ speaker: voice.speaker, langCode: voice.lang_code }),
            })
            if (d.audioUrl) {
                sarvamPreviewCache.current[voice.voice_id] = d.audioUrl
                playPreview(d.audioUrl)
            }
        } catch (e) { setError('Preview failed: ' + e.message) }
    }

    /* ── Photo Upload ── */
    async function onPhotoUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => { setPhotoUrl(ev.target.result); setSelectedAvatar(null); setAvatarTab('photo') }
        reader.readAsDataURL(file)
    }

    /* ── Enhance Photo with AI ── */
    async function handleEnhancePhoto() {
        if (!enhancePrompt.trim()) { setError('Describe how you want to enhance the photo'); return }
        if (!photoUrl) { setError('Upload a photo first'); return }
        setEnhancing(true); setError('')
        try {
            const body = { prompt: enhancePrompt.trim() }
            if (photoUrl.startsWith('data:')) body.imageBase64 = photoUrl
            else body.imageUrl = photoUrl
            const d = await api('/video-studio/ugc/enhance-photo', {
                method: 'POST',
                body: JSON.stringify(body),
            })
            if (d.enhancedUrl) {
                setEnhancedUrl(d.enhancedUrl)
                setPhotoUrl(d.enhancedUrl) // Use the enhanced version
                saveSavedAvatar(d.enhancedUrl, `Enhanced: ${enhancePrompt.trim().substring(0, 30)}`)
            }
        } catch (e) { setError('Enhancement failed: ' + e.message) }
        setEnhancing(false)
    }

    /* ── Product Upload ── */
    async function onProductUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        setProductUploading(true)
        const reader = new FileReader()
        reader.onload = async (ev) => {
            try {
                const d = await api('/video-studio/ugc/upload-product', {
                    method: 'POST',
                    body: JSON.stringify({ imageBase64: ev.target.result, filename: file.name }),
                })
                setProductImage({ s3Url: d.s3Url, heygenAssetId: d.heygenAssetId })
                setBgType('product')
            } catch (e) { setError('Upload failed: ' + e.message) }
            setProductUploading(false)
        }
        reader.readAsDataURL(file)
    }

    /* ── Create AI Avatar ── */
    async function handleCreateAvatar() {
        if (!avName.trim() || !avAppearance.trim()) { setError('Name and appearance description are required'); return }
        setCreatingAvatar(true); setError('')
        try {
            const d = await api('/video-studio/ugc/create-avatar', {
                method: 'POST',
                body: JSON.stringify({ name: avName, age: avAge, gender: avGender, ethnicity: avEthnicity, orientation: avOrientation, pose: avPose, style: avStyle, appearance: avAppearance }),
            })
            setAvatarGenId(d.generationId)
            setAvatarGenStatus('pending')
        } catch (e) { setError(e.message); setCreatingAvatar(false) }
    }

    /* ── Load Video History ── */
    async function loadHistory() {
        setLoadingHistory(true)
        try {
            const d = await api('/video-studio/?mode=ugc&limit=20')
            const projects = d.projects || d.data || []
            setUgcHistory(projects)
        } catch (e) { console.warn('History load failed:', e.message) }
        setLoadingHistory(false)
    }

    /* ── HeyGen Pro Features Handlers ── */
    async function handleGenerateLook() {
        if (!selectedGroup || !lookPrompt.trim()) { setError('Select an avatar group and describe the look'); return }
        setGeneratingLook(true); setError('')
        try {
            const d = await api('/video-studio/ugc/generate-look', {
                method: 'POST',
                body: JSON.stringify({ avatarGroupId: selectedGroup.id, prompt: lookPrompt.trim() }),
            })
            setLookResults(prev => [...prev, { generationId: d.generationId, status: 'pending', prompt: lookPrompt.trim() }])
            setLookPrompt('')
        } catch (e) { setError('Look generation failed: ' + e.message) }
        setGeneratingLook(false)
    }

    async function handleAddMotion(avatarId) {
        if (!avatarId) { setError('Avatar or look ID is required'); return }
        setAddingMotion(true); setMotionStatus(''); setError('')
        try {
            const d = await api('/video-studio/ugc/add-motion', {
                method: 'POST',
                body: JSON.stringify({ id: avatarId, prompt: motionPrompt || 'Natural talking head movement' }),
            })
            setMotionStatus(`✅ Motion training started (ID: ${d.generationId})`)
        } catch (e) { setError('Add motion failed: ' + e.message); setMotionStatus('') }
        setAddingMotion(false)
    }

    async function loadAvatarGroups() {
        try {
            const d = await api('/video-studio/ugc/avatar-groups')
            setAvatarGroups(d.groups || [])
        } catch (e) { console.warn('Load avatar groups failed:', e.message) }
    }

    async function loadGroupLooks(groupId) {
        try {
            const d = await api(`/video-studio/ugc/avatar-groups/${groupId}/looks`)
            setGroupLooks(d.looks || [])
        } catch (e) { console.warn('Load looks failed:', e.message) }
    }

    /* ── Generate Video ── */
    async function handleGenerate() {
        if (!script.trim()) { setError('Write or generate a script first'); return }
        if (!selectedAvatar && !photoUrl) { setError('Select an avatar'); return }
        if (!selectedVoice) { setError('Select a voice'); return }
        stopAudio(); setSubmitting(true); setError(''); setStep(0) // show progress

        try {
            const body = {
                script: script.trim(), aspectRatio, caption: true, speed: voiceSpeed,
                brandId: activeBrand?._id, style, platform,
                title: `UGC — ${STYLES.find(s => s.id === style)?.label || style}`,
                voiceProvider: selectedVoice.provider || 'heygen',
                motionPrompt, expressiveness, voicePitch,
            }
            if (photoUrl) body.photoUrl = photoUrl
            else body.avatarId = selectedAvatar.avatar_id

            if (bgType === 'product' && productImage?.s3Url) body.backgroundUrl = productImage.s3Url
            else if (bgType === 'color') body.backgroundColor = bgColor

            // Handle voice based on type
            const isClonedVoice = selectedVoice.voice_id?.startsWith('cloned__')
            if (isClonedVoice && selectedVoice.provider === 'minimax') {
                // Cloned Minimax voice → generate TTS audio first
                setProgress(2)
                const tts = await api('/video-studio/ugc/minimax-tts', {
                    method: 'POST',
                    body: JSON.stringify({
                        text: script.trim(),
                        voiceId: selectedVoice.voiceId, // The actual custom_voice_id from fal.ai
                        speed: voiceSpeed || 1,
                    }),
                })
                body.audioUrl = tts.audioUrl
                body.voiceId = undefined
                body.voiceProvider = 'heygen' // Still use HeyGen for video, just with external audio
            } else if (selectedVoice.provider === 'sarvam') {
                const tts = await api('/video-studio/ugc/sarvam-tts', {
                    method: 'POST',
                    body: JSON.stringify({ text: script.trim(), speaker: selectedVoice.speaker, langCode: selectedVoice.lang_code }),
                })
                body.audioUrl = tts.audioUrl
                body.voiceId = undefined
            } else {
                body.voiceId = selectedVoice.voice_id
            }

            const d = await api('/video-studio/ugc/generate', { method: 'POST', body: JSON.stringify(body) })
            setProjectId(d.project._id)
            setProgress(5)

            // Poll
            pollRef.current = setInterval(async () => {
                try {
                    const s = await api(`/video-studio/${d.project._id}/status`)
                    const p = s.project || s
                    setProgress(p.generation?.progress || p.progress || 0)
                    if (['completed', 'advanced-complete', 'done'].includes(p.status)) {
                        clearInterval(pollRef.current)
                        setVideoUrl(p.generation?.videoUrl || p.videoUrl || '')
                        setSubmitting(false)
                    } else if (p.status === 'failed') {
                        clearInterval(pollRef.current)
                        setError(p.generation?.error || 'Generation failed')
                        setSubmitting(false); setStep(5)
                    }
                } catch { }
            }, 4000)
        } catch (e) { setError(e.message); setSubmitting(false); setStep(5) }
    }

    /* ── Computed ── */
    const filteredAvatars = avatars.filter(a => {
        if (avatarSearch && !a.avatar_name?.toLowerCase().includes(avatarSearch.toLowerCase())) return false
        return true
    })
    const currentVoices = (voiceTab === 'sarvam' ? sarvamVoices : voices).filter(v => {
        if (voiceLang === 'all') return true
        const lang = (v.language || v.locale || '').toLowerCase()
        return lang.includes(voiceLang.toLowerCase())
    })

    // Extract unique languages from voices for the filter dropdown
    const availableLanguages = [...new Set((voiceTab === 'sarvam' ? sarvamVoices : voices).map(v => v.language || v.locale || 'Unknown').filter(Boolean))].sort()

    // Language groups for structured display
    const LANGUAGE_GROUPS = {
        'Indian': [{ code: 'hi', label: '🇮🇳 Hindi' }, { code: 'mr', label: '🇮🇳 Marathi' }, { code: 'ta', label: '🇮🇳 Tamil' }, { code: 'te', label: '🇮🇳 Telugu' }, { code: 'bn', label: '🇮🇳 Bengali' }, { code: 'kn', label: '🇮🇳 Kannada' }, { code: 'gu', label: '🇮🇳 Gujarati' }],
        'International': [{ code: 'en', label: '🇬🇧 English' }, { code: 'es', label: '🇪🇸 Spanish' }, { code: 'ar', label: '🇸🇦 Arabic' }, { code: 'zh', label: '🇨🇳 Mandarin' }, { code: 'fr', label: '🇫🇷 French' }, { code: 'de', label: '🇩🇪 German' }, { code: 'pt', label: '🇧🇷 Portuguese' }, { code: 'ja', label: '🇯🇵 Japanese' }, { code: 'ko', label: '🇰🇷 Korean' }],
    }

    /* ── Generate Placement Poses ── */
    const handleGenPoses = async () => {
        if (!productImage?.s3Url || !selectedAvatar?.avatar_id) return
        setLoadingPoses(true)
        try {
            const resp = await fetch('/api/video-studio/ugc/placement-poses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ productImageUrl: productImage.s3Url, avatarId: selectedAvatar.avatar_id }),
            })
            const d = await resp.json()
            if (d.success && d.images?.length) {
                setPlacementPoses(d.images)
                setSelectedPose(d.images[0]) // Pre-select first
            } else {
                setError(d.error || 'Failed to generate poses')
            }
        } catch (e) { setError(e.message) }
        setLoadingPoses(false)
    }
    const stepTitles = ['', 'Script', 'Avatar', 'Voice', 'Settings', 'Review']

    /* ── Render ── */
    return (
        <>
            <style>{CSS}</style>
            <div className="ugc2-root">
                {error && <div className="ugc2-toast"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}


                {/* ── Progress View ── */}
                {step === 0 && (
                    <div className="ugc2-progress-view">
                        {videoUrl ? (
                            <div className="ugc2-done-card">
                                <video src={videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 16 }} />
                                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                    <a href={videoUrl} download className="ugc2-btn-pri">Download</a>
                                    <button className="ugc2-btn-sec" onClick={() => { setStep(1); setVideoUrl(''); setProgress(0); setProjectId(null) }}>Create New</button>
                                </div>
                            </div>
                        ) : (
                            <div className="ugc2-gen-card">
                                <div className="ugc2-ring">
                                    <svg viewBox="0 0 100 100"><circle className="bg" cx="50" cy="50" r="44" /><circle className="fg" cx="50" cy="50" r="44" stroke="url(#ugcg2)" strokeDasharray="276.46" strokeDashoffset={276.46 * (1 - progress / 100)} /></svg>
                                    <span className="pct">{progress}%</span>
                                    <defs><linearGradient id="ugcg2"><stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#06b6d4" /></linearGradient></defs>
                                </div>
                                <h3>Generating your UGC video...</h3>
                                <p>This typically takes 1-3 minutes</p>
                            </div>
                        )}
                    </div>
                )}

                {step >= 1 && (
                    <>
                        {/* ── Step Nav ── */}
                        <div className="ugc2-steps">
                            {[1,2,3,4,5].map(s => (
                                <button key={s} className={`ugc2-step ${step === s ? 'active' : ''} ${s < step ? 'done' : ''}`} onClick={() => s <= step && setStep(s)}>
                                    <span className="ugc2-step-num">{s < step ? '✓' : s}</span>
                                    <span className="ugc2-step-label">{stepTitles[s]}</span>
                                </button>
                            ))}
                        </div>

                        {/* ══ Step 1: Script ══ */}
                        {step === 1 && (
                            <div className="ugc2-panel">
                                <div className="ugc2-panel-header">
                                    <h3>Write your script</h3>
                                    <CreditTooltipWrapper action="promptEnhance">
                                        <button className="ugc2-ai-btn" onClick={handleAIScript} disabled={generatingScript}>
                                            {generatingScript ? <span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 14 }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>}
                                            AI Write
                                        </button>
                                    </CreditTooltipWrapper>
                                </div>

                                {/* ── Product Selector ── */}
                                {brandProducts.length > 0 && (
                                    <div className="ugc2-product-selector">
                                        <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, display: 'block' }}>
                                            📦 Product Context {selectedProduct ? `— ${selectedProduct.title}` : '— General Brand'}
                                        </label>
                                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                                            <button
                                                className={`ugc2-product-chip ${!selectedProduct ? 'active' : ''}`}
                                                onClick={() => setSelectedProduct(null)}>
                                                🏢 General (Brand)
                                            </button>
                                            {brandProducts.map(p => (
                                                <button key={p._id}
                                                    className={`ugc2-product-chip ${selectedProduct?._id === p._id ? 'active' : ''}`}
                                                    onClick={() => setSelectedProduct(p)}>
                                                    {p.images?.[0]?.url ? (
                                                        <img src={p.images[0].url} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
                                                    ) : '📦'}
                                                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                                                    {p.price?.amount ? <span style={{ fontSize: 10, opacity: .6 }}>₹{p.price.amount}</span> : null}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <textarea className="ugc2-textarea" lang={scriptLang}
                                    placeholder={selectedProduct
                                        ? `Write your brief for "${selectedProduct.title}"...\n\nE.g., "Highlight the premium quality and affordable price. Target young professionals."\n\nOr click 'AI Write' to auto-generate from your brand + product data.`
                                        : scriptLang === 'hi' ? 'हिंदी में अपनी UGC स्क्रिप्ट यहाँ लिखें...' : scriptLang === 'mr' ? 'मराठीत तुमची UGC स्क्रिप्ट लिहा...' : scriptLang === 'ta' ? 'உங்கள் UGC ஸ்கிரிப்ட்டை இங்கே எழுதுங்கள்...' : scriptLang === 'bn' ? 'আপনার UGC স্ক্রিপ্ট এখানে লিখুন...' : "Type your brief or paste your UGC script here...\n\nOr click 'AI Write' to generate from your brand identity."
                                    }
                                    value={script} onChange={e => setScript(e.target.value)} rows={8} />

                                {/* ── Emotion Tags + Humanize ── */}
                                <div className="ugc2-emotion-bar">
                                    <div className="ugc2-emotion-tags">
                                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginRight: 6 }}>🎭 Emotion Tags:</span>
                                        {['(laughs)', '(sighs)', '(coughs)', '(clears throat)', '(gasps)', '(sniffs)', '(groans)', '(yawns)'].map(tag => (
                                            <button key={tag} className="ugc2-emotion-chip" onClick={() => insertEmotionTag(tag)} title={`Insert ${tag}`}>
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="ugc2-humanize-row">
                                        <select className="ugc2-emotion-select" value={selectedEmotion} onChange={e => setSelectedEmotion(e.target.value)}>
                                            <option value="auto">🎭 Auto (Natural)</option>
                                            <option value="happy">😄 Happy</option>
                                            <option value="sad">😢 Sad</option>
                                            <option value="surprised">😲 Surprised</option>
                                            <option value="nervous">😰 Nervous</option>
                                            <option value="casual">😎 Casual</option>
                                            <option value="energetic">🔥 Energetic</option>
                                        </select>
                                        <button className="ugc2-humanize-btn" onClick={handleHumanize} disabled={humanizing || !script.trim()}>
                                            {humanizing
                                                ? <><span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 14 }}>progress_activity</span> Humanizing...</>
                                                : <>✨ Humanize Script</>
                                            }
                                        </button>
                                    </div>
                                </div>

                                <div className="ugc2-script-meta">
                                    <span className="ugc2-word-count">{script.trim().split(/\s+/).filter(Boolean).length} words · ~{Math.round(script.trim().split(/\s+/).filter(Boolean).length / 2.5)}s</span>
                                    <div className="ugc2-pills-row">
                                        <div className="ugc2-pill-group">
                                            <label>🌐 Script Language</label>
                                            <div className="ugc2-pill-wrap">
                                                {SCRIPT_LANGUAGES.slice(0, 8).map(l => (
                                                    <button key={l.code} className={`ugc2-lang-pill ${scriptLang === l.code ? 'active' : ''}`} onClick={() => setScriptLang(l.code)}>
                                                        {l.flag} {l.label}
                                                    </button>
                                                ))}
                                                {SCRIPT_LANGUAGES.length > 8 && (
                                                    <details style={{ display: 'inline' }}>
                                                        <summary className="ugc2-lang-pill" style={{ listStyle: 'none', cursor: 'pointer' }}>
                                                            + {SCRIPT_LANGUAGES.length - 8} more
                                                        </summary>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                                            {SCRIPT_LANGUAGES.slice(8).map(l => (
                                                                <button key={l.code} className={`ugc2-lang-pill ${scriptLang === l.code ? 'active' : ''}`} onClick={() => setScriptLang(l.code)}>
                                                                    {l.flag} {l.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        </div>
                                        <div className="ugc2-pill-group">
                                            <label>Style</label>
                                            <div className="ugc2-pill-wrap">{STYLES.map(s => <button key={s.id} className={`ugc2-pill ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>{s.icon} {s.label}</button>)}</div>
                                        </div>
                                        <div className="ugc2-pill-group">
                                            <label>Platform</label>
                                            <div className="ugc2-pill-wrap">
                                                {['instagram', 'tiktok', 'youtube'].map(p => <button key={p} className={`ugc2-pill ${platform === p ? 'on' : ''}`} onClick={() => setPlatform(p)}>{p === 'instagram' ? '📸' : p === 'tiktok' ? '♪' : '▶'} {p.charAt(0).toUpperCase() + p.slice(1)}</button>)}
                                            </div>
                                        </div>
                                        <div className="ugc2-pill-group">
                                            <label>Duration</label>
                                            <div className="ugc2-pill-wrap">
                                                {['15s', '30s', '60s'].map(d => <button key={d} className={`ugc2-pill ${duration === d ? 'on' : ''}`} onClick={() => setDuration(d)}>{d}</button>)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="ugc2-nav"><div /><button className="ugc2-btn-pri" disabled={!script.trim()} onClick={() => setStep(2)}>Next: Choose Avatar →</button></div>
                            </div>
                        )}

                        {/* ══ Step 2: Avatar ══ */}
                        {step === 2 && (
                            <div className="ugc2-panel">
                                <div className="ugc2-panel-header">
                                    <h3>Choose your avatar</h3>
                                    <div className="ugc2-tab-row">
                                        <button className={`ugc2-tab ${avatarTab === 'stock' ? 'on' : ''}`} onClick={() => setAvatarTab('stock')}>🎭 Stock Avatars</button>
                                        <button className={`ugc2-tab ${avatarTab === 'photo' ? 'on' : ''}`} onClick={() => setAvatarTab('photo')}>📷 Your Photo</button>
                                        <button className={`ugc2-tab ${avatarTab === 'create' ? 'on' : ''}`} onClick={() => { setAvatarTab('create'); setShowAvatarCreator(true) }}>✨ Create with AI</button>
                                        {savedAvatars.length > 0 && <button className={`ugc2-tab ${avatarTab === 'saved' ? 'on' : ''}`} onClick={() => setAvatarTab('saved')}>💾 My Avatars <span style={{ background: 'rgba(124,58,237,.2)', borderRadius: 8, padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{savedAvatars.length}</span></button>}
                                    </div>
                                </div>

                                {avatarTab === 'stock' && (
                                    <>
                                        <div className="ugc2-search"><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#64748b' }}>search</span><input placeholder="Search avatars..." value={avatarSearch} onChange={e => setAvatarSearch(e.target.value)} /></div>
                                        <div className="ugc2-av-grid">
                                            {loadingAvatars ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="ugc2-av-skel" />) :
                                                filteredAvatars.slice(0, 40).map(a => (
                                                    <button key={a.avatar_id} className={`ugc2-av ${selectedAvatar?.avatar_id === a.avatar_id ? 'selected' : ''}`} onClick={() => { setSelectedAvatar(a); setPhotoUrl('') }}>
                                                        <div className="ugc2-av-img">{a.preview_image_url ? <img src={a.preview_image_url} alt={a.avatar_name} loading="lazy" /> : <div className="ugc2-av-fallback">🧑</div>}</div>
                                                        <div className="ugc2-av-label">{a.avatar_name}</div>
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    </>
                                )}

                                {avatarTab === 'photo' && (
                                    <div className="ugc2-photo-section">
                                        {photoUrl ? (
                                            <>
                                                <div className="ugc2-photo-preview">
                                                    <img src={photoUrl} alt="Your photo" />
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                        <button className="ugc2-btn-sec" onClick={() => { setPhotoUrl(''); setEnhancedUrl(''); setEnhancePrompt(''); photoInputRef.current?.click() }}>Change Photo</button>
                                                        {enhancedUrl && <button className="ugc2-btn-sec" style={{ color: '#f59e0b' }} onClick={() => { setPhotoUrl(enhancedUrl); }}>Use Enhanced</button>}
                                                    </div>
                                                </div>

                                                {/* ── AI Enhancement Section ── */}
                                                <div className="ugc2-enhance-box">
                                                    <h4>✨ Enhance with AI</h4>
                                                    <p className="ugc2-enhance-desc">Describe changes — clothing, location, lighting, style</p>
                                                    <div className="ugc2-enhance-chips">
                                                        {[
                                                            { label: '👔 Business suit, office', prompt: 'Wearing a professional business suit in a modern corporate office with glass walls' },
                                                            { label: '☀️ Outdoor, casual', prompt: 'Casual trendy outfit, standing outdoors in a sunny park with green trees' },
                                                            { label: '🏠 Home kitchen', prompt: 'Casual comfortable clothing, in a warm modern kitchen with wooden countertops' },
                                                            { label: '🛍️ Shopping, stylish', prompt: 'Fashionable streetwear outfit, in a vibrant shopping district with colorful storefronts' },
                                                            { label: '💻 Tech office', prompt: 'Smart casual tech startup outfit, in a modern open-plan office with monitors and plants' },
                                                            { label: '🏋️ Gym, athletic', prompt: 'Athletic sportswear, in a modern gym with equipment in the background' },
                                                        ].map((chip, i) => (
                                                            <button key={i} className="ugc2-enhance-chip" onClick={() => setEnhancePrompt(chip.prompt)}>{chip.label}</button>
                                                        ))}
                                                    </div>
                                                    <div className="ugc2-enhance-input-row">
                                                        <input value={enhancePrompt} onChange={e => setEnhancePrompt(e.target.value)} placeholder="E.g., Professional outfit, luxury hotel lobby, warm lighting" />
                                                        <CreditTooltipWrapper action="imageEnhance">
                                                            <button className="ugc2-btn-pri" onClick={handleEnhancePhoto} disabled={enhancing || !enhancePrompt.trim()}>
                                                                {enhancing ? <span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 16 }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>}
                                                                {enhancing ? 'Enhancing...' : 'Enhance'}
                                                            </button>
                                                        </CreditTooltipWrapper>
                                                    </div>
                                                    {enhancing && <p className="ugc2-enhance-status">🎨 AI is enhancing your photo... This takes 10-30 seconds</p>}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="ugc2-photo-drop" onClick={() => photoInputRef.current?.click()}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#7c3aed' }}>add_a_photo</span>
                                                <p>Upload a photo to create a talking avatar</p>
                                                <span style={{ fontSize: 12, color: '#64748b' }}>Best results with clear front-facing headshots</span>
                                            </div>
                                        )}
                                        <input type="file" ref={photoInputRef} accept="image/*" hidden onChange={onPhotoUpload} />

                                        {/* My Saved Avatars */}
                                        {savedAvatars.length > 0 && (
                                            <div style={{ marginTop: 16 }}>
                                                <h4 style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>collections</span>
                                                    My Saved Avatars ({savedAvatars.length})
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
                                                    {savedAvatars.map((av, idx) => (
                                                        <div key={idx} style={{
                                                            position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                                                            border: photoUrl === av.url ? '2px solid #7c3aed' : '2px solid transparent',
                                                            boxShadow: photoUrl === av.url ? '0 0 10px rgba(124,58,237,.3)' : 'none',
                                                            transition: 'all .2s',
                                                        }} onClick={() => { setPhotoUrl(av.url); setSelectedAvatar({ avatar_id: null, avatar_name: av.label, preview_image_url: av.url }) }}>
                                                            <img src={av.url} alt={av.label} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.7))', padding: '12px 4px 4px', fontSize: 9, color: '#e2e8f0', textAlign: 'center' }}>
                                                                {av.label.substring(0, 15)}
                                                            </div>
                                                            <button onClick={e => { e.stopPropagation(); const u = savedAvatars.filter((_, i) => i !== idx); setSavedAvatars(u); localStorage.setItem('mantram-ugc-saved-avatars', JSON.stringify(u)) }}
                                                                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.5)', border: 'none', color: '#ef4444', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {avatarTab === 'create' && (
                                    <div className="ugc2-create-section">
                                        {creatingAvatar ? (
                                            <div className="ugc2-creating-state">
                                                <span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 40, color: '#7c3aed' }}>progress_activity</span>
                                                <h4>Creating your AI avatar...</h4>
                                                <p>Status: {avatarGenStatus || 'Starting...'} — This takes 30-60 seconds</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="ugc2-create-grid">
                                                    <div className="ugc2-field"><label>Name *</label><input value={avName} onChange={e => setAvName(e.target.value)} placeholder="Avatar name" /></div>
                                                    <div className="ugc2-field"><label>Age</label><select value={avAge} onChange={e => setAvAge(e.target.value)}>{AGES.map(a => <option key={a}>{a}</option>)}</select></div>
                                                    <div className="ugc2-field"><label>Gender</label><select value={avGender} onChange={e => setAvGender(e.target.value)}>{GENDERS.map(g => <option key={g}>{g}</option>)}</select></div>
                                                    <div className="ugc2-field"><label>Ethnicity</label><select value={avEthnicity} onChange={e => setAvEthnicity(e.target.value)}>{ETHNICITIES.map(e => <option key={e}>{e}</option>)}</select></div>
                                                </div>
                                                <div className="ugc2-field full"><label>Describe your avatar *</label><textarea value={avAppearance} onChange={e => setAvAppearance(e.target.value)} placeholder="E.g., A friendly Indian woman in modern casual wear, warm kitchen background..." rows={3} /></div>
                                                <div className="ugc2-sample-prompts">
                                                    <span style={{ fontSize: 11, color: '#64748b' }}>Try a sample:</span>
                                                    {SAMPLE_PROMPTS.map((p, i) => <button key={i} className="ugc2-sample" onClick={() => setAvAppearance(p)}>{p.substring(0, 40)}...</button>)}
                                                </div>
                                                <div className="ugc2-create-opts">
                                                    <div className="ugc2-pill-group"><label>Pose</label><div className="ugc2-pill-wrap">{POSES.map(p => <button key={p.id} className={`ugc2-pill ${avPose === p.id ? 'on' : ''}`} onClick={() => setAvPose(p.id)}>{p.label}</button>)}</div></div>
                                                    <div className="ugc2-pill-group"><label>Style</label><div className="ugc2-pill-wrap">{AV_STYLES.map(s => <button key={s} className={`ugc2-pill ${avStyle === s ? 'on' : ''}`} onClick={() => setAvStyle(s)}>{s}</button>)}</div></div>
                                                    <div className="ugc2-pill-group"><label>Orientation</label><div className="ugc2-pill-wrap">{ORIENTATIONS.map(o => <button key={o.id} className={`ugc2-pill ${avOrientation === o.id ? 'on' : ''}`} onClick={() => setAvOrientation(o.id)}>{o.label}</button>)}</div></div>
                                                </div>
                                                <button className="ugc2-btn-pri" onClick={handleCreateAvatar} disabled={!avName.trim() || !avAppearance.trim()} style={{ marginTop: 16 }}>✨ Generate Avatar</button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {avatarTab === 'saved' && (
                                    <div style={{ padding: '12px 0' }}>
                                        <div className="ugc2-av-grid">
                                            {savedAvatars.map((av, idx) => (
                                                <button key={idx} className={`ugc2-av ${photoUrl === av.url ? 'selected' : ''}`}
                                                    onClick={() => { setPhotoUrl(av.url); setSelectedAvatar({ avatar_id: null, avatar_name: av.label, preview_image_url: av.url }) }}>
                                                    <div className="ugc2-av-img">
                                                        <img src={av.url} alt={av.label} loading="lazy" />
                                                    </div>
                                                    <span className="ugc2-av-name">{av.label.substring(0, 20)}</span>
                                                    <button onClick={e => { e.stopPropagation(); const u = savedAvatars.filter((_, i) => i !== idx); setSavedAvatars(u); localStorage.setItem('mantram-ugc-saved-avatars', JSON.stringify(u)) }}
                                                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.6)', border: 'none', color: '#ef4444', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>✕</button>
                                                </button>
                                            ))}
                                        </div>
                                        {savedAvatars.length === 0 && (
                                            <p style={{ textAlign: 'center', color: '#64748b', padding: 30 }}>No saved avatars yet. Enhance a photo or create an AI avatar to save it here.</p>
                                        )}
                                    </div>
                                )}

                                {/* ── HeyGen Pro Features — Generate Looks, Add Motion, Digital Twin ── */}
                                <div style={{ marginTop: 16, borderRadius: 14, border: '1px solid rgba(124,58,237,.15)', overflow: 'hidden' }}>
                                    <button onClick={() => { setShowProFeatures(!showProFeatures); if (!showProFeatures && avatarGroups.length === 0) loadAvatarGroups() }}
                                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'linear-gradient(135deg, rgba(124,58,237,.08), rgba(139,92,246,.04))', border: 'none', color: '#a78bfa', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                                        <span>✨ Pro Features — Looks · Motion · Digital Twin</span>
                                        <span style={{ transition: 'transform .2s', transform: showProFeatures ? 'rotate(180deg)' : 'none' }}>▾</span>
                                    </button>

                                    {showProFeatures && (
                                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

                                            {/* Generate Looks */}
                                            <div style={{ background: 'rgba(255,255,255,.02)', borderRadius: 12, padding: 14, border: '1px solid rgba(255,255,255,.04)' }}>
                                                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    👔 Generate Looks <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>Create outfit & scene variations</span>
                                                </h4>

                                                {avatarGroups.length > 0 ? (
                                                    <>
                                                        <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Select Avatar Group:</label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                                            {avatarGroups.filter(g => g.group_type !== 'PUBLIC').map(g => (
                                                                <button key={g.id} className={`ugc2-pill ${selectedGroup?.id === g.id ? 'on' : ''}`}
                                                                    onClick={() => { setSelectedGroup(g); loadGroupLooks(g.id) }}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    {g.preview_image && <img src={g.preview_image} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />}
                                                                    {g.name} ({g.num_looks} looks)
                                                                </button>
                                                            ))}
                                                        </div>

                                                        {groupLooks.length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                                                {groupLooks.map(l => (
                                                                    <div key={l.id || l.avatar_id} style={{ width: 60, height: 60, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(124,58,237,.2)', cursor: 'pointer' }}
                                                                        onClick={() => setSelectedAvatar({ avatar_id: l.id || l.avatar_id, avatar_name: l.name || selectedGroup?.name, preview_image_url: l.image_url || l.preview_image })}>
                                                                        <img src={l.image_url || l.preview_image} alt={l.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <input value={lookPrompt} onChange={e => setLookPrompt(e.target.value)} placeholder="E.g., Business suit in a modern office" style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
                                                            <button className="ugc2-btn-pri" style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                                                                onClick={handleGenerateLook} disabled={generatingLook || !selectedGroup || !lookPrompt.trim()}>
                                                                {generatingLook ? '⏳ Generating...' : '👔 Generate Look'}
                                                            </button>
                                                        </div>
                                                        {lookResults.length > 0 && (
                                                            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                                                                {lookResults.map((r, i) => (<div key={i}>Look #{i + 1}: {r.status} — "{r.prompt.substring(0, 40)}..."</div>))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                                                        No avatar groups found. Create a Photo Avatar first to generate looks.
                                                        <button className="ugc2-btn-sec" style={{ marginLeft: 8, fontSize: 11, padding: '3px 8px' }} onClick={loadAvatarGroups}>↻ Refresh</button>
                                                    </p>
                                                )}
                                            </div>

                                            {/* Add Motion */}
                                            <div style={{ background: 'rgba(255,255,255,.02)', borderRadius: 12, padding: 14, border: '1px solid rgba(255,255,255,.04)' }}>
                                                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    🏃 Add Motion <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>Add body animation to avatar/look</span>
                                                </h4>
                                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 8px' }}>
                                                    Add natural movement to your selected avatar.
                                                </p>
                                                <button className="ugc2-btn-pri" style={{ fontSize: 12, padding: '6px 14px' }}
                                                    onClick={() => handleAddMotion(selectedAvatar?.avatar_id)} disabled={addingMotion || !selectedAvatar?.avatar_id}>
                                                    {addingMotion ? <><span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 14 }}>progress_activity</span> Adding Motion...</> : '🏃 Add Motion to Avatar'}
                                                </button>
                                                {motionStatus && <p style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>{motionStatus}</p>}
                                                {!selectedAvatar?.avatar_id && <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>ℹ️ Select a stock avatar or generated avatar with an ID to add motion</p>}
                                            </div>

                                            {/* Digital Twin Info */}
                                            <div style={{ background: 'rgba(255,255,255,.02)', borderRadius: 12, padding: 14, border: '1px solid rgba(255,255,255,.04)' }}>
                                                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    🪞 Digital Twin <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>Create a fully animated clone</span>
                                                </h4>
                                                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px', lineHeight: 1.5 }}>
                                                    Create a Digital Twin by recording a 2-5 minute video. Your twin will talk, gesture, and emote just like you.
                                                </p>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    <a href="https://app.heygen.com/avatars/create-instant-avatar" target="_blank" rel="noreferrer"
                                                        className="ugc2-btn-pri" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>
                                                        🪞 Create Digital Twin on HeyGen
                                                    </a>
                                                    <a href="https://app.heygen.com/voices" target="_blank" rel="noreferrer"
                                                        className="ugc2-btn-sec" style={{ fontSize: 12, padding: '6px 14px', textDecoration: 'none' }}>
                                                        🎙️ Clone Your Voice
                                                    </a>
                                                </div>
                                                <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>
                                                    After creating on HeyGen, your Digital Twin will automatically appear in the Stock Avatars list.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="ugc2-nav">
                                    <button className="ugc2-btn-sec" onClick={() => setStep(1)}>← Back</button>
                                    <button className="ugc2-btn-pri" disabled={!selectedAvatar && !photoUrl} onClick={() => setStep(3)}>Next: Select Voice →</button>
                                </div>
                            </div>
                        )}

                        {/* ══ Step 3: Voice ══ */}
                        {step === 3 && (
                            <div className="ugc2-panel">
                                <div className="ugc2-panel-header">
                                    <h3>Select a voice</h3>
                                    <div className="ugc2-tab-row">
                                        <button className={`ugc2-tab ${voiceTab === 'heygen' ? 'on' : ''}`} onClick={() => { setVoiceTab('heygen'); setVoiceLang('all') }}>🌍 Global</button>
                                        <button className={`ugc2-tab ${voiceTab === 'sarvam' ? 'on' : ''}`} onClick={() => { setVoiceTab('sarvam'); setVoiceLang('all') }}>🇮🇳 Indian</button>
                                        <button className={`ugc2-tab ${voiceTab === 'cloned' ? 'on' : ''}`} onClick={() => { setVoiceTab('cloned'); loadClonedVoices() }}>🎤 My Voices {clonedVoices.length > 0 && <span style={{ background: 'rgba(124,58,237,.2)', borderRadius: 8, padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{clonedVoices.length}</span>}</button>
                                    </div>
                                </div>

                                {/* Language Filter — Premium Pill UI */}
                                <div className="ugc2-lang-filter" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <button className={`ugc2-lang-pill ${voiceLang === 'all' ? 'active' : ''}`} onClick={() => setVoiceLang('all')}>
                                            ✨ All <span className="ugc2-lang-count">{(voiceTab === 'sarvam' ? sarvamVoices : voices).length}</span>
                                        </button>
                                        {voiceTab === 'heygen' && <>
                                            <span style={{ fontSize: 10, color: '#475569', margin: '0 2px' }}>|</span>
                                            {LANGUAGE_GROUPS.Indian.map(l => (
                                                <button key={l.code} className={`ugc2-lang-pill ${voiceLang === l.code ? 'active' : ''}`} onClick={() => setVoiceLang(l.code)}>
                                                    {l.label}
                                                </button>
                                            ))}
                                            <span style={{ fontSize: 10, color: '#475569', margin: '0 2px' }}>|</span>
                                            {LANGUAGE_GROUPS.International.map(l => (
                                                <button key={l.code} className={`ugc2-lang-pill ${voiceLang === l.code ? 'active' : ''}`} onClick={() => setVoiceLang(l.code)}>
                                                    {l.label}
                                                </button>
                                            ))}
                                        </>}
                                        {voiceTab === 'sarvam' && availableLanguages.map(l => (
                                            <button key={l} className={`ugc2-lang-pill ${voiceLang === l ? 'active' : ''}`} onClick={() => setVoiceLang(l)}>
                                                🇮🇳 {l}
                                            </button>
                                        ))}
                                    </div>
                                    {voiceLang !== 'all' && (
                                        <span style={{ fontSize: 11, color: '#a78bfa' }}>
                                            Showing {currentVoices.length} {voiceLang !== 'all' ? `"${SCRIPT_LANGUAGES.find(l => l.code === voiceLang)?.label || voiceLang}"` : ''} voice{currentVoices.length !== 1 ? 's' : ''} 
                                            <button onClick={() => setVoiceLang('all')} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 11, marginLeft: 6 }}>× Clear filter</button>
                                        </span>
                                    )}
                                </div>

                                {/* ── My Voices Tab (Cloned) ── */}
                                {voiceTab === 'cloned' && (
                                    <div style={{ padding: '12px 0' }}>
                                        {/* Clone New Voice Button */}
                                        <button className="ugc2-clone-trigger" onClick={() => setShowClonePanel(!showClonePanel)}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
                                            Clone New Voice
                                        </button>

                                        {/* Clone Panel */}
                                        {showClonePanel && (
                                            <div className="ugc2-clone-panel">
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                                    <button className={`ugc2-pill ${cloneMethod === 'upload' ? 'on' : ''}`} onClick={() => setCloneMethod('upload')}>📁 Upload Audio</button>
                                                    <button className={`ugc2-pill ${cloneMethod === 'record' ? 'on' : ''}`} onClick={() => setCloneMethod('record')}>🎙️ Record</button>
                                                </div>

                                                {cloneMethod === 'upload' && (
                                                    <div className="ugc2-clone-upload-area">
                                                        <input type="file" ref={cloneAudioInputRef} accept=".mp3,.wav,.m4a,.webm,.ogg" style={{ display: 'none' }} onChange={e => {
                                                            if (e.target.files?.[0]) setRecordedBlob(e.target.files[0])
                                                        }} />
                                                        <button className="ugc2-btn-sec" onClick={() => cloneAudioInputRef.current?.click()} style={{ width: '100%', padding: '16px', border: '2px dashed rgba(124,58,237,.3)' }}>
                                                            {recordedBlob ? `✅ ${recordedBlob.name || 'Audio selected'} (${(recordedBlob.size / 1024).toFixed(0)}KB)` : '📂 Click to upload audio file (10s+ recommended)'}
                                                        </button>
                                                    </div>
                                                )}

                                                {cloneMethod === 'record' && (
                                                    <div className="ugc2-clone-record-area">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', padding: 16 }}>
                                                            {!isRecording ? (
                                                                <button className="ugc2-record-btn" onClick={startRecording}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444' }}>mic</span>
                                                                    <span>Start Recording</span>
                                                                </button>
                                                            ) : (
                                                                <button className="ugc2-record-btn recording" onClick={stopRecording}>
                                                                    <span className="material-symbols-outlined ugc2-pulse" style={{ fontSize: 28, color: '#ef4444' }}>stop_circle</span>
                                                                    <span>{recordingTime}s — Click to stop</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                        {recordedBlob && !isRecording && <p style={{ fontSize: 12, color: '#a78bfa', textAlign: 'center' }}>✅ Recording captured ({(recordedBlob.size / 1024).toFixed(0)}KB)</p>}
                                                        <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', margin: '4px 0' }}>Record at least 10 seconds for best results</p>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                                    <input placeholder="Voice Name" value={cloneName} onChange={e => setCloneName(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13 }} />
                                                    <select value={cloneLanguage} onChange={e => setCloneLanguage(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13 }}>
                                                        <option value="English">English</option>
                                                        <option value="Hindi">Hindi</option>
                                                        <option value="Tamil">Tamil</option>
                                                        <option value="Telugu">Telugu</option>
                                                        <option value="Bengali">Bengali</option>
                                                        <option value="Marathi">Marathi</option>
                                                        <option value="Gujarati">Gujarati</option>
                                                        <option value="Punjabi">Punjabi</option>
                                                        <option value="Kannada">Kannada</option>
                                                        <option value="Malayalam">Malayalam</option>
                                                        <option value="Spanish">Spanish</option>
                                                        <option value="French">French</option>
                                                        <option value="German">German</option>
                                                        <option value="Japanese">Japanese</option>
                                                        <option value="Korean">Korean</option>
                                                    </select>
                                                    <select value={cloneGender} onChange={e => setCloneGender(e.target.value)} style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '8px 10px', color: '#e2e8f0', fontSize: 13 }}>
                                                        <option value="Unknown">Gender</option>
                                                        <option value="Male">Male</option>
                                                        <option value="Female">Female</option>
                                                    </select>
                                                </div>

                                                {['Hindi','Tamil','Telugu','Bengali','Marathi','Gujarati','Punjabi','Kannada','Malayalam'].includes(cloneLanguage) && (
                                                    <p style={{ fontSize: 11, color: '#a78bfa', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>🇮🇳 Will use <strong>Sarvam AI</strong> voice model for {cloneLanguage}</p>
                                                )}
                                                {!['Hindi','Tamil','Telugu','Bengali','Marathi','Gujarati','Punjabi','Kannada','Malayalam'].includes(cloneLanguage) && (
                                                    <p style={{ fontSize: 11, color: '#60a5fa', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>🔊 Will use <strong>Minimax HD</strong> voice model</p>
                                                )}

                                                <button className="ugc2-btn-pri" style={{ width: '100%', marginTop: 12 }} disabled={cloning || !recordedBlob}
                                                    onClick={() => handleVoiceClone(recordedBlob)}>
                                                    {cloning ? cloneProgress : '🎙️ Clone My Voice'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Cloned Voices List */}
                                        {loadingClonedVoices ? (
                                            <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Loading voices...</p>
                                        ) : clonedVoices.length === 0 && !showClonePanel ? (
                                            <div style={{ textAlign: 'center', padding: '30px 20px', color: '#64748b' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: .4 }}>mic</span>
                                                <p style={{ margin: '8px 0' }}>No cloned voices yet</p>
                                                <p style={{ fontSize: 12 }}>Record or upload your voice to create a clone</p>
                                            </div>
                                        ) : (
                                            <div className="ugc2-voice-list" style={{ marginTop: 12 }}>
                                                {clonedVoices.filter(v => v.status === 'ready').map(v => (
                                                    <button key={v._id} className={`ugc2-voice-row ${selectedVoice?.voice_id === v.voice_id ? 'selected' : ''}`} onClick={() => setSelectedVoice(v)}>
                                                        <div className="ugc2-voice-info">
                                                            <span className="ugc2-voice-name">🎤 {v.name}</span>
                                                            <span className="ugc2-voice-badge">{v.language}</span>
                                                            <span className="ugc2-voice-badge">{v.provider === 'minimax' ? 'HD Clone' : 'Sarvam'}</span>
                                                            {v.gender !== 'Unknown' && <span className="ugc2-voice-badge">{v.gender}</span>}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            {v.previewAudioUrl && (
                                                                <button className="ugc2-play-btn" onClick={e => { e.stopPropagation(); playPreview(v.previewAudioUrl) }} title="Preview">
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                                                                </button>
                                                            )}
                                                            <button className="ugc2-play-btn" onClick={e => { e.stopPropagation(); deleteClonedVoice(v._id) }} title="Delete" style={{ color: '#ef4444' }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                            </button>
                                                        </div>
                                                    </button>
                                                ))}
                                                {clonedVoices.filter(v => v.status === 'cloning').map(v => (
                                                    <div key={v._id} className="ugc2-voice-row" style={{ opacity: .6, cursor: 'wait' }}>
                                                        <div className="ugc2-voice-info">
                                                            <span className="ugc2-voice-name"><span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 14 }}>progress_activity</span> {v.name}</span>
                                                            <span className="ugc2-voice-badge">Cloning...</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Standard Voice Lists (Global / Indian) ── */}
                                {voiceTab !== 'cloned' && (
                                <div className="ugc2-voice-list">
                                    {currentVoices.length === 0 && <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No voices found for this language. Try "All Languages".</p>}
                                    {currentVoices.map(v => (
                                        <button key={v.voice_id} className={`ugc2-voice-row ${selectedVoice?.voice_id === v.voice_id ? 'selected' : ''}`} onClick={() => setSelectedVoice(v)}>
                                            <div className="ugc2-voice-info">
                                                <span className="ugc2-voice-name">{v.name}</span>
                                                <span className="ugc2-voice-badge">{v.language || v.locale}</span>
                                                <span className="ugc2-voice-badge">{v.gender}</span>
                                            </div>
                                            <button className="ugc2-play-btn" onClick={e => { e.stopPropagation(); v.provider === 'sarvam' ? handleSarvamPreview(v) : v.preview_audio && playPreview(v.preview_audio) }} title="Preview voice">
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                                            </button>
                                        </button>
                                    ))}
                                </div>
                                )}

                                <div className="ugc2-nav">
                                    <button className="ugc2-btn-sec" onClick={() => setStep(2)}>← Back</button>
                                    <button className="ugc2-btn-pri" disabled={!selectedVoice} onClick={() => setStep(4)}>Next: Settings →</button>
                                </div>
                            </div>
                        )}

                        {/* ══ Step 4: Advanced Settings ══ */}
                        {step === 4 && (
                            <div className="ugc2-panel">
                                <div className="ugc2-panel-header"><h3>Advanced Settings</h3></div>
                                <div className="ugc2-settings-grid">
                                    <div className="ugc2-setting-card">
                                        <h4>🎬 Motion</h4>
                                        <input placeholder="E.g., Gesturing while explaining the product" value={motionPrompt} onChange={e => setMotionPrompt(e.target.value)} />
                                        <div className="ugc2-pill-group" style={{ marginTop: 10 }}><label>Expressiveness</label><div className="ugc2-pill-wrap">{EXPRESSIVENESS.map(e => <button key={e} className={`ugc2-pill ${expressiveness === e ? 'on' : ''}`} onClick={() => setExpressiveness(e)}>{e.charAt(0).toUpperCase() + e.slice(1)}</button>)}</div></div>
                                    </div>
                                    <div className="ugc2-setting-card">
                                        <h4>🎤 Voice Tuning</h4>
                                        <div className="ugc2-slider-row"><label>Speed: {voiceSpeed.toFixed(1)}x</label><input type="range" min="0.5" max="1.5" step="0.1" value={voiceSpeed} onChange={e => setVoiceSpeed(+e.target.value)} /></div>
                                        <div className="ugc2-slider-row"><label>Pitch: {voicePitch > 0 ? '+' : ''}{voicePitch}</label><input type="range" min="-20" max="20" step="1" value={voicePitch} onChange={e => setVoicePitch(+e.target.value)} /></div>
                                    </div>
                                    <div className="ugc2-setting-card">
                                        <h4>📐 Aspect Ratio</h4>
                                        <div className="ugc2-pill-wrap">
                                            {[{ id: '9:16', label: '9:16 Reels' }, { id: '16:9', label: '16:9 YouTube' }, { id: '1:1', label: '1:1 Feed' }].map(a => (
                                                <button key={a.id} className={`ugc2-pill ${aspectRatio === a.id ? 'on' : ''}`} onClick={() => setAspectRatio(a.id)}>{a.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="ugc2-setting-card">
                                        <h4>🖼️ Background / Product</h4>
                                        <div className="ugc2-pill-wrap" style={{ marginBottom: 10 }}>
                                            <button className={`ugc2-pill ${bgType === 'none' ? 'on' : ''}`} onClick={() => setBgType('none')}>Default</button>
                                            <button className={`ugc2-pill ${bgType === 'color' ? 'on' : ''}`} onClick={() => setBgType('color')}>Color</button>
                                            <button className={`ugc2-pill ${bgType === 'product' ? 'on' : ''}`} onClick={() => setBgType('product')}>Product Image</button>
                                        </div>
                                        {bgType === 'color' && <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 60, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }} />}
                                        {bgType === 'product' && (
                                            <div>
                                                {productImage ? (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                                            <img src={productImage.s3Url} alt="Product" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover' }} />
                                                            <div>
                                                                <button className="ugc2-btn-sec" onClick={() => productInputRef.current?.click()} style={{ marginBottom: 4 }}>Change</button>
                                                                {selectedAvatar?.avatar_id && (
                                                                    <button className="ugc2-btn-pri" onClick={handleGenPoses} disabled={loadingPoses} style={{ fontSize: 12, padding: '4px 10px' }}>
                                                                        {loadingPoses ? '⏳ Generating...' : '🛍️ Generate Poses'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Placement Pose Picker */}
                                                        {placementPoses.length > 0 && (
                                                            <div style={{ marginTop: 8 }}>
                                                                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, display: 'block' }}>Select a pose (how avatar holds the product):</label>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                                                                    {placementPoses.map((pose, idx) => (
                                                                        <div key={idx}
                                                                            onClick={() => setSelectedPose(pose)}
                                                                            style={{
                                                                                border: selectedPose === pose ? '2px solid #7c3aed' : '2px solid transparent',
                                                                                borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                                                                                boxShadow: selectedPose === pose ? '0 0 12px rgba(124,58,237,0.4)' : 'none',
                                                                                transition: 'all .2s',
                                                                            }}>
                                                                            <img src={typeof pose === 'string' ? pose : pose.url || pose.image_url} alt={`Pose ${idx + 1}`}
                                                                                style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                                                                            <div style={{ textAlign: 'center', fontSize: 11, padding: 4, color: selectedPose === pose ? '#a78bfa' : '#94a3b8' }}>Pose {idx + 1}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {loadingPoses && <p style={{ fontSize: 12, color: '#a78bfa', marginTop: 8 }}>🛍️ Generating 4 product placement poses... ~15s</p>}
                                                    </div>
                                                ) : (
                                                    <button className="ugc2-btn-sec" onClick={() => productInputRef.current?.click()} disabled={productUploading}>
                                                        {productUploading ? 'Uploading...' : '📤 Upload Product Image'}
                                                    </button>
                                                )}
                                                <input type="file" ref={productInputRef} accept="image/*" hidden onChange={onProductUpload} />
                                            </div>
                                        )}
                                    </div>
                                </div>


                                <div className="ugc2-nav">
                                    <button className="ugc2-btn-sec" onClick={() => setStep(3)}>← Back</button>
                                    <button className="ugc2-btn-pri" onClick={() => setStep(5)}>Next: Review →</button>
                                </div>
                            </div>
                        )}

                        {/* ══ Step 5: Review & Generate ══ */}
                        {step === 5 && (
                            <div className="ugc2-panel">
                                <div className="ugc2-panel-header"><h3>Review & Generate</h3></div>
                                <div className="ugc2-review-grid">
                                    <div className="ugc2-review-card">
                                        <h4>📝 Script</h4>
                                        <p className="ugc2-review-text">{script.substring(0, 200)}{script.length > 200 ? '...' : ''}</p>
                                        <span className="ugc2-review-meta">{STYLES.find(s => s.id === style)?.icon} {STYLES.find(s => s.id === style)?.label} · {platform} · {duration}</span>
                                    </div>
                                    <div className="ugc2-review-card">
                                        <h4>🧑 Avatar</h4>
                                        {selectedAvatar ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                {selectedAvatar.preview_image_url && <img src={selectedAvatar.preview_image_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />}
                                                <span>{selectedAvatar.avatar_name}</span>
                                            </div>
                                        ) : photoUrl ? <span>Custom Photo</span> : <span style={{ color: '#ef4444' }}>Not selected</span>}
                                    </div>
                                    <div className="ugc2-review-card">
                                        <h4>🎤 Voice</h4>
                                        {selectedVoice ? <span>{selectedVoice.name} · {selectedVoice.language} · {selectedVoice.gender}</span> : <span style={{ color: '#ef4444' }}>Not selected</span>}
                                    </div>
                                    <div className="ugc2-review-card">
                                        <h4>⚙️ Settings</h4>
                                        <span>Expressiveness: {expressiveness} · Speed: {voiceSpeed}x · {aspectRatio}</span>
                                        {motionPrompt && <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Motion: {motionPrompt}</p>}
                                        {bgType !== 'none' && <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Background: {bgType === 'color' ? bgColor : 'Product image'}</p>}
                                    </div>
                                </div>
                                <div className="ugc2-nav">
                                    <button className="ugc2-btn-sec" onClick={() => setStep(4)}>← Back</button>
                                    <button className="ugc2-btn-generate" onClick={handleGenerate} disabled={submitting}>
                                        {submitting ? <span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 18 }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>movie</span>}
                                        {submitting ? 'Generating...' : 'Generate UGC Video'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    )
}

/* ═══════════════════════════════════════════════
   CSS
   ═══════════════════════════════════════════════ */
const CSS = `
/* ═══════════════════════════════════════════════════════════ */
/*  UGC Creator — Premium Glassmorphism Design                */
/* ═══════════════════════════════════════════════════════════ */

.ugc2-root { max-width: 1200px; margin: 0 auto; padding: 0 24px 32px; }
.ugc2-root * { box-sizing: border-box; }

/* Toast */
.ugc2-toast { display:flex; align-items:center; justify-content:space-between; padding:12px 18px; border-radius:14px; background:rgba(239,68,68,.06); border:1px solid rgba(239,68,68,.12); color:#fca5a5; font-size:13px; margin-bottom:14px; backdrop-filter:blur(12px); }
.ugc2-toast button { background:none; border:none; color:#fca5a5; cursor:pointer; font-size:18px; }

/* ── Step Navigation ── */
.ugc2-steps { display:flex; align-items:center; gap:0; margin-bottom:28px; padding:6px; background:rgba(255,255,255,.02); border-radius:16px; border:1px solid rgba(255,255,255,.04); overflow-x: auto; scrollbar-width: none; }
.ugc2-steps::-webkit-scrollbar { display: none; }
.ugc2-step { display:flex; align-items:center; gap:8px; padding:10px 22px; border-radius:12px; border:none; background:transparent; color:#475569; font-size:13px; font-weight:600; cursor:pointer; transition:all .25s ease; position:relative; }
.ugc2-step:hover { color:#94a3b8; }
.ugc2-step.active { background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(6,182,212,.08)); color:#c4b5fd; box-shadow:0 2px 20px rgba(124,58,237,.15); }
.ugc2-step.done { color:#34d399; }
.ugc2-step-num { width:26px; height:26px; border-radius:50%; background:rgba(255,255,255,.04); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; transition:all .25s; }
.ugc2-step.active .ugc2-step-num { background:linear-gradient(135deg,#7c3aed,#06b6d4); color:#fff; box-shadow:0 0 14px rgba(124,58,237,.3); }
.ugc2-step.done .ugc2-step-num { background:rgba(52,211,153,.15); }
.ugc2-step-label { letter-spacing:.2px; }
@media (max-width:800px) { .ugc2-step-label { font-size: 11px; } .ugc2-step { padding: 8px 14px; flex-shrink: 0; } }

/* ── Glass Panel ── */
.ugc2-panel { background:rgba(255,255,255,.025); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,.06); border-radius:24px; padding:28px 32px; box-shadow:0 4px 40px rgba(0,0,0,.15); }
@media (max-width: 640px) { .ugc2-panel { padding: 20px 16px; border-radius: 16px; } }
.ugc2-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
.ugc2-panel-header h3 { margin:0; font-size:20px; font-weight:800; color:#f1f5f9; letter-spacing:-.3px; }

/* ── Tab Row ── */
.ugc2-tab-row { display:flex; gap:4px; background:rgba(255,255,255,.03); border-radius:12px; padding:4px; border:1px solid rgba(255,255,255,.04); }
.ugc2-tab { padding:8px 18px; border-radius:10px; border:none; background:none; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; }
.ugc2-tab:hover { color:#94a3b8; }
.ugc2-tab.on { background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(6,182,212,.1)); color:#c4b5fd; box-shadow:0 2px 12px rgba(124,58,237,.12); }

/* ── Textarea — immersive script editor ── */
.ugc2-textarea { width:100%; border:1px solid rgba(255,255,255,.06); background:rgba(0,0,0,.2); border-radius:18px; padding:20px 24px; color:#f1f5f9; font-size:15px; line-height:1.9; font-family:'Inter',system-ui,sans-serif; resize:vertical; outline:none; min-height:200px; transition:all .3s ease; }
.ugc2-textarea::placeholder { color:rgba(148,163,184,.25); font-style:italic; }
.ugc2-textarea:focus { border-color:rgba(124,58,237,.35); box-shadow:0 0 0 3px rgba(124,58,237,.08), 0 4px 30px rgba(124,58,237,.06); background:rgba(0,0,0,.25); }

/* ── Script Meta ── */
.ugc2-script-meta { margin-top:18px; }
.ugc2-word-count { font-size:12px; color:#475569; display:flex; align-items:center; gap:6px; margin-bottom:14px; font-weight:500; }
.ugc2-pills-row { display:flex; gap:20px; flex-wrap:wrap; }
.ugc2-pill-group { }
.ugc2-pill-group label { display:flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.8px; margin-bottom:8px; }
.ugc2-pill-wrap { display:flex; gap:6px; flex-wrap:wrap; }

/* ── Style Pills ── */
.ugc2-pill { padding:6px 14px; border-radius:10px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); color:#94a3b8; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s ease; white-space:nowrap; }
.ugc2-pill:hover:not(.on) { border-color:rgba(124,58,237,.2); background:rgba(124,58,237,.04); color:#c4b5fd; transform:translateY(-1px); }
.ugc2-pill.on { background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(6,182,212,.1)); border-color:rgba(124,58,237,.3); color:#e9d5ff; box-shadow:0 2px 16px rgba(124,58,237,.12); }

/* ── Language Pills — premium inline ── */
.ugc2-lang-pill { padding:6px 14px; border-radius:20px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.025); color:#94a3b8; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s ease; white-space:nowrap; display:inline-flex; align-items:center; gap:6px; }
.ugc2-lang-pill:hover { background:rgba(124,58,237,.06); border-color:rgba(124,58,237,.15); color:#c4b5fd; transform:translateY(-1px); }
.ugc2-lang-pill.active { background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(6,182,212,.12)); border-color:rgba(124,58,237,.35); color:#ede9fe; box-shadow:0 2px 16px rgba(124,58,237,.18); }
.ugc2-lang-count { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:18px; background:rgba(124,58,237,.15); border-radius:10px; font-size:10px; font-weight:700; color:#a78bfa; margin-left:4px; padding:0 5px; }

/* ── Product Selector ── */
.ugc2-product-selector { padding:12px 16px; margin:-4px 0 4px; background:rgba(255,255,255,.015); border-radius:12px; border:1px solid rgba(255,255,255,.04); }
.ugc2-product-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:12px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.025); color:#94a3b8; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s ease; white-space:nowrap; flex-shrink:0; }
.ugc2-product-chip:hover { background:rgba(124,58,237,.06); border-color:rgba(124,58,237,.15); color:#c4b5fd; transform:translateY(-1px); }
.ugc2-product-chip.active { background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(6,182,212,.1)); border-color:rgba(124,58,237,.3); color:#ede9fe; box-shadow:0 2px 12px rgba(124,58,237,.15); }

/* ── AI Write Button ── */
.ugc2-ai-btn { display:flex; align-items:center; gap:6px; padding:9px 18px; border-radius:12px; border:1px solid rgba(124,58,237,.2); background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(6,182,212,.04)); color:#c4b5fd; font-size:13px; font-weight:600; cursor:pointer; transition:all .2s; }
.ugc2-ai-btn:hover { background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(6,182,212,.08)); box-shadow:0 2px 16px rgba(124,58,237,.12); transform:translateY(-1px); }
.ugc2-ai-btn:disabled { opacity:.3; cursor:default; transform:none; box-shadow:none; }

/* ── Navigation ── */
.ugc2-nav { display:flex; justify-content:space-between; align-items:center; margin-top:24px; gap:12px; }
@media (max-width: 640px) { .ugc2-nav { flex-direction: column-reverse; align-items: stretch; } .ugc2-nav button { width: 100%; justify-content: center; } }

/* ── Buttons ── */
.ugc2-btn-sec { padding:10px 22px; border-radius:12px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); color:#cbd5e1; font-weight:600; font-size:13px; cursor:pointer; text-decoration:none; transition:all .15s; }
.ugc2-btn-sec:hover { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.12); }
.ugc2-btn-pri { padding:10px 22px; border-radius:12px; border:none; background:linear-gradient(135deg,#7c3aed,#06b6d4); color:#fff; font-weight:600; font-size:13px; cursor:pointer; text-decoration:none; transition:all .2s; box-shadow:0 2px 12px rgba(124,58,237,.15); }
.ugc2-btn-pri:hover { transform:translateY(-1px); box-shadow:0 4px 20px rgba(124,58,237,.25); }
.ugc2-btn-pri:disabled { opacity:.3; cursor:default; transform:none; box-shadow:none; }
.ugc2-btn-generate { display:flex; align-items:center; gap:10px; padding:14px 36px; border-radius:16px; border:none; background:linear-gradient(135deg,#7c3aed,#06b6d4); color:#fff; font-weight:700; font-size:16px; cursor:pointer; transition:all .25s; box-shadow:0 4px 24px rgba(124,58,237,.2); }
.ugc2-btn-generate:hover { transform:translateY(-2px) scale(1.01); box-shadow:0 8px 40px rgba(124,58,237,.35); }
.ugc2-btn-generate:disabled { opacity:.3; cursor:default; transform:none; box-shadow:none; }

/* ── Search ── */
.ugc2-search { display:flex; align-items:center; gap:10px; padding:12px 18px; border-radius:14px; border:1px solid rgba(255,255,255,.06); background:rgba(0,0,0,.12); margin-bottom:16px; transition:border-color .2s; }
.ugc2-search:focus-within { border-color:rgba(124,58,237,.25); }
.ugc2-search input { flex:1; border:none; background:none; outline:none; color:#f1f5f9; font-size:14px; font-family:inherit; }
.ugc2-search input::placeholder { color:#475569; }

/* ── Avatar Grid — larger, immersive ── */
.ugc2-av-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:14px; max-height:520px; overflow-y:auto; padding-right:6px; scrollbar-width:thin; scrollbar-color:rgba(124,58,237,.15) transparent; }
@media (max-width: 640px) { .ugc2-av-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } }
.ugc2-av { display:flex; flex-direction:column; background:rgba(255,255,255,.02); border:2px solid transparent; border-radius:16px; overflow:hidden; cursor:pointer; padding:0; transition:all .25s ease; }
.ugc2-av:hover { border-color:rgba(124,58,237,.2); transform:translateY(-3px); box-shadow:0 8px 30px rgba(0,0,0,.2); }
.ugc2-av.selected { border-color:#7c3aed; box-shadow:0 0 24px rgba(124,58,237,.25), inset 0 0 0 1px rgba(124,58,237,.1); }
.ugc2-av-img { width:100%; aspect-ratio:3/4; overflow:hidden; background:rgba(255,255,255,.02); }
.ugc2-av-img img { display:block; width:100%; height:100%; object-fit:cover; object-position:top center; transition:transform .3s ease; }
.ugc2-av:hover .ugc2-av-img img { transform:scale(1.05); }
.ugc2-av-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:32px; background:linear-gradient(135deg,rgba(124,58,237,.05),rgba(6,182,212,.03)); }
.ugc2-av-label { padding:8px 10px; font-size:12px; font-weight:600; color:#cbd5e1; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; background:rgba(0,0,0,.15); backdrop-filter:blur(8px); }
.ugc2-av-skel { border-radius:16px; aspect-ratio:3/4; background:linear-gradient(110deg,rgba(255,255,255,.02) 30%,rgba(255,255,255,.06) 50%,rgba(255,255,255,.02) 70%); background-size:200% 100%; animation:ugc2shim 1.5s infinite; }
@keyframes ugc2shim { 0%{background-position:200% 0}100%{background-position:-200% 0} }

/* ── Photo Section ── */
.ugc2-photo-section { display:flex; flex-direction:column; align-items:center; padding:24px; }
.ugc2-photo-preview { text-align:center; }
.ugc2-photo-preview img { max-width:340px; max-height:340px; border-radius:20px; margin-bottom:14px; box-shadow:0 8px 40px rgba(0,0,0,.25); border:2px solid rgba(255,255,255,.06); }
.ugc2-photo-drop { display:flex; flex-direction:column; align-items:center; gap:12px; padding:48px 80px; border-radius:24px; border:2px dashed rgba(124,58,237,.2); background:linear-gradient(135deg,rgba(124,58,237,.02),rgba(6,182,212,.01)); cursor:pointer; transition:all .25s; text-align:center; }
.ugc2-photo-drop:hover { border-color:rgba(124,58,237,.4); background:linear-gradient(135deg,rgba(124,58,237,.06),rgba(6,182,212,.03)); box-shadow:0 4px 30px rgba(124,58,237,.08); }
.ugc2-photo-drop p { color:#94a3b8; font-size:14px; margin:0; }

/* ── AI Avatar Creator ── */
.ugc2-create-section { }
.ugc2-create-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px; }
@media (max-width:800px) { .ugc2-create-grid { grid-template-columns:1fr 1fr; } }
.ugc2-field { display:flex; flex-direction:column; gap:6px; }
.ugc2-field.full { grid-column:1/-1; }
.ugc2-field label { font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.5px; }
.ugc2-field input, .ugc2-field select, .ugc2-field textarea { padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,.07); background:rgba(0,0,0,.18); color:#f1f5f9; font-size:13px; font-family:inherit; outline:none; transition:all .2s; }
.ugc2-field input:focus, .ugc2-field select:focus, .ugc2-field textarea:focus { border-color:rgba(124,58,237,.3); box-shadow:0 0 0 2px rgba(124,58,237,.06); }
.ugc2-field select { appearance:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' fill='none' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:30px; }
.ugc2-sample-prompts { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0 16px; }
.ugc2-sample { padding:6px 14px; border-radius:10px; border:1px solid rgba(124,58,237,.1); background:rgba(124,58,237,.04); color:#c4b5fd; font-size:11px; cursor:pointer; transition:all .15s; }
.ugc2-sample:hover { background:rgba(124,58,237,.1); transform:translateY(-1px); }
.ugc2-create-opts { display:flex; gap:16px; flex-wrap:wrap; }
.ugc2-creating-state { text-align:center; padding:48px; }
.ugc2-creating-state h4 { color:#f1f5f9; margin:14px 0 6px; font-size:16px; }
.ugc2-creating-state p { color:#64748b; font-size:13px; }

/* ── Voice List ── */
.ugc2-voice-list { display:flex; flex-direction:column; gap:6px; max-height:520px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(124,58,237,.12) transparent; }
.ugc2-voice-row { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-radius:14px; border:1px solid rgba(255,255,255,.04); background:rgba(255,255,255,.015); cursor:pointer; transition:all .2s; }
.ugc2-voice-row:hover { background:rgba(255,255,255,.04); border-color:rgba(255,255,255,.08); transform:translateX(2px); }
.ugc2-voice-row.selected { background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(6,182,212,.04)); border-color:rgba(124,58,237,.25); box-shadow:0 2px 16px rgba(124,58,237,.08); }
.ugc2-voice-info { display:flex; align-items:center; gap:10px; }
.ugc2-voice-name { font-size:14px; font-weight:600; color:#f1f5f9; }
.ugc2-voice-badge { font-size:10px; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,.04); color:#64748b; }
.ugc2-play-btn { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); color:#94a3b8; cursor:pointer; padding:6px; border-radius:8px; display:flex; transition:all .15s; }
.ugc2-play-btn:hover { color:#c4b5fd; background:rgba(124,58,237,.1); border-color:rgba(124,58,237,.2); }

/* ── Settings Grid ── */
.ugc2-settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:800px) { .ugc2-settings-grid { grid-template-columns:1fr; } }
.ugc2-setting-card { padding:20px; border-radius:18px; border:1px solid rgba(255,255,255,.05); background:rgba(255,255,255,.02); backdrop-filter:blur(8px); transition:all .2s; }
.ugc2-setting-card:hover { border-color:rgba(255,255,255,.08); }
.ugc2-setting-card h4 { margin:0 0 12px; font-size:14px; color:#f1f5f9; font-weight:700; display:flex; align-items:center; gap:8px; }
.ugc2-setting-card input[type="text"], .ugc2-setting-card input:not([type]) { width:100%; padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,.07); background:rgba(0,0,0,.15); color:#f1f5f9; font-size:13px; font-family:inherit; outline:none; transition:all .2s; }
.ugc2-setting-card input:focus { border-color:rgba(124,58,237,.3); box-shadow:0 0 0 2px rgba(124,58,237,.06); }
.ugc2-slider-row { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.ugc2-slider-row label { font-size:12px; color:#94a3b8; min-width:90px; }
.ugc2-slider-row input[type="range"] { flex:1; accent-color:#7c3aed; height:4px; }

/* ── Review Grid ── */
.ugc2-review-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width:800px) { .ugc2-review-grid { grid-template-columns:1fr; } }
.ugc2-review-card { padding:18px; border-radius:18px; border:1px solid rgba(255,255,255,.05); background:rgba(255,255,255,.02); backdrop-filter:blur(8px); }
.ugc2-review-card h4 { margin:0 0 8px; font-size:13px; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
.ugc2-review-card span, .ugc2-review-card p { color:#f1f5f9; font-size:13px; margin:0; }
.ugc2-review-text { color:#cbd5e1!important; font-size:13px!important; line-height:1.7; }
.ugc2-review-meta { color:#64748b!important; font-size:11px!important; display:block; margin-top:8px; }

/* ── Progress View ── */
.ugc2-progress-view { display:flex; justify-content:center; padding:60px 0; }
.ugc2-gen-card, .ugc2-done-card { text-align:center; padding:48px; background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.06); border-radius:28px; max-width:480px; backdrop-filter:blur(16px); box-shadow:0 8px 50px rgba(0,0,0,.2); }
.ugc2-gen-card h3 { color:#f1f5f9; margin:18px 0 6px; font-size:20px; font-weight:800; }
.ugc2-gen-card p { color:#64748b; font-size:13px; margin:0; }
.ugc2-ring { width:110px; height:110px; position:relative; margin:0 auto 20px; }
.ugc2-ring svg { width:100%; height:100%; transform:rotate(-90deg); }
.ugc2-ring circle { fill:none; stroke-width:4; stroke-linecap:round; }
.ugc2-ring .bg { stroke:rgba(255,255,255,.04); }
.ugc2-ring .fg { stroke:url(#ugc2grad); transition:stroke-dashoffset 1s ease; }
.ugc2-ring .pct { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:22px; font-weight:800; background:linear-gradient(135deg,#c4b5fd,#67e8f9); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }

/* ── Enhance Section ── */
.ugc2-enhance-box { margin-top:18px; padding:18px; border-radius:18px; border:1px solid rgba(124,58,237,.15); background:linear-gradient(135deg,rgba(124,58,237,.03),rgba(6,182,212,.02)); backdrop-filter:blur(8px); }
.ugc2-enhance-box h4 { margin:0 0 6px; font-size:15px; color:#f1f5f9; font-weight:700; }
.ugc2-enhance-desc { color:#64748b; font-size:12px; margin:0 0 12px; }
.ugc2-enhance-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
.ugc2-enhance-chip { padding:6px 14px; border-radius:20px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); color:#94a3b8; font-size:11px; cursor:pointer; transition:all .15s; white-space:nowrap; }
.ugc2-enhance-chip:hover { background:rgba(124,58,237,.08); border-color:rgba(124,58,237,.2); color:#c4b5fd; transform:translateY(-1px); }
.ugc2-enhance-input-row { display:flex; gap:10px; align-items:center; }
.ugc2-enhance-input-row input { flex:1; padding:11px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.07); background:rgba(0,0,0,.18); color:#f1f5f9; font-size:13px; font-family:inherit; outline:none; transition:all .2s; }
.ugc2-enhance-input-row input:focus { border-color:rgba(124,58,237,.3); box-shadow:0 0 0 2px rgba(124,58,237,.06); }
.ugc2-enhance-input-row .ugc2-btn-pri { display:flex; align-items:center; gap:6px; padding:11px 18px; white-space:nowrap; font-size:13px; }
.ugc2-enhance-status { color:#c4b5fd; font-size:12px; margin:10px 0 0; animation:ugc2pulse 2s infinite; }
@keyframes ugc2pulse { 0%,100%{opacity:1}50%{opacity:.35} }

@keyframes ugc2spin { from{transform:rotate(0)}to{transform:rotate(360deg)} }
.ugc2-spin { animation:ugc2spin 1s linear infinite; }

/* ── Emotion Tags Bar ── */
.ugc2-emotion-bar { padding:10px 0; display:flex; flex-direction:column; gap:8px; border-top:1px solid rgba(255,255,255,.04); margin-top:2px; }
.ugc2-emotion-tags { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.ugc2-emotion-chip { padding:4px 10px; border-radius:16px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); color:#94a3b8; font-size:11px; cursor:pointer; transition:all .18s; font-family:monospace; white-space:nowrap; }
.ugc2-emotion-chip:hover { background:rgba(124,58,237,.1); border-color:rgba(124,58,237,.25); color:#c4b5fd; transform:translateY(-1px); box-shadow:0 2px 8px rgba(124,58,237,.1); }
.ugc2-humanize-row { display:flex; align-items:center; gap:8px; flex-wrap: wrap; }
@media (max-width: 640px) { .ugc2-humanize-row { flex-direction: column; align-items: stretch; } .ugc2-emotion-select, .ugc2-humanize-btn { width: 100%; } }
.ugc2-emotion-select { padding:7px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.2); color:#e2e8f0; font-size:12px; outline:none; cursor:pointer; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' fill='none' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; padding-right:28px; }
.ugc2-emotion-select:focus { border-color:rgba(124,58,237,.3); }
.ugc2-humanize-btn { display:flex; align-items:center; gap:6px; padding:7px 16px; border-radius:10px; border:1px solid rgba(124,58,237,.25); background:linear-gradient(135deg,rgba(124,58,237,.1),rgba(6,182,212,.05)); color:#c4b5fd; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; white-space:nowrap; }
.ugc2-humanize-btn:hover:not(:disabled) { background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(6,182,212,.1)); transform:translateY(-1px); box-shadow:0 3px 12px rgba(124,58,237,.15); border-color:rgba(124,58,237,.35); }
.ugc2-humanize-btn:disabled { opacity:.4; cursor:not-allowed; }

/* ── Clone Voice Panel ── */
.ugc2-clone-trigger { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px; border-radius:16px; border:2px dashed rgba(124,58,237,.2); background:rgba(124,58,237,.03); color:#c4b5fd; font-size:14px; font-weight:600; cursor:pointer; transition:all .25s; }
.ugc2-clone-trigger:hover { background:rgba(124,58,237,.08); border-color:rgba(124,58,237,.35); transform:translateY(-2px); box-shadow:0 4px 20px rgba(124,58,237,.1); }
.ugc2-clone-panel { background:rgba(0,0,0,.15); border:1px solid rgba(255,255,255,.06); border-radius:18px; padding:18px; margin-top:12px; backdrop-filter:blur(8px); }
.ugc2-clone-upload-area { padding:4px 0; }
.ugc2-clone-record-area { padding:4px 0; }
.ugc2-record-btn { display:flex; flex-direction:column; align-items:center; gap:6px; padding:16px 32px; border-radius:16px; border:2px solid rgba(239,68,68,.15); background:rgba(239,68,68,.04); color:#f1f5f9; cursor:pointer; transition:all .2s; font-size:13px; }
.ugc2-record-btn:hover { background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.3); }
.ugc2-record-btn.recording { border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.1); }
@keyframes ugc2pulse-anim { 0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.7} }
.ugc2-pulse { animation:ugc2pulse-anim 1.2s ease-in-out infinite; }

`
