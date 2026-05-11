import { useState, useEffect, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { dashboardSummary, trends as trendsAPI, brandCalendar as brandCalendarAPI, pmStudio, funnelStudio, shopifyAnalytics } from '../services/api'
import { getUpcomingEvents, EVENT_COLORS } from '../data/calendarData'
import SmartCommandBox from '../components/SmartCommandBox'
import IntelReportViewer from '../components/IntelReportViewer'

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}

function useTypewriter(text, speed = 38) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    if (!text) return
    let i = 0
    const iv = setInterval(() => { setDisplayed(text.slice(0, ++i)); if (i >= text.length) clearInterval(iv) }, speed)
    return () => clearInterval(iv)
  }, [text, speed])
  return displayed
}

// ── Micro ring SVG ──
function Ring({ score = 0, color, size = 56, stroke = 6 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const [v, setV] = useState(0)
  useEffect(() => { const t = setTimeout(() => setV(score), 400); return () => clearTimeout(t) }, [score])
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ - (v/100)*circ}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:'stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)',filter:`drop-shadow(0 0 4px ${color}60)`}}/>
    </svg>
  )
}

// ── Platform icon + color map ──
const PL = {
  instagram: { icon: 'photo_camera', color: '#E1306C', bg: 'rgba(225,48,108,0.12)' },
  facebook:  { icon: 'thumb_up',     color: '#1877F2', bg: 'rgba(24,119,242,0.12)' },
  linkedin:  { icon: 'work',         color: '#0A66C2', bg: 'rgba(10,102,194,0.12)' },
  twitter:   { icon: 'alternate_email', color: '#1DA1F2', bg: 'rgba(29,161,242,0.12)' },
}

function PlatformIcon({ platform, size = 18 }) {
  const p = PL[platform] || { icon: 'share', color: '#888', bg: 'rgba(136,136,136,0.12)' }
  return (
    <span className="inline-flex items-center justify-center rounded-lg" style={{ width: size+10, height: size+10, background: p.bg }}>
      <span className="material-symbols-outlined" style={{ fontSize: size, color: p.color }}>{p.icon}</span>
    </span>
  )
}

// ── Status badge ──
function StatusBadge({ status }) {
  const cfg = { published: { color: '#34d399', icon: 'task_alt' }, failed: { color: '#f43f5e', icon: 'error_outline' }, scheduled: { color: '#f59e0b', icon: 'schedule_send' }, processing: { color: '#8b5cf6', icon: 'hourglass_empty' } }
  const c = cfg[status] || cfg.scheduled
  return <span className="material-symbols-outlined" style={{ fontSize: 13, color: c.color }}>{c.icon}</span>
}

// ── Skeleton pulse ──
function Skel({ className }) {
  return <div className={`rounded-lg bg-white/[0.04] animate-pulse ${className}`}/>
}

// ── Bento card wrapper ──
function Card({ children, className = '', onClick, glow }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm relative overflow-hidden transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-[#ff4d00]/25 hover:bg-[rgba(255,77,0,0.02)]' : ''} ${className}`}
      style={glow ? { boxShadow: '0 0 40px rgba(255,77,0,0.07)' } : {}}
    >
      {children}
    </div>
  )
}

// ── Section label ──
function Label({ icon, children, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {icon && <span className="material-symbols-outlined text-[#ff4d00] text-lg">{icon}</span>}
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-white/50">{children}</h3>
      </div>
      {action && <button onClick={onAction} className="text-[10px] font-bold text-[#ff4d00] hover:opacity-80 transition-opacity cursor-pointer">{action}</button>}
    </div>
  )
}

