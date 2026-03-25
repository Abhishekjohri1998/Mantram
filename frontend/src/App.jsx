import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BrandProvider } from './context/BrandContext'
import { CreditProvider } from './context/CreditContext'
import { ShopifyProvider } from './context/ShopifyContext'
import ProtectedRoute from './components/ProtectedRoute'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import About from './pages/About'
import BrandOnboarding from './pages/BrandOnboarding'
import Nexus from './pages/Nexus'
import BrandDNA from './pages/BrandDNA'
import Analytics from './pages/Analytics'
import UserDashboard from './pages/UserDashboard'
import AdminDashboard from './pages/AdminDashboard'
import TeamDashboard from './pages/TeamDashboard'
import ContentStudio from './pages/ContentStudio'
import CreativeStudio from './pages/CreativeStudio'
import CanvasEditor from './pages/CanvasEditor'
import Integrations from './pages/Integrations'
import SmartCalendar from './pages/SmartCalendar'
import PublishSchedule from './pages/PublishSchedule'
import BrainstormStudio from './pages/BrainstormStudio'
import SeoStudio from './pages/SeoStudio'
import ConversationStudio from './pages/ConversationStudio'
import Automations from './pages/Automations'
import AISettings from './pages/AISettings'
import Insights from './pages/Insights'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import CreditsPage from './pages/CreditsPage'
import VideoStudio from './pages/VideoStudio'
import PerformanceMarketing from './pages/PerformanceMarketing'
import D2CAnalytics from './pages/D2CAnalytics'
import BrandManagement from './pages/BrandManagement'
import SkillsHub from './pages/SkillsHub'

import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import DataDeletion from './pages/DataDeletion'
import UnderConstruction from './pages/UnderConstruction'

function App() {
  // const isProduction = window.location.hostname.includes('mantram.ai');
  // if (isProduction) {
  //   return <UnderConstruction />
  // }

  return (
    <BrowserRouter>
      <ShopifyProvider>
        <AuthProvider>
          <BrandProvider>
            <CreditProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/about" element={<About />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<BrandOnboarding />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/data-deletion" element={<DataDeletion />} />
                <Route path="/data-deletion-status" element={<DataDeletion />} />

                {/* Protected routes — require authentication */}
                <Route path="/nexus" element={<ProtectedRoute><Nexus /></ProtectedRoute>} />
                <Route path="/brand-dna" element={<ProtectedRoute><BrandDNA /></ProtectedRoute>} />
                <Route path="/brands" element={<ProtectedRoute><BrandManagement /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminDashboard /></ProtectedRoute>} />
                <Route path="/team" element={<ProtectedRoute><TeamDashboard /></ProtectedRoute>} />
                <Route path="/content-studio" element={<ProtectedRoute><ContentStudio /></ProtectedRoute>} />
                <Route path="/creative-studio" element={<ProtectedRoute><CreativeStudio /></ProtectedRoute>} />
                <Route path="/creative-studio/editor" element={<ProtectedRoute><CanvasEditor /></ProtectedRoute>} />
                <Route path="/video-studio" element={<ProtectedRoute><VideoStudio /></ProtectedRoute>} />
                <Route path="/performance-marketing" element={<ProtectedRoute><PerformanceMarketing /></ProtectedRoute>} />
                <Route path="/d2c-analytics" element={<ProtectedRoute><D2CAnalytics /></ProtectedRoute>} />
                <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
                <Route path="/smart-calendar" element={<ProtectedRoute><SmartCalendar /></ProtectedRoute>} />
                <Route path="/publish" element={<ProtectedRoute><PublishSchedule /></ProtectedRoute>} />
                <Route path="/brainstorm" element={<ProtectedRoute><BrainstormStudio /></ProtectedRoute>} />
                <Route path="/seo-studio" element={<ProtectedRoute><SeoStudio /></ProtectedRoute>} />
                <Route path="/conversations" element={<ProtectedRoute><ConversationStudio /></ProtectedRoute>} />
                <Route path="/conversations/automations" element={<ProtectedRoute><Automations /></ProtectedRoute>} />
                <Route path="/conversations/ai-settings" element={<ProtectedRoute><AISettings /></ProtectedRoute>} />
                <Route path="/conversations/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
                <Route path="/credits" element={<ProtectedRoute><CreditsPage /></ProtectedRoute>} />
                <Route path="/skills" element={<ProtectedRoute><SkillsHub /></ProtectedRoute>} />
                <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminDashboard /></ProtectedRoute>} />
              </Routes>
            </CreditProvider>
          </BrandProvider>
        </AuthProvider>
      </ShopifyProvider>
    </BrowserRouter>
  )
}

export default App
