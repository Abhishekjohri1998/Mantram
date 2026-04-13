/**
 * Walkthrough Step Configs — Per-Studio
 *
 * Each studio key maps to an array of steps.
 * Each step: { target, title, description, icon, position }
 *   - target: CSS selector for the element to spotlight
 *   - title: Step title
 *   - description: 1-2 line explanation
 *   - icon: Material Symbols icon name
 *   - position: 'bottom' | 'top' | 'left' | 'right' (tooltip direction)
 */

const WALKTHROUGH_STEPS = {

  // ─── Dashboard ───────────────────────────────────────────────
  dashboard: [
    {
      target: '[data-wt="dashboard-studios"]',
      title: 'Your Studios',
      description: 'Each card opens a dedicated AI studio — content, creative, video, and more. Click any studio to get started.',
      icon: 'grid_view',
      position: 'bottom',
    },
    {
      target: '[data-wt="brand-selector"]',
      title: 'Brand Selector',
      description: 'Switch between brands here. All studios adapt to the selected brand\'s DNA, voice, and guidelines automatically.',
      icon: 'swap_horiz',
      position: 'bottom',
    },
    {
      target: '[data-wt="credits-display"]',
      title: 'Credit Balance',
      description: 'Your available AI credits. Each generation uses credits — track your usage and buy more when needed.',
      icon: 'toll',
      position: 'bottom',
    },
  ],

  // ─── Content Studio ──────────────────────────────────────────
  contentStudio: [
    {
      target: '[data-wt="smart-input"]',
      title: 'Smart Input',
      description: 'Type or speak your content brief in any language. AI will auto-detect your intent, platform, and tone.',
      icon: 'auto_awesome',
      position: 'bottom',
    },
    {
      target: '[data-wt="goal-grid"]',
      title: 'Choose Your Goal',
      description: 'Select what you want to create — promote a product, celebrate an occasion, launch something, write a blog, and more.',
      icon: 'campaign',
      position: 'bottom',
    },
    {
      target: '[data-wt="channel-select"]',
      title: 'Pick a Channel',
      description: 'Select the platform where your content will be published. AI optimizes format, length, and tone for each channel.',
      icon: 'devices',
      position: 'top',
    },
    {
      target: '[data-wt="context-step"]',
      title: 'Add Context',
      description: 'Provide details, upload a product image, paste a URL, or select from your Image Bank. Richer context = better AI output.',
      icon: 'description',
      position: 'top',
    },
    {
      target: '[data-wt="generate-btn"]',
      title: 'Generate Content',
      description: 'Hit Generate and AI creates brand-aligned content with captions, hashtags, and CTAs — all matching your brand\'s DNA.',
      icon: 'bolt',
      position: 'top',
    },
  ],

  // ─── Creative Studio (shared — mode tabs only) ────────────────
  creativeStudio: [
    {
      target: '[data-wt="creative-modes"]',
      title: 'Creative Studio Modes',
      description: 'Switch between AI Create, Photoshoot, Try-On, Mockups, Campaigns, Carousel, Logo Gen, Templates, Image Bank, and AI Canvas.',
      icon: 'palette',
      position: 'bottom',
    },
  ],

  // ─── AI Create (sub-mode) ─────────────────────────────────────
  creativeCreate: [
    {
      target: '[data-wt="creative-prompt"]',
      title: 'Prompt & Settings',
      description: 'Describe what you want to create. Use the settings panel to pick your AI model, aspect ratio, and adjust style preferences.',
      icon: 'edit_note',
      position: 'left',
    },
    {
      target: '[data-wt="creative-generate"]',
      title: 'Generate Image',
      description: 'Click Generate to create a high-quality, brand-aligned image. You can run up to 3 generations simultaneously.',
      icon: 'bolt',
      position: 'top',
    },
    {
      target: '[data-wt="creative-gallery"]',
      title: 'Your Generations',
      description: 'Generated images appear here. Click any image to edit with Gemini AI, download, adapt to different sizes, or animate.',
      icon: 'photo_library',
      position: 'right',
    },
  ],

  // ─── AI Photoshoot (sub-mode) ──────────────────────────────────
  creativePhotoshoot: [
    {
      target: '[data-wt="ps-tools"]',
      title: 'Photoshoot Settings',
      description: 'Upload a product photo, select your AI model, set the scene type, and describe the photoshoot environment you want.',
      icon: 'photo_camera',
      position: 'right',
    },
    {
      target: '[data-wt="ps-generate"]',
      title: 'Generate Scene',
      description: 'Once your product image and brief are ready, click Generate Scene. AI places your product in a professionally styled environment.',
      icon: 'camera',
      position: 'top',
    },
  ],

  // ─── Carousel (sub-mode) ───────────────────────────────────────
  creativeCarousel: [
    {
      target: '[data-wt="carousel-panel"]',
      title: 'Carousel Settings',
      description: 'Describe a background scene, choose the number of panels and aspect ratio. AI generates a seamless panoramic image and splits it.',
      icon: 'view_carousel',
      position: 'left',
    },
    {
      target: '[data-wt="carousel-generate"]',
      title: 'Generate Carousel',
      description: 'Hit Generate to create a multi-panel carousel. Your products will be composited onto the AI-generated panoramic background.',
      icon: 'bolt',
      position: 'top',
    },
  ],

  // ─── Campaigns (sub-mode) ──────────────────────────────────────
  creativeCampaigns: [
    {
      target: '[data-wt="camp-header"]',
      title: 'Campaign Creatives',
      description: 'Build coordinated, trend-powered campaign batches. AI researches trends, generates copy, and creates matching visuals.',
      icon: 'campaign',
      position: 'bottom',
    },
    {
      target: '[data-wt="camp-steps"]',
      title: '3-Step Wizard',
      description: 'Follow the guided flow: Intelligence Brief → Copy & Style → Generate. Each step builds on the last for maximum brand alignment.',
      icon: 'format_list_numbered',
      position: 'bottom',
    },
  ],

  // ─── Logo Generator (sub-mode) ─────────────────────────────────
  creativeCampaignlogo: [
    {
      target: '[data-wt="logo-area"]',
      title: 'Campaign Logo Generator',
      description: 'Create unique campaign logos and monograms. Describe your brand, pick a style, and AI generates multiple options instantly.',
      icon: 'verified',
      position: 'bottom',
    },
  ],

  // ─── Virtual Try-On (sub-mode) ─────────────────────────────────
  creativeTryon: [
    {
      target: '[data-wt="tryon-header"]',
      title: 'Virtual Try-On',
      description: 'Upload a person photo and a clothing item — AI shows them wearing it instantly. Perfect for fashion e-commerce previews.',
      icon: 'checkroom',
      position: 'bottom',
    },
  ],

  // ─── Mockups (sub-mode) ────────────────────────────────────────
  creativeMockups: [
    {
      target: '[data-wt="mockup-header"]',
      title: 'Mockup Studio',
      description: 'Generate product lifestyle scenes or place your logo on merchandise. Choose between AI Lifestyle or Logo Mockup modes.',
      icon: 'landscape',
      position: 'bottom',
    },
  ],

  // ─── Templates (sub-mode) ──────────────────────────────────────
  creativeTemplates: [
    {
      target: '[data-wt="templates-header"]',
      title: 'Brand Templates',
      description: 'Pick a template, fill in your details, and generate on-brand designs instantly — social posts, ads, announcements, and more.',
      icon: 'dashboard_customize',
      position: 'bottom',
    },
  ],

  // ─── Image Bank (sub-mode) ─────────────────────────────────────
  creativeImagebank: [
    {
      target: '[data-wt="imagebank-area"]',
      title: 'Image Bank',
      description: 'All your generated and uploaded images are stored here. Edit with Gemini AI, send to Canvas, or use in other studios.',
      icon: 'photo_library',
      position: 'bottom',
    },
  ],

  // ─── Video Studio ────────────────────────────────────────────
  videoStudio: [
    {
      target: '[data-wt="video-modes"]',
      title: 'Video Modes',
      description: 'Choose between Advanced (direct prompt control), UGC Creator, Video Agent, or the guided Storyboard pipeline.',
      icon: 'movie',
      position: 'bottom',
    },
    {
      target: '[data-wt="video-brief"]',
      title: 'Write Your Brief',
      description: 'Describe your video concept. Add reference images, choose a video type (ad film, product demo, social reel, etc.).',
      icon: 'edit_note',
      position: 'bottom',
    },
    {
      target: '[data-wt="video-images"]',
      title: 'Reference Images',
      description: 'Upload product photos or reference images. AI uses these to generate scene-accurate video frames.',
      icon: 'add_photo_alternate',
      position: 'bottom',
    },
    {
      target: '[data-wt="video-type"]',
      title: 'Video Type',
      description: 'Select the type of video — ad film, UGC, product demo, social reel, or explainer. This shapes the AI\'s creative direction.',
      icon: 'slow_motion_video',
      position: 'top',
    },
    {
      target: '[data-wt="video-start"]',
      title: 'Start Creating',
      description: 'Hit Start to begin the guided pipeline: AI generates concepts → you pick → script → voiceover → final video.',
      icon: 'play_arrow',
      position: 'top',
    },
  ],

  // ─── Brainstorm Studio ───────────────────────────────────────
  brainstormStudio: [
    {
      target: '[data-wt="bs-topics"]',
      title: 'Quick-Start Topics',
      description: 'Select a brainstorm type — ad film, campaign, product launch, naming, or brand strategy. Fidato will guide the conversation.',
      icon: 'lightbulb',
      position: 'bottom',
    },
    {
      target: '[data-wt="bs-chat"]',
      title: 'Chat with Fidato',
      description: 'Fidato is your AI brand strategist. Answer questions naturally — by text or voice — to build a rich creative brief.',
      icon: 'chat',
      position: 'top',
    },
    {
      target: '[data-wt="bs-phase"]',
      title: 'Progress Phases',
      description: 'Track where you are: Exploring → Ideating → Scripting → Delivered. Fidato generates concepts when enough context is gathered.',
      icon: 'timeline',
      position: 'bottom',
    },
    {
      target: '[data-wt="bs-input"]',
      title: 'Your Input',
      description: 'Type or speak your response here. You can also click the suggestion chips above for quick replies.',
      icon: 'keyboard',
      position: 'top',
    },
  ],

  // ─── SEO Studio ──────────────────────────────────────────────
  seoStudio: [
    {
      target: '[data-wt="seo-health"]',
      title: 'Navigation Sidebar',
      description: 'Browse all SEO tools from the sidebar — Health Check, Traffic Strategy, AI Visibility, Competitor Analysis, Backlinks, and more.',
      icon: 'menu',
      position: 'right',
    },
    {
      target: '[data-wt="seo-health"]',
      title: 'Run a Health Check',
      description: 'Start with a full Health Check. AI crawls your entire website, analyzes 800+ pages, and generates an SEO action plan.',
      icon: 'health_and_safety',
      position: 'right',
    },
  ],

  // ─── Performance Marketing ───────────────────────────────────
  pmStudio: [
    {
      target: '[data-wt="pm-tabs"]',
      title: 'Studio Tabs',
      description: 'Navigate between Dashboard, Research, Strategy, Campaigns, A/B Tests, Learnings, and Reports.',
      icon: 'tab',
      position: 'bottom',
    },
    {
      target: '[data-wt="pm-tabs"]',
      title: 'Start with Research',
      description: 'Click Research to analyze competitors and your market. AI builds a full strategy with budget allocation and creative suggestions.',
      icon: 'search_insights',
      position: 'bottom',
    },
  ],

  // ─── Social Media Studio ─────────────────────────────────────
  socialStudio: [
    {
      target: '[data-wt="social-tabs"]',
      title: 'Studio Tabs',
      description: 'Navigate between Dashboard, Strategy, Calendar, Publishing, Audit, Competitors, and Accounts.',
      icon: 'tab',
      position: 'bottom',
    },
    {
      target: '[data-wt="social-tabs"]',
      title: 'Full Analysis',
      description: 'From the Dashboard, click "Full Analysis" to run Strategy + Audit + Competitor Intel in one click.',
      icon: 'rocket_launch',
      position: 'bottom',
    },
  ],

  // ─── Funnel Studio ───────────────────────────────────────────
  funnelStudio: [
    {
      target: '[data-wt="funnel-tabs"]',
      title: 'Funnel Navigation',
      description: 'Switch between My Funnels, Template Marketplace, and the Guide to learn how sales funnels work.',
      icon: 'tab',
      position: 'bottom',
    },
    {
      target: '[data-wt="funnel-tabs"]',
      title: 'Create a Funnel',
      description: 'Pick a template or create from scratch. AI generates stages, nurture sequences, and automations tailored to your business.',
      icon: 'add_circle',
      position: 'bottom',
    },
  ],
}

export default WALKTHROUGH_STEPS
