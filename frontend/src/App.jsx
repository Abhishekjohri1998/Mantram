import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider } from './context/AuthContext'
import { BrandProvider } from './context/BrandContext'
import { CreditProvider } from './context/CreditContext'
import { ShopifyProvider } from './context/ShopifyContext'
import { UIProvider } from './context/UIContext'
import ProtectedRoute from './components/ProtectedRoute'
import PlanGatedRoute from './components/PlanGatedRoute'
import { BackgroundJobsContext, useBackgroundJobs } from './hooks/useBackgroundJobs'

// ── Global overlays — lazy-loaded (not needed for first paint) ──
const AgentFidatoPanel = lazy(() => import('./components/AgentFidatoPanel'))
const NexusBar = lazy(() => import('./components/NexusBar'))
const BackgroundJobsPanel = lazy(() => import('./components/BackgroundJobsPanel'))

// ── Public pages — lazy-loaded (only load when route matches) ──
const Auth = lazy(() => import('./pages/Auth'))
const Landing = lazy(() => import('./pages/Landing'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))

// ── Lazy Imports (Heavy/Studio Pages) ──
const About = lazy(() => import('./pages/About'))
const BrandOnboarding = lazy(() => import('./pages/BrandOnboarding'))
const Nexus = lazy(() => import('./pages/Nexus'))
const BrandDNA = lazy(() => import('./pages/BrandDNA'))
const Analytics = lazy(() => import('./pages/Analytics'))
const UserDashboard = lazy(() => import('./pages/UserDashboard'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const TeamDashboard = lazy(() => import('./pages/TeamDashboard'))
const ContentStudio = lazy(() => import('./pages/ContentStudio'))
const CreativeStudio = lazy(() => import('./pages/CreativeStudio'))
// const CanvasEditor = lazy(() => import('./pages/CanvasEditor'))  // Legacy monolith (6,796 lines) — kept as rollback
const CanvasEditor = lazy(() => import('./pages/canvas/CanvasShell'))  // New modular shell (910 lines)
const Integrations = lazy(() => import('./pages/Integrations'))
const SmartCalendar = lazy(() => import('./pages/SmartCalendar'))
const PublishSchedule = lazy(() => import('./pages/PublishSchedule'))
const BrainstormStudio = lazy(() => import('./pages/BrainstormStudio'))
const ResearchStudio = lazy(() => import('./pages/ResearchStudio'))
const SeoStudio = lazy(() => import('./pages/SeoStudio'))
const ConversationStudio = lazy(() => import('./pages/ConversationStudio'))
const Automations = lazy(() => import('./pages/Automations'))
const AISettings = lazy(() => import('./pages/AISettings'))
const Insights = lazy(() => import('./pages/Insights'))
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'))
const CreditsPage = lazy(() => import('./pages/CreditsPage'))
const VideoStudio = lazy(() => import('./pages/VideoStudio'))
const YouTubeStudio = lazy(() => import('./pages/YouTubeStudio'))
const PerformanceMarketing = lazy(() => import('./pages/PerformanceMarketing'))
const D2CAnalytics = lazy(() => import('./pages/D2CAnalytics'))
const FunnelStudio = lazy(() => import('./pages/FunnelStudio'))
const SocialMediaStudio = lazy(() => import('./pages/SocialMediaStudio'))
const BrandManagement = lazy(() => import('./pages/BrandManagement'))
const SkillsHub = lazy(() => import('./pages/SkillsHub'))
const StudioPreview = lazy(() => import('./pages/StudioPreview'))
const JoinTeam = lazy(() => import('./pages/JoinTeam'))
const RetentionStudio = lazy(() => import('./pages/RetentionStudio'))
const UserSettings = lazy(() => import('./pages/UserSettings'))
const BrandCalendar = lazy(() => import('./pages/BrandCalendar'))

// ── Pulse Studio (brief-to-published) ──
const PulseStudio = lazy(() => import('./pages/PulseStudio/index'))

const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const DataDeletion = lazy(() => import('./pages/DataDeletion'))
const UnderConstruction = lazy(() => import('./pages/UnderConstruction'))

// ── Loading Fallback ──
function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="text-slate-500 font-medium animate-pulse">Initializing Mantram AI...</p>
    </div>
  )
}


