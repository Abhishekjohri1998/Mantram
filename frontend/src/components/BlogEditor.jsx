import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { apiFetch } from '../services/api'

// ── Toolbar Button ──
function TBtn({ icon, label, active, onClick, disabled }) {
    return (
        <button onClick={onClick} disabled={disabled} title={label}
            className={`p-1.5 rounded-lg transition-all cursor-pointer text-sm ${active
                ? 'bg-primary/20 text-primary'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </button>
    )
}

function Divider() {
    return <div className="w-px h-5 bg-white/[0.08] mx-0.5" />
}

// ── Image Style Options ──
const IMAGE_STYLES = [
    { id: 'editorial', icon: 'photo_camera', label: 'Editorial Photo', desc: 'Magazine-quality photograph' },
    { id: 'infographic', icon: 'bar_chart', label: 'Infographic', desc: 'Data visualization & diagram' },
    { id: 'quote', icon: 'format_quote', label: 'Quote Card', desc: 'Styled quote graphic' },
    { id: 'illustration', icon: 'brush', label: 'Illustration', desc: 'Artistic illustration' },
    { id: 'flat', icon: 'category', label: 'Flat Design', desc: 'Clean, minimal flat art' },
    { id: '3d', icon: 'view_in_ar', label: '3D Render', desc: 'Photorealistic 3D scene' },
]

// ── Medium-style Floating Plus Button with Image Panel ──
function FloatingPlusButton({ editor, brandId, activeBrand, generatingImage, setGeneratingImage }) {
    const [visible, setVisible] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const [showImagePanel, setShowImagePanel] = useState(false)
    const [imgPrompt, setImgPrompt] = useState('')
    const [imgStyle, setImgStyle] = useState('editorial')
    const [prevPara, setPrevPara] = useState('')
    const [nextPara, setNextPara] = useState('')
    const [usePrev, setUsePrev] = useState(true)
    const [useNext, setUseNext] = useState(true)
    const [pos, setPos] = useState({ top: 0 })
    const panelRef = useRef(null)

    // Extract previous and next paragraph text properly
    const extractParas = useCallback(() => {
        if (!editor) return { prev: '', next: '' }
        const { from } = editor.state.selection
        const $pos = editor.state.doc.resolve(from)

        // Find the current block node's index among its parent's children
        const parentNode = $pos.node($pos.depth - 1) || editor.state.doc
        const currentIndex = $pos.index($pos.depth - 1)

        let prev = '', next = ''

        // Walk backwards to find previous text block
        for (let i = currentIndex - 1; i >= 0; i--) {
            const child = parentNode.child(i)
            const text = child.textContent?.trim()
            if (text) { prev = text; break }
        }

        // Walk forwards to find next text block
        for (let i = currentIndex + 1; i < parentNode.childCount; i++) {
            const child = parentNode.child(i)
            const text = child.textContent?.trim()
            if (text) { next = text; break }
        }

        return { prev, next }
    }, [editor])

    useEffect(() => {
        if (!editor) return
        const update = () => {
            if (generatingImage) return
            const { from, empty } = editor.state.selection
            if (!empty) { setVisible(false); return }
            const $pos = editor.state.doc.resolve(from)
            const node = $pos.parent
            const isEmptyBlock = (node.type.name === 'paragraph' && node.content.size === 0)
            if (isEmptyBlock) {
                const coords = editor.view.coordsAtPos(from)
                const editorEl = editor.view.dom.closest('.blog-editor-wrapper')
                if (editorEl) {
                    const editorRect = editorEl.getBoundingClientRect()
                    setPos({ top: coords.top - editorRect.top })
                }
                setVisible(true)
            } else {
                setVisible(false)
                setMenuOpen(false)
                setShowImagePanel(false)
            }
        }
        editor.on('selectionUpdate', update)
        editor.on('focus', update)
        return () => { editor.off('selectionUpdate', update); editor.off('focus', update) }
    }, [editor, generatingImage])

    // Open image panel — extract paragraphs
    const openImagePanel = useCallback(() => {
        const { prev, next } = extractParas()
        setPrevPara(prev)
        setNextPara(next)
        setUsePrev(!!prev)
        setUseNext(!!next)
        setImgPrompt('')
        setShowImagePanel(true)
        setMenuOpen(false)
    }, [extractParas])

    // Generate AI image
    const handleGenerate = useCallback(async () => {
        if (!editor || generatingImage) return
        setGeneratingImage(true)
        try {
            const styleObj = IMAGE_STYLES.find(s => s.id === imgStyle)
            const styleLabel = styleObj?.label || 'Editorial Photo'
            const styleDesc = styleObj?.desc || ''

            // Build context from selected paragraphs
            let contextParts = []
            if (usePrev && prevPara) contextParts.push(prevPara.slice(0, 200))
            if (useNext && nextPara) contextParts.push(nextPara.slice(0, 200))
            const contextText = contextParts.join(' ')

            // Build the prompt
            let promptParts = []
            if (imgPrompt.trim()) {
                promptParts.push(`Subject: ${imgPrompt.trim()}`)
                if (contextText) promptParts.push(`Context from the blog article: "${contextText}"`)
            } else if (contextText) {
                promptParts.push(`Create an image that illustrates this blog section: "${contextText}"`)
            } else {
                promptParts.push(`Create a professional blog illustration for a ${activeBrand?.dna?.industry || 'business'} article.`)
            }

            promptParts.push(`Style: ${styleLabel} — ${styleDesc}`)
            if (imgStyle === 'infographic') {
                promptParts.push('Design as a clean, professional infographic with data visualization, charts, icons and structured layout.')
            } else if (imgStyle === 'quote') {
                promptParts.push('Design as a stylish quote card with elegant typography on a beautiful background.')
            } else if (imgStyle === 'illustration') {
                promptParts.push('Create a beautiful, artistic illustration. Visually engaging and editorial.')
            } else if (imgStyle === 'flat') {
                promptParts.push('Clean flat design with bold colors, simple shapes, and minimal details.')
            } else if (imgStyle === '3d') {
                promptParts.push('Photorealistic 3D render with studio lighting, smooth surfaces, and depth.')
            } else {
                promptParts.push('Professional editorial photography, magazine quality, natural lighting.')
            }

            const data = await apiFetch('/content/blog-image', {
                method: 'POST',
                body: JSON.stringify({
                    brandId,
                    prompt: promptParts.join('\n'),
                    context: contextText,
                }),
            })

            if (data.success && data.imageUrl) {
                editor.chain().focus().setImage({
                    src: data.imageUrl,
                    alt: imgPrompt || contextText?.slice(0, 80) || 'Blog illustration'
                }).run()
                setShowImagePanel(false)
                setImgPrompt('')
            } else {
                alert(data.error || 'Image generation failed. Please try again.')
            }
        } catch (err) {
            console.error('AI image generation failed:', err)
            alert('Image generation failed. Please try again.')
        } finally {
            setGeneratingImage(false)
        }
    }, [editor, imgPrompt, imgStyle, prevPara, nextPara, usePrev, useNext, brandId, activeBrand, generatingImage, setGeneratingImage])

    if (!visible) return null

    return (
        <div className="absolute -left-2 z-50 transition-all" style={{ top: `${pos.top - 4}px` }}>
            {/* Plus button */}
            <button onClick={() => { setMenuOpen(!menuOpen); setShowImagePanel(false) }}
                className={`w-7 h-7 rounded-full border flex items-center justify-center cursor-pointer transition-all ${menuOpen || showImagePanel
                    ? 'bg-primary/20 border-primary/40 text-primary rotate-45'
                    : 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300'
                }`}>
                <span className="material-symbols-outlined text-[18px]">add</span>
            </button>

            {/* Quick menu */}
            {menuOpen && !showImagePanel && (
                <div className="absolute left-9 top-0 flex items-center gap-1 animate-fade-in rounded-xl px-2 py-1.5 border border-white/[0.12] shadow-2xl whitespace-nowrap" style={{ background: '#111827' }}>
                    <button onClick={openImagePanel}
                        title="Generate AI illustration"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-400/10 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                        AI Image
                    </button>
                    <div className="w-px h-4 bg-white/[0.08]" />
                    <button onClick={() => {
                        const url = prompt('Enter image URL:')
                        if (url) editor.chain().focus().setImage({ src: url, alt: 'Blog image' }).run()
                        setMenuOpen(false)
                    }}
                        title="Insert image from URL"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[16px]">image</span>
                        Image URL
                    </button>
                    <div className="w-px h-4 bg-white/[0.08]" />
                    <button onClick={() => {
                        editor.chain().focus().setHorizontalRule().run()
                        setMenuOpen(false)
                    }}
                        title="Insert divider"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[16px]">horizontal_rule</span>
                        Divider
                    </button>
                </div>
            )}

            {/* ── AI Image Generation Panel ── */}
            {showImagePanel && (
                <div ref={panelRef}
                    className="absolute left-9 top-0 w-[380px] animate-fade-in rounded-2xl border border-white/[0.12] p-4"
                    style={{ background: '#111827', boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)' }}
                    onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-amber-400">auto_awesome</span>
                            <span className="text-sm font-bold text-white">Generate Image</span>
                        </div>
                        <button onClick={() => setShowImagePanel(false)}
                            className="text-slate-500 hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>

                    {/* Context — Previous Paragraph */}
                    {prevPara && (
                        <div className={`mb-2 p-2.5 rounded-xl border cursor-pointer transition-all ${usePrev ? 'border-amber-400/30' : 'border-white/[0.06] opacity-50'}`}
                            style={{ background: '#0d1420' }}
                            onClick={() => setUsePrev(!usePrev)}>
                            <div className="flex items-center gap-2 mb-1">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-all ${usePrev ? 'bg-amber-400 border-amber-400 text-black' : 'border-slate-600'}`}>
                                    {usePrev && <span className="material-symbols-outlined text-[12px]">check</span>}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[10px]">arrow_upward</span>
                                    Previous Paragraph
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pl-6">{prevPara.slice(0, 150)}{prevPara.length > 150 ? '...' : ''}</p>
                        </div>
                    )}

                    {/* Context — Next Paragraph */}
                    {nextPara && (
                        <div className={`mb-3 p-2.5 rounded-xl border cursor-pointer transition-all ${useNext ? 'border-amber-400/30' : 'border-white/[0.06] opacity-50'}`}
                            style={{ background: '#0d1420' }}
                            onClick={() => setUseNext(!useNext)}>
                            <div className="flex items-center gap-2 mb-1">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-all ${useNext ? 'bg-amber-400 border-amber-400 text-black' : 'border-slate-600'}`}>
                                    {useNext && <span className="material-symbols-outlined text-[12px]">check</span>}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[10px]">arrow_downward</span>
                                    Next Paragraph
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pl-6">{nextPara.slice(0, 150)}{nextPara.length > 150 ? '...' : ''}</p>
                        </div>
                    )}

                    {!prevPara && !nextPara && (
                        <div className="mb-3 p-2.5 rounded-xl border border-white/[0.06] text-center" style={{ background: '#0d1420' }}>
                            <p className="text-[11px] text-slate-600">No surrounding paragraphs found. Enter a prompt below.</p>
                        </div>
                    )}

                    {/* User Input */}
                    <div className="mb-3">
                        <textarea value={imgPrompt} onChange={e => setImgPrompt(e.target.value)}
                            placeholder="Describe the image you want, or leave empty to use context above..."
                            rows={2}
                            className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none resize-none placeholder-slate-600 border border-white/[0.08] focus:border-amber-400/30 transition-all" style={{ background: '#0d1420' }} />
                    </div>

                    {/* Style Selection */}
                    <p className="text-[10px] font-bold text-slate-500 mb-2">IMAGE STYLE</p>
                    <div className="grid grid-cols-3 gap-1.5 mb-4">
                        {IMAGE_STYLES.map(style => (
                            <button key={style.id} onClick={() => setImgStyle(style.id)}
                                className={`px-2 py-2 rounded-xl text-center transition-all cursor-pointer border ${imgStyle === style.id
                                    ? 'border-amber-400/30 text-amber-400'
                                    : 'border-white/[0.08] text-slate-500 hover:text-white hover:border-white/[0.15]'
                                }`}
                                style={{ background: imgStyle === style.id ? 'rgba(251,191,36,0.12)' : '#0d1420' }}>
                                <span className="material-symbols-outlined text-[16px] block mb-0.5">{style.icon}</span>
                                <span className="text-[10px] font-medium">{style.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Generate Button */}
                    <button onClick={handleGenerate} disabled={generatingImage}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${generatingImage
                            ? 'bg-amber-400/20 text-amber-400 animate-pulse'
                            : 'bg-amber-400 text-black hover:bg-amber-300'
                        }`}>
                        {generatingImage ? (
                            <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Generating...</>
                        ) : (
                            <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate Image</>
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}


// ── Blog Editor Component ──
export default function BlogEditor({ initialContent = '', title: initTitle = '', onBack, onSave, brandId, activeBrand }) {
    const [blogTitle, setBlogTitle] = useState(initTitle)
    const [linkUrl, setLinkUrl] = useState('')
    const [showLinkInput, setShowLinkInput] = useState(false)
    const [generatingImage, setGeneratingImage] = useState(false)
    const [copied, setCopied] = useState('')
    const [metaDesc, setMetaDesc] = useState('')
    const [showMeta, setShowMeta] = useState(false)

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                bulletList: { keepMarks: true },
                orderedList: { keepMarks: true },
            }),
            Image.configure({ inline: false, allowBase64: true }),
            Link.configure({ openOnClick: false, HTMLAttributes: { class: 'blog-link' } }),
            Underline,
            Placeholder.configure({ placeholder: 'Start writing your blog...' }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight.configure({ multicolor: true }),
        ],
        content: initialContent,
        editorProps: {
            attributes: { class: 'blog-editor-content' },
        },
    })

    const wordCount = editor?.getText()?.split(/\s+/).filter(Boolean).length || 0
    const readTime = Math.max(1, Math.ceil(wordCount / 200))

    const setLink = useCallback(() => {
        if (!linkUrl) { editor?.chain().focus().unsetLink().run(); setShowLinkInput(false); return }
        editor?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
        setLinkUrl('')
        setShowLinkInput(false)
    }, [editor, linkUrl])

    // ── Export functions ──
    const copyHTML = useCallback(() => {
        if (!editor) return
        const titleHtml = blogTitle ? `<h1>${blogTitle}</h1>\n` : ''
        navigator.clipboard.writeText(titleHtml + editor.getHTML())
        setCopied('html'); setTimeout(() => setCopied(''), 2000)
    }, [editor, blogTitle])

    const copyText = useCallback(() => {
        if (!editor) return
        navigator.clipboard.writeText((blogTitle ? blogTitle + '\n\n' : '') + editor.getText())
        setCopied('text'); setTimeout(() => setCopied(''), 2000)
    }, [editor, blogTitle])

    const downloadHTML = useCallback(() => {
        if (!editor) return
        const css = `<style>
body{font-family:'Inter',-apple-system,sans-serif;max-width:720px;margin:2rem auto;padding:0 1.5rem;color:#1a1a1a;line-height:1.8}
h1{font-size:2.2rem;font-weight:800;margin-bottom:.5rem}h2{font-size:1.5rem;font-weight:700;margin-top:2rem}
h3{font-size:1.2rem;font-weight:600;margin-top:1.5rem}p{margin:1rem 0}img{max-width:100%;border-radius:8px;margin:1.5rem 0}
blockquote{border-left:3px solid #6366f1;padding-left:1rem;color:#555;font-style:italic;margin:1.5rem 0}
ul,ol{padding-left:1.5rem}a{color:#6366f1;text-decoration:underline}code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:.9em}
hr{border:none;border-top:1px solid #e5e7eb;margin:2rem 0}.meta{color:#888;font-size:.9rem;margin-bottom:2rem}</style>`
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${blogTitle || 'Blog Post'}</title>${metaDesc ? `<meta name="description" content="${metaDesc}">` : ''}${css}</head><body>${blogTitle ? `<h1>${blogTitle}</h1>` : ''}<p class="meta">${wordCount} words · ${readTime} min read${activeBrand?.name ? ` · ${activeBrand.name}` : ''}</p>${editor.getHTML()}</body></html>`
        const blob = new Blob([html], { type: 'text/html' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `${(blogTitle || 'blog-post').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`; a.click()
    }, [editor, blogTitle, wordCount, readTime, metaDesc, activeBrand])

    if (!editor) return null

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                </button>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{wordCount} words</span>
                    <span>·</span>
                    <span>{readTime} min read</span>
                </div>
            </div>

            {/* Title */}
            <input type="text" value={blogTitle} onChange={e => setBlogTitle(e.target.value)}
                placeholder="Blog Title..."
                className="w-full bg-transparent text-3xl font-black text-white placeholder-slate-600 border-none outline-none mb-6 leading-tight" />

            {/* Toolbar */}
            <div className="glass-panel rounded-xl px-3 py-2 mb-4 flex flex-wrap items-center gap-0.5 border border-white/[0.06] sticky top-0 z-20 backdrop-blur-xl">
                <TBtn icon="format_h1" label="Heading 1" active={editor.isActive('heading', { level: 1 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
                <TBtn icon="format_h2" label="Heading 2" active={editor.isActive('heading', { level: 2 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
                <TBtn icon="format_h3" label="Heading 3" active={editor.isActive('heading', { level: 3 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
                <Divider />
                <TBtn icon="format_bold" label="Bold" active={editor.isActive('bold')}
                    onClick={() => editor.chain().focus().toggleBold().run()} />
                <TBtn icon="format_italic" label="Italic" active={editor.isActive('italic')}
                    onClick={() => editor.chain().focus().toggleItalic().run()} />
                <TBtn icon="format_underlined" label="Underline" active={editor.isActive('underline')}
                    onClick={() => editor.chain().focus().toggleUnderline().run()} />
                <TBtn icon="format_strikethrough" label="Strikethrough" active={editor.isActive('strike')}
                    onClick={() => editor.chain().focus().toggleStrike().run()} />
                <TBtn icon="ink_highlighter" label="Highlight" active={editor.isActive('highlight')}
                    onClick={() => editor.chain().focus().toggleHighlight().run()} />
                <Divider />
                <TBtn icon="format_list_bulleted" label="Bullet List" active={editor.isActive('bulletList')}
                    onClick={() => editor.chain().focus().toggleBulletList().run()} />
                <TBtn icon="format_list_numbered" label="Numbered List" active={editor.isActive('orderedList')}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()} />
                <TBtn icon="format_quote" label="Blockquote" active={editor.isActive('blockquote')}
                    onClick={() => editor.chain().focus().toggleBlockquote().run()} />
                <TBtn icon="code" label="Code Block" active={editor.isActive('codeBlock')}
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
                <Divider />
                <TBtn icon="format_align_left" label="Align Left" active={editor.isActive({ textAlign: 'left' })}
                    onClick={() => editor.chain().focus().setTextAlign('left').run()} />
                <TBtn icon="format_align_center" label="Align Center" active={editor.isActive({ textAlign: 'center' })}
                    onClick={() => editor.chain().focus().setTextAlign('center').run()} />
                <Divider />
                <TBtn icon="link" label="Insert Link" active={editor.isActive('link')}
                    onClick={() => {
                        if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return }
                        setShowLinkInput(!showLinkInput)
                    }} />
                <Divider />
                <TBtn icon="undo" label="Undo" onClick={() => editor.chain().focus().undo().run()} />
                <TBtn icon="redo" label="Redo" onClick={() => editor.chain().focus().redo().run()} />
            </div>

            {/* Link input */}
            {showLinkInput && (
                <div className="glass-panel rounded-xl p-3 mb-4 flex items-center gap-2 border border-primary/20 animate-fade-in">
                    <span className="material-symbols-outlined text-sm text-primary">link</span>
                    <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="flex-1 bg-transparent text-sm text-white outline-none placeholder-slate-500"
                        onKeyDown={e => e.key === 'Enter' && setLink()} autoFocus />
                    <button onClick={setLink} className="text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg cursor-pointer">
                        {linkUrl ? 'Add' : 'Remove'}
                    </button>
                    <button onClick={() => setShowLinkInput(false)} className="text-slate-500 hover:text-white cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* Editor Area with Floating Plus */}
            <div className="blog-editor-wrapper glass-panel rounded-2xl border border-white/[0.06] min-h-[500px] p-8 pl-12 mb-4 relative">
                <FloatingPlusButton
                    editor={editor}
                    brandId={brandId}
                    activeBrand={activeBrand}
                    generatingImage={generatingImage}
                    setGeneratingImage={setGeneratingImage}
                />
                <EditorContent editor={editor} />

                {/* Full overlay loader during image generation */}
                {generatingImage && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl" style={{ background: 'rgba(17,24,39,0.85)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
                            <p className="text-sm font-bold text-amber-400">Generating image...</p>
                            <p className="text-[11px] text-slate-500">This may take 10-20 seconds</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Meta Description */}
            <button onClick={() => setShowMeta(!showMeta)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-white mb-3 cursor-pointer transition-all">
                <span className="material-symbols-outlined text-sm">{showMeta ? 'expand_less' : 'expand_more'}</span>
                SEO Meta Description
            </button>
            {showMeta && (
                <div className="mb-4 animate-fade-in">
                    <textarea value={metaDesc} onChange={e => setMetaDesc(e.target.value)}
                        placeholder="Write a compelling meta description (150-160 chars)..." rows={2}
                        className="w-full glass-panel rounded-xl px-4 py-3 text-sm text-white bg-transparent border border-white/[0.06] outline-none resize-none placeholder-slate-600" />
                    <p className="text-[10px] text-slate-600 mt-1">{metaDesc.length}/160 characters</p>
                </div>
            )}

            {/* Export Bar */}
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={copyHTML}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${copied === 'html'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'glass-panel border border-white/[0.06] text-white hover:border-primary/30'
                    }`}>
                    <span className="material-symbols-outlined text-sm">{copied === 'html' ? 'check' : 'code'}</span>
                    {copied === 'html' ? 'Copied!' : 'Copy HTML'}
                </button>
                <button onClick={copyText}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${copied === 'text'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'glass-panel border border-white/[0.06] text-white hover:border-primary/30'
                    }`}>
                    <span className="material-symbols-outlined text-sm">{copied === 'text' ? 'check' : 'content_copy'}</span>
                    {copied === 'text' ? 'Copied!' : 'Copy Text'}
                </button>
                <button onClick={downloadHTML}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold glass-panel border border-white/[0.06] text-white hover:border-primary/30 transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm">download</span>
                    Download HTML
                </button>
                <div className="flex-1" />
                {onSave && (
                    <button onClick={() => onSave({ title: blogTitle, html: editor.getHTML(), text: editor.getText(), metaDesc })}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">save</span>
                        Save Blog
                    </button>
                )}
            </div>

            {/* TipTap Editor Styles */}
            <style>{`
                .blog-editor-content{outline:none;min-height:400px;color:#e2e8f0;font-size:1.05rem;line-height:1.9;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
                .blog-editor-content h1{font-size:1.85rem;font-weight:800;color:#f1f5f9;margin:1.5rem 0 .75rem;line-height:1.3}
                .blog-editor-content h2{font-size:1.4rem;font-weight:700;color:#f1f5f9;margin:1.5rem 0 .5rem;line-height:1.35}
                .blog-editor-content h3{font-size:1.15rem;font-weight:600;color:#e2e8f0;margin:1.25rem 0 .5rem}
                .blog-editor-content p{margin:.75rem 0}
                .blog-editor-content ul,.blog-editor-content ol{padding-left:1.5rem;margin:.75rem 0}
                .blog-editor-content li{margin:.3rem 0}
                .blog-editor-content blockquote{border-left:3px solid #6366f1;padding-left:1rem;margin:1rem 0;color:#94a3b8;font-style:italic}
                .blog-editor-content img{max-width:100%;border-radius:12px;margin:1.5rem 0}
                .blog-editor-content hr{border:none;border-top:1px solid rgba(255,255,255,0.08);margin:2rem 0}
                .blog-editor-content code{background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-size:.9em;color:#f472b6}
                .blog-editor-content pre{background:rgba(0,0,0,0.3);padding:1rem;border-radius:10px;overflow-x:auto;margin:1rem 0}
                .blog-editor-content pre code{background:none;padding:0;color:#a5d8ff}
                .blog-editor-content a,.blog-editor-content .blog-link{color:#818cf8;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
                .blog-editor-content mark{background:rgba(250,204,21,0.25);color:inherit;border-radius:2px;padding:0 2px}
                .ProseMirror:focus{outline:none}
                .ProseMirror .is-empty::before{content:attr(data-placeholder);float:left;color:#475569;pointer-events:none;height:0}
            `}</style>
        </div>
    )
}