// ── SVG Sparkline ──
function Spark({ data = [], color = '#ff4d00', h = 28, w = 64 }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h - ((v-min)/range)*h}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{filter:`drop-shadow(0 0 3px ${color}80)`}}/>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════
export default function UserDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { brands, activeBrand, loading: brandsLoading } = useBrand()

  // ── State ──
  const [enhanced, setEnhanced] = useState(null)
  const [intel, setIntel] = useState(null)
  const [trends, setTrends] = useState([])
  const [todaySchedule, setTodaySchedule] = useState({ today: [], tomorrow: [] })
  const [perfData, setPerfData] = useState(null)
  const [funnelData, setFunnelData] = useState(null)
  const [blendedRoas, setBlendedRoas] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [d2c, setD2c] = useState(null)
  const [loadingEnhanced, setLoadingEnhanced] = useState(true)
  const [loadingIntel, setLoadingIntel] = useState(true)
  const [loadingTrends, setLoadingTrends] = useState(true)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [intelReport, setIntelReport] = useState(null)
  const [activeIntelTab, setActiveIntelTab] = useState('trends')
  const [error, setError] = useState(null)

  const country = activeBrand?.dna?.country || 'India'
  const upcoming = getUpcomingEvents(country, 14)
  const greeting = useTypewriter(`${getGreeting()}, ${user?.name?.split(' ')[0] || 'Creator'}`)

  // ── Redirect if no brands ──
  useEffect(() => {
    if (!brandsLoading && brands?.length === 0 && user?.role !== 'member') navigate('/onboarding')
  }, [brands, brandsLoading, navigate, user?.role])

  // ── Load enhanced aggregate ──
  const loadEnhanced = useCallback(async () => {
    setLoadingEnhanced(true)
    try { setEnhanced(await dashboardSummary.getEnhanced(activeBrand?._id)) }
    catch (e) { console.warn('Enhanced load:', e.message) }
    finally { setLoadingEnhanced(false) }
  }, [activeBrand?._id])

  // ── Load intelligence (trends + news + ideas) ──
  const loadIntel = useCallback(async () => {
    setLoadingIntel(true)
    try { setIntel(await dashboardSummary.getIntelligence(activeBrand?._id)) }
    catch (e) { console.warn('Intel load:', e.message) }
    finally { setLoadingIntel(false) }
  }, [activeBrand?._id])

  // ── Load brand-matched trends ──
  const loadTrends = useCallback(async () => {
    setLoadingTrends(true)
    try {
      const d = activeBrand?._id ? await trendsAPI.brandMatch(activeBrand._id) : await trendsAPI.now()
      setTrends(d.trends || [])
    } catch (e) { console.warn('Trends:', e.message) }
    finally { setLoadingTrends(false) }
  }, [activeBrand?._id])

  // ── Load analytics (PM + Funnel + ROAS + D2C) ──
  const loadAnalytics = useCallback(async () => {
    if (!activeBrand?._id) return
    setLoadingAnalytics(true)
    try {
      const [perfR, funnelR, roasR, anomR, d2cR] = await Promise.allSettled([
        pmStudio.dashboard({ brandId: activeBrand._id }),
        funnelStudio.list({ brandId: activeBrand._id }).then(async d => {
          const best = (d.funnels||[]).sort((a,b)=>(b.metrics?.totalEntries||0)-(a.metrics?.totalEntries||0))[0]
          if (!best) return null
          const ar = await funnelStudio.analytics(best._id)
          return { funnel: best, analytics: ar.analytics }
        }),
        pmStudio.blendedRoas({ brandId: activeBrand._id }),
        pmStudio.anomalies({ brandId: activeBrand._id }),
        shopifyAnalytics.snapshot(),
      ])
      if (perfR.status === 'fulfilled') setPerfData(perfR.value?.dashboard || null)
      if (funnelR.status === 'fulfilled') setFunnelData(funnelR.value)
      if (roasR.status === 'fulfilled') setBlendedRoas(roasR.value)
      if (anomR.status === 'fulfilled') setAnomalies(anomR.value?.anomalies || [])
      if (d2cR.status === 'fulfilled') setD2c(d2cR.value)
    } catch(e) { console.warn('Analytics:', e.message) }
    finally { setLoadingAnalytics(false) }
  }, [activeBrand?._id])

  // ── Today's calendar ──
  useEffect(() => {
    if (!activeBrand?._id) return
    brandCalendarAPI.today(activeBrand._id)
      .then(d => setTodaySchedule({ today: d.today||[], tomorrow: d.tomorrow||[] }))
      .catch(()=>{})
  }, [activeBrand?._id])

  // ── Main load effect ──
  useEffect(() => {
    setEnhanced(null); setIntel(null); setTrends([])
    setPerfData(null); setFunnelData(null); setBlendedRoas(null); setD2c(null)
    loadEnhanced(); loadIntel(); loadTrends(); loadAnalytics()
    const iv = setInterval(() => { loadEnhanced(); loadTrends() }, 30*60*1000)
    return () => clearInterval(iv)
  }, [activeBrand?._id, loadEnhanced, loadIntel, loadTrends, loadAnalytics])

  // ── Derived data ──
  const health = enhanced?.healthScores || {}
  const streak = enhanced?.streak || 0
  const socialPlatforms = enhanced?.socialPlatforms || {}
  const intelMissions = enhanced?.intelMissions || []
  const scheduledPosts = enhanced?.scheduledPosts || { today: [], tomorrow: [], totalUpcoming: 0 }
  const activity = enhanced?.activity || { content: { thisWeek: 0 }, creatives: { thisWeek: 0 } }
  const grokTrends = intel?.grokTrends || []
  const businessNews = intel?.businessNews || []
  const grokContent = intel?.grokContent || []
  const grokSeo = intel?.grokSeo || {}

  const studios = [
    { icon: 'psychology',     label: 'Brainstorm', path: '/brainstorm',           color: '#FF4D00', count: 0 },
    { icon: 'edit_note',      label: 'Content',    path: '/content-studio',        color: '#34d399', count: activity.content?.thisWeek || 0 },
    { icon: 'auto_fix_high',  label: 'Creative',   path: '/creative-studio',       color: '#ec4899', count: activity.creatives?.thisWeek || 0 },
    { icon: 'movie',          label: 'Video',      path: '/video-studio',          color: '#f59e0b', count: 0 },
    { icon: 'search_insights',label: 'SEO',        path: '/seo-studio',            color: '#06b6d4', count: 0 },
    { icon: 'campaign',       label: 'Ads',        path: '/performance-marketing', color: '#f43f5e', count: perfData?.stats?.activeCampaigns || 0 },
    { icon: 'calendar_month', label: 'Calendar',   path: '/smart-calendar',        color: '#a78bfa', count: scheduledPosts.totalUpcoming || 0 },
    { icon: 'share',          label: 'Social',     path: '/social-media-studio',   color: '#38bdf8', count: enhanced?.connectedPlatformCount || 0 },
  ]
  const hotStudioIdx = studios.reduce((best, s, i) => s.count > studios[best].count ? i : best, 0)

  const healthMetrics = [
    { label: 'Content', key: 'contentVelocity',   color: '#ff4d00', icon: 'speed' },
    { label: 'Creative', key: 'creativeOutput',   color: '#8ff5ff', icon: 'fingerprint' },
    { label: 'Brand',   key: 'brandCompleteness', color: '#f3eff6', icon: 'grid_view' },
    { label: 'Trend',   key: 'trendReadiness',    color: '#ff906d', icon: 'trending_up' },
  ]

  const openIntelReport = async (mission) => {
    try {
      const token = localStorage.getItem('mantram_token')
      const base = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      const r = await fetch(`${base}/intel/missions/${mission._id}/findings`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); setIntelReport({ mission, findings: d }) }
    } catch {}
  }

  return (
    <DashboardLayout title="Command Center" subtitle="Your AI-driven operational hub">
      <SEOHead title="Command Center — Mantram AI" noIndex={true} />
      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl border flex items-center gap-3 bg-[#ff4d00]/10 border-[#ff4d00]/20 text-[#ff4d00] text-sm">
          <span className="material-symbols-outlined text-lg">warning</span>
          <span className="flex-1 font-medium">{error.message}</span>
          <button onClick={()=>setError(null)}><span className="material-symbols-outlined text-sm opacity-60 hover:opacity-100">close</span></button>
        </div>
      )}
      {anomalies.length > 0 && (
        <div className="mb-5 px-4 py-3 rounded-xl border flex items-center gap-3 bg-amber-500/10 border-amber-500/20 text-amber-400 text-sm">
          <span className="material-symbols-outlined text-lg animate-pulse">crisis_alert</span>
          <span className="flex-1 font-medium">Anomaly detected: {anomalies[0]?.metric || 'Data drift'} threshold breached</span>
          <button onClick={()=>navigate('/performance-marketing')} className="text-xs font-bold underline">View</button>
        </div>
      )}
      <div className="mb-6">
        <SmartCommandBox variant="dashboard" className="w-full bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 text-white placeholder-white/30 focus:border-[#ff4d00]/40 shadow-inner" />
      </div>
            <div className="max-w-7xl mx-auto space-y-5 pb-16">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-1">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</p>
            <h1 className="text-3xl font-['Space_Grotesk'] font-bold text-white tracking-tight">{greeting}<span className="animate-pulse">|</span></h1>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff4d00]/10 border border-[#ff4d00]/20">
              <span className="text-xl">🔥</span>
              <div><p className="text-lg font-black text-[#ff4d00] leading-none">{streak}</p><p className="text-[9px] text-white/40 uppercase tracking-widest">Day Streak</p></div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-12 gap-5">
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="monitoring">Brand Pulse</Label>
            {loadingEnhanced ? (
              <div className="grid grid-cols-2 gap-3">{[0,1,2,3].map(i=><Skel key={i} className="h-20"/>)}</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {healthMetrics.map((m,i)=>(
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <Ring score={health[m.key]||0} color={m.color} size={44} stroke={4}/>
                    <div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">{m.label}</p>
                      <p className="text-xl font-['Space_Grotesk'] font-bold text-white leading-tight">{Math.round(health[m.key]||0)}<span className="text-xs text-white/30">/100</span></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {d2c?.connected ? (
              <div className="mt-4 pt-4 border-t border-white/[0.05] grid grid-cols-3 gap-2">
                {[['Revenue','₹'+String((d2c.weeklyRevenue||0).toLocaleString()),'#34d399'],['Orders',String(d2c.weeklyOrders||0),'#8ff5ff'],['Velocity','High','#a78bfa']].map(([l,v,c])=>(
                  <div key={l} className="text-center"><p className="text-[10px] text-white/30 uppercase tracking-wider">{l}</p><p className="text-sm font-bold" style={{color:c}}>{v}</p></div>
                ))}
              </div>
            ) : (
              <button onClick={()=>navigate('/d2c-analytics')} className="mt-4 w-full py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 hover:text-white/70 transition-colors font-bold cursor-pointer">Connect Shopify →</button>
            )}
          </Card>
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="calendar_today" action="View Calendar" onAction={()=>navigate('/brand-calendar')}>Today&apos;s Queue</Label>
            {(todaySchedule.today.length + todaySchedule.tomorrow.length) === 0 ? (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-4xl text-white/10 block mb-3">event_busy</span>
                <p className="text-xs text-white/30 mb-4">Nothing scheduled today</p>
                <button onClick={()=>navigate('/social-media-studio')} className="px-4 py-2 rounded-xl bg-[#ff4d00]/10 border border-[#ff4d00]/20 text-[#ff4d00] text-xs font-bold hover:bg-[#ff4d00]/20 cursor-pointer">+ Schedule a Post</button>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySchedule.today.length > 0 && <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/30">Today</p>}
                {todaySchedule.today.slice(0,4).map(e=>(
                  <div key={e._id} onClick={()=>navigate('/brand-calendar')} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-[#ff4d00]/20 cursor-pointer transition-all group">
                    <PlatformIcon platform={(e.platform||'').toLowerCase()}/>
                    <p className="text-xs text-white/60 truncate flex-1 group-hover:text-white">{(e.caption||'Post').slice(0,32)}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {e.scheduledFor && <span className="text-[10px] text-white/30">{new Date(e.scheduledFor).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
                      <StatusBadge status={e.status}/>
                    </div>
                  </div>
                ))}
                {todaySchedule.tomorrow.length > 0 && <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/20 mt-2">Tomorrow</p>}
                {todaySchedule.tomorrow.slice(0,2).map(e=>(
                  <div key={e._id} onClick={()=>navigate('/brand-calendar')} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] cursor-pointer opacity-60 hover:opacity-90 transition-all">
                    <PlatformIcon platform={(e.platform||'').toLowerCase()}/>
                    <p className="text-xs text-white/50 truncate flex-1">{(e.caption||'Post').slice(0,32)}</p>
                    {e.scheduledFor && <span className="text-[10px] text-white/25">{new Date(e.scheduledFor).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="finance" action="Deep Dive" onAction={()=>navigate('/performance-marketing')}>Performance Vector</Label>
            {loadingAnalytics ? (
              <div className="space-y-3">{[0,1,2,3].map(i=><Skel key={i} className="h-12"/>)}</div>
            ) : (perfData||funnelData||blendedRoas) ? (
              <div className="space-y-2">
                {[['Total Spend','₹'+String((perfData?.stats?.totalSpend||0).toLocaleString()),'#ff4d00'],['Blended ROAS',String(blendedRoas?.mer||perfData?.stats?.avgRoas||'—')+'x','#8ff5ff'],['Funnel CVR',String(funnelData?.analytics?.overview?.conversionRate||0)+'%','#34d399'],['Live Campaigns',String(perfData?.stats?.activeCampaigns||0),'#a78bfa']].map(([l,v,c])=>(
                  <div key={l} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-xs text-white/40 font-bold uppercase tracking-wider">{l}</p>
                    <p className="text-lg font-['Space_Grotesk'] font-bold" style={{color:c}}>{v}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-4xl text-white/10 block mb-3">campaign</span>
                <p className="text-xs text-white/30 mb-4">No ad campaigns yet</p>
                <button onClick={()=>navigate('/performance-marketing')} className="px-4 py-2 rounded-xl bg-[#f43f5e]/10 border border-[#f43f5e]/20 text-[#f43f5e] text-xs font-bold hover:bg-[#f43f5e]/20 cursor-pointer">Connect Ads →</button>
              </div>
            )}
          </Card>
        </div>
        <div className="grid grid-cols-12 gap-5">
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="local_fire_department">🔥 Trending Now</Label>
            {(loadingTrends && trends.length===0) ? (
              <div className="space-y-2">{[0,1,2,3,4].map(i=><Skel key={i} className="h-14"/>)}</div>
            ) : (trends.length>0?trends:grokTrends).slice(0,5).map((t,i)=>(
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-2 hover:border-rose-500/15 transition-all group">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black shrink-0 mt-0.5 ${(t.urgency==='high'||t.urgency==='now')?'bg-rose-500/15 text-rose-400':t.urgency==='today'?'bg-amber-500/15 text-amber-400':'bg-white/5 text-white/30'}`}>
                  {(t.urgency==='high'||t.urgency==='now')?'NOW':t.urgency==='today'?'TODAY':'WEEK'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white/80 truncate">{t.title||t.topic}</p>
                  {(t.contentIdea||t.angle||t.marketingAngle) && <p className="text-[10px] text-emerald-400 truncate">💡 {t.contentIdea||t.angle||t.marketingAngle}</p>}
                </div>
                <button onClick={()=>navigate('/content-studio?trend='+encodeURIComponent(t.title||t.topic))} className="shrink-0 opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold cursor-pointer transition-opacity">Create</button>
              </div>
            ))}
            {(grokSeo?.risingKeywords||[]).length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.05]">
                <p className="text-[9px] uppercase tracking-wider text-white/30 mb-2 font-bold">Rising Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {grokSeo.risingKeywords.slice(0,4).map((k,i)=>(
                    <span key={i} className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/15">{k.keyword}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="newspaper">📰 Business News</Label>
            {loadingIntel ? (
              <div className="space-y-2">{[0,1,2,3].map(i=><Skel key={i} className="h-16"/>)}</div>
            ) : businessNews.length > 0 ? businessNews.slice(0,4).map((n,i)=>(
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-2 hover:border-emerald-500/15 transition-all">
                <span className="text-xl shrink-0">{n.emoji||'📰'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <p className="text-xs font-bold text-white/80 leading-tight flex-1">{n.headline}</p>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${n.category==='funding'?'bg-green-500/10 text-green-400':n.category==='competitor'?'bg-rose-500/10 text-rose-400':'bg-cyan-500/10 text-cyan-400'}`}>{n.category}</span>
                  </div>
                  {n.relevance && <p className="text-[10px] text-emerald-400">💡 {n.relevance}</p>}
                </div>
              </div>
            )) : <p className="text-xs text-white/30 py-8 text-center">Refresh to fetch latest news</p>}
          </Card>
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="tips_and_updates">💡 Opportunities</Label>
            {loadingIntel ? (
              <div className="space-y-2">{[0,1,2].map(i=><Skel key={i} className="h-16"/>)}</div>
            ) : grokContent.slice(0,3).map((s,i)=>(
              <div key={i} onClick={()=>navigate('/content-studio?prompt='+encodeURIComponent(s.hook||s.title))} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-2 hover:border-cyan-500/20 cursor-pointer transition-all group">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${s.platform==='instagram'?'bg-pink-500/10 text-pink-400':s.platform==='twitter'?'bg-sky-500/10 text-sky-400':s.platform==='linkedin'?'bg-blue-500/10 text-blue-400':'bg-white/5 text-white/30'}`}>{s.platform||'Content'}</span>
                  {s.viralPotential==='high' && <span className="text-[9px] text-orange-400 font-bold ml-auto">🔥 Viral</span>}
                </div>
                <p className="text-xs font-bold text-white/70 group-hover:text-cyan-400 transition-colors line-clamp-1">{s.title}</p>
                <p className="text-[10px] text-white/30 line-clamp-1 mt-0.5">{s.hook}</p>
              </div>
            ))}
            {upcoming.slice(0,3).map((e,i)=>(
              <button key={i} onClick={()=>navigate('/content-studio?occasion='+encodeURIComponent(e.name))} className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-violet-500/20 cursor-pointer mb-2 transition-all group">
                <span className="text-lg">{e.emoji}</span>
                <span className="text-xs text-white/60 flex-1 text-left">{e.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.daysUntil<=3?'bg-rose-500/15 text-rose-400':e.daysUntil<=7?'bg-amber-500/15 text-amber-400':'bg-violet-500/10 text-violet-400'}`}>{e.daysUntil===0?'TODAY':e.daysUntil===1?'TMR':String(e.daysUntil)+'d'}</span>
              </button>
            ))}
          </Card>
        </div>
        {upcoming.length > 0 && (
          <Card className="p-5">
            <Label icon="celebration" action="View All" onAction={()=>navigate('/smart-calendar')}>Upcoming Events</Label>
            <div className="flex gap-3 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
              {upcoming.slice(0,12).map((e,i)=>{
                const c = EVENT_COLORS[e.type]||EVENT_COLORS.global
                return (
                  <button key={i} onClick={()=>navigate('/content-studio?occasion='+encodeURIComponent(e.name)+'&tone='+(e.tone||''))}
                    className="shrink-0 w-32 rounded-xl p-3 text-left bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] flex flex-col gap-2 transition-all cursor-pointer"
                    style={{borderColor:c.border+'20'}}>
                    <div className="flex items-center justify-between"><span className="text-xl">{e.emoji}</span><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.daysUntil<=3?'bg-rose-500/15 text-rose-400':e.daysUntil<=7?'bg-amber-500/15 text-amber-400':'bg-violet-500/10 text-violet-400'}`}>{e.daysUntil===0?'TODAY':e.daysUntil===1?'TMR':String(e.daysUntil)+'d'}</span></div>
                    <p className="text-[11px] font-bold text-white/70 leading-tight line-clamp-2">{e.name}</p>
                  </button>
                )
              })}
            </div>
          </Card>
        )}
        <div className="grid grid-cols-12 gap-5">
          <Card className="col-span-12 lg:col-span-5 p-5">
            <Label icon="hub" action="Manage" onAction={()=>navigate('/integrations')}>Social Pipeline</Label>
            <div className="space-y-2">
              {['instagram','facebook','linkedin','twitter'].map(pl=>{
                const p = socialPlatforms[pl]||{connected:false}
                const meta = PL[pl]||{icon:'share',color:'#888',bg:'rgba(136,136,136,0.1)'}
                return (
                  <div key={pl} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.10] transition-all">
                    <span className="inline-flex items-center justify-center rounded-lg w-9 h-9 shrink-0" style={{background:meta.bg}}>
                      <span className="material-symbols-outlined text-lg" style={{color:meta.color}}>{meta.icon}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white/70 capitalize">{pl}</p>
                      <p className="text-[10px] text-white/30">{p.connected?(p.accountName||'Connected'):'Not connected'}</p>
                    </div>
                    {p.connected ? (
                      <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/><span className="text-[10px] text-emerald-400 font-bold">Live</span></div>
                    ) : (
                      <button onClick={()=>navigate('/integrations')} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.08] border border-white/[0.07] cursor-pointer">Connect</button>
                    )}
                  </div>
                )
              })}
            </div>
            {scheduledPosts.totalUpcoming > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between">
                <span className="text-xs text-white/30">Upcoming posts queued</span>
                <span className="text-sm font-black text-[#ff4d00]">{scheduledPosts.totalUpcoming}</span>
              </div>
            )}
          </Card>
          <Card className="col-span-12 lg:col-span-4 p-5">
            <Label icon="apps">Studio Launcher</Label>
            <div className="grid grid-cols-4 gap-2">
              {studios.map((s,i)=>(
                <button key={i} onClick={()=>navigate(s.path)} className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer ${i===hotStudioIdx?'bg-[#ff4d00]/10 border-[#ff4d00]/25':'bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.10]'}`}>
                  <span className="material-symbols-outlined text-xl" style={{color:i===hotStudioIdx?'#ff4d00':s.color}}>{s.icon}</span>
                  <p className="text-[9px] font-bold text-white/50 leading-tight text-center">{s.label}</p>
                  {s.count > 0 && <span className="text-[8px] font-black px-1 py-0.5 rounded-full bg-white/[0.07] text-white/30">{s.count}</span>}
                </button>
              ))}
            </div>
          </Card>
          <Card className="col-span-12 lg:col-span-3 p-5">
            <Label icon="radar" action="New +" onAction={()=>navigate('/seo-studio?tab=intel')}>Intel Missions</Label>
            {intelMissions.length === 0 ? (
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-3xl text-white/10 block mb-2">satellite_alt</span>
                <p className="text-xs text-white/30 mb-3">No active missions</p>
                <button onClick={()=>navigate('/seo-studio?tab=intel')} className="px-3 py-1.5 rounded-xl bg-[#06b6d4]/10 border border-[#06b6d4]/20 text-[#06b6d4] text-xs font-bold hover:bg-[#06b6d4]/20 cursor-pointer">Launch Mission</button>
              </div>
            ) : intelMissions.map((m,i)=>(
              <div key={i} onClick={()=>openIntelReport(m)} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-2 hover:border-[#06b6d4]/20 cursor-pointer transition-all group">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${m.status==='active'?'bg-emerald-400 animate-pulse':'bg-white/20'}`}/>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white/70 group-hover:text-[#06b6d4] transition-colors truncate">{m.title}</p>
                  <p className="text-[10px] text-white/30">{m.target?.name} · {m.type}</p>
                </div>
                <span className="material-symbols-outlined text-xs text-white/20 group-hover:text-[#06b6d4] transition-colors">chevron_right</span>
              </div>
            ))}
          </Card>
        </div>

        {/* ── Check Virality Bento Card ── */}
        <Card className="p-0 overflow-hidden" glow onClick={()=>navigate('/virality-predictor')}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,77,0,0.12) 0%, rgba(245,158,11,0.08) 50%, rgba(99,102,241,0.06) 100%)',
            borderRadius: '16px',
            padding: '28px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Background glow blob */}
            <div style={{
              position: 'absolute', top: '-30%', left: '-5%',
              width: '250px', height: '250px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,77,0,0.18) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}/>
            <div style={{
              position: 'absolute', bottom: '-20%', right: '5%',
              width: '180px', height: '180px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}/>
            <div className="flex items-start justify-between gap-6 relative">
              {/* Left */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(255,77,0,0.15)',
                    border: '1px solid rgba(255,77,0,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(255,77,0,0.2)',
                  }}>
                    <span className="material-symbols-outlined" style={{fontSize: 24, color: '#ff4d00'}}>local_fire_department</span>
                  </div>
                  <div>
                    <h3 style={{margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: 'Inter, sans-serif'}}>Check Virality</h3>
                    <p style={{margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif'}}>AI-powered content analysis</p>
                  </div>
                </div>
                <p style={{margin: '0 0 16px', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, fontFamily: 'Inter, sans-serif', maxWidth: 480}}>
                  Upload any image or video — our 3-model AI pipeline predicts virality with a 6-dimension score map, real-time trend research, and brand-specific tips.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: 'auto_awesome', label: 'Gemini Vision', color: '#4285f4' },
                    { icon: 'travel_explore', label: 'Grok Trends', color: '#ff4d00' },
                    { icon: 'psychology', label: 'Claude AI', color: '#d97706' },
                  ].map(m => (
                    <div key={m.label} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <span className="material-symbols-outlined" style={{fontSize: 14, color: m.color}}>{m.icon}</span>
                      <span style={{fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter, sans-serif'}}>{m.label}</span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 8,
                    background: 'rgba(255,77,0,0.08)',
                    border: '1px solid rgba(255,77,0,0.2)',
                  }}>
                    <span className="material-symbols-outlined" style={{fontSize: 14, color: '#ff4d00'}}>toll</span>
                    <span style={{fontSize: 11, fontWeight: 700, color: '#ff4d00', fontFamily: 'Inter, sans-serif'}}>3 credits</span>
                  </div>
                </div>
              </div>
              {/* Right — CTA */}
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div style={{
                  width: 80, height: 80, borderRadius: 16,
                  background: 'rgba(255,77,0,0.1)',
                  border: '1px solid rgba(255,77,0,0.2)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  <span style={{fontSize: 28, fontWeight: 900, color: '#ff4d00', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1}}>?</span>
                  <span style={{fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif'}}>Score</span>
                </div>
                <div style={{
                  padding: '10px 18px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #ff4d00, #ff7733)',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 4px 20px rgba(255,77,0,0.35)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                }}>
                  <span className="material-symbols-outlined" style={{fontSize: 16}}>local_fire_department</span>
                  Predict Virality
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {intelReport && (
        <IntelReportViewer
          mission={intelReport.mission}
          findings={intelReport.findings}
          onClose={()=>setIntelReport(null)}
        />
      )}
    </DashboardLayout>
  )
}