// Inner wrapper that provides the BackgroundJobs context after BrowserRouter
function AppInner() {
  const backgroundJobs = useBackgroundJobs();

  // Expose addJob globally so deep components (e.g. CreativeStudio) can register jobs
  // without prop drilling through many layers
  useEffect(() => {
    window.__bgJobs__ = {
      addJob: backgroundJobs.addJob,
      dismissJob: backgroundJobs.dismissJob,
      removeJob: backgroundJobs.removeJob,
    };
    return () => { window.__bgJobs__ = null; };
  }, [backgroundJobs.addJob, backgroundJobs.dismissJob, backgroundJobs.removeJob]);

  return (
    <BackgroundJobsContext.Provider value={backgroundJobs}>
      <Suspense fallback={null}>
        <AgentFidatoPanel studio="global" panelOnly />
        <NexusBar />
        <BackgroundJobsPanel />
      </Suspense>
    </BackgroundJobsContext.Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ShopifyProvider>
        <AuthProvider>
          <BrandProvider>
            <CreditProvider>
              <UIProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    {/* Public routes */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/login" element={<Auth />} />
                    <Route path="/signup" element={<Auth />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/onboarding" element={<BrandOnboarding />} />
                    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/data-deletion" element={<DataDeletion />} />
                    <Route path="/data-deletion-status" element={<DataDeletion />} />
                    <Route path="/studio/:slug" element={<StudioPreview />} />
                    <Route path="/join/:token" element={<JoinTeam />} />

                    {/* Protected routes — require authentication */}
                    <Route path="/nexus" element={<ProtectedRoute><Nexus /></ProtectedRoute>} />
                    <Route path="/brand-dna" element={<ProtectedRoute><BrandDNA /></ProtectedRoute>} />
                    <Route path="/brands" element={<ProtectedRoute><BrandManagement /></ProtectedRoute>} />
                    <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
                    <Route path="/home" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminDashboard /></ProtectedRoute>} />
                    <Route path="/team" element={<ProtectedRoute><TeamDashboard /></ProtectedRoute>} />
                    <Route path="/content-studio" element={<ProtectedRoute><ContentStudio /></ProtectedRoute>} />
                    <Route path="/creative-studio" element={<ProtectedRoute><CreativeStudio /></ProtectedRoute>} />
                    <Route path="/ai-canvas" element={<ProtectedRoute><CanvasEditor /></ProtectedRoute>} />  {/* Now using modular CanvasShell */}
                    <Route path="/video-studio" element={<ProtectedRoute><VideoStudio /></ProtectedRoute>} />
                    <Route path="/youtube-studio" element={<ProtectedRoute><YouTubeStudio /></ProtectedRoute>} />
                    <Route path="/performance-marketing" element={<ProtectedRoute><PerformanceMarketing /></ProtectedRoute>} />
                    <Route path="/d2c-analytics" element={<ProtectedRoute><D2CAnalytics /></ProtectedRoute>} />
                    <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
                    <Route path="/funnel-studio" element={<ProtectedRoute><FunnelStudio /></ProtectedRoute>} />
                    <Route path="/social-media-studio" element={<ProtectedRoute><SocialMediaStudio /></ProtectedRoute>} />
                    <Route path="/smart-calendar" element={<Navigate to="/social-media-studio" replace />} />
                    <Route path="/publish" element={<Navigate to="/social-media-studio" replace />} />
                    <Route path="/brainstorm" element={<ProtectedRoute><BrainstormStudio /></ProtectedRoute>} />
                    <Route path="/research-studio" element={<ProtectedRoute><ResearchStudio /></ProtectedRoute>} />
                    <Route path="/seo-studio" element={<ProtectedRoute><SeoStudio /></ProtectedRoute>} />
                    <Route path="/conversations" element={<ProtectedRoute><ConversationStudio /></ProtectedRoute>} />
                    <Route path="/conversations/automations" element={<ProtectedRoute><Automations /></ProtectedRoute>} />
                    <Route path="/conversations/ai-settings" element={<ProtectedRoute><AISettings /></ProtectedRoute>} />
                    <Route path="/conversations/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
                    <Route path="/credits" element={<ProtectedRoute><CreditsPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
                    <Route path="/skills" element={<ProtectedRoute><SkillsHub /></ProtectedRoute>} />
                    <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminDashboard /></ProtectedRoute>} />
                    <Route path="/retention-studio" element={<ProtectedRoute><RetentionStudio /></ProtectedRoute>} />
                    <Route path="/pulse-studio" element={<ProtectedRoute><PulseStudio /></ProtectedRoute>} />
                    <Route path="/brand-calendar" element={<ProtectedRoute><BrandCalendar /></ProtectedRoute>} />
                    <Route path="/publish-schedule" element={<ProtectedRoute><PublishSchedule /></ProtectedRoute>} />
                    <Route path="/pulse-studio/*" element={<ProtectedRoute><PulseStudio /></ProtectedRoute>} />
                    <Route path="/creative-studio/pulse-studio" element={<Navigate to="/pulse-studio" replace />} />
                    <Route path="/creative-studio/pulse-studio/*" element={<Navigate to="/pulse-studio" replace />} />

                    {/* Catch-all: redirect unknown routes to dashboard (prevents blank screens from stale links) */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>

                {/* Global Background Jobs Panel + Fidato — mounted across all routes */}
                <AppInner />
              </UIProvider>
            </CreditProvider>
          </BrandProvider>
        </AuthProvider>
      </ShopifyProvider>
    </BrowserRouter>
  )
}

export default App
