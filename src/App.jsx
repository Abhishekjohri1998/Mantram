import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BrandProvider } from './context/BrandContext'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import BrandOnboarding from './pages/BrandOnboarding'
import Nexus from './pages/Nexus'
import BrandDNA from './pages/BrandDNA'
import Analytics from './pages/Analytics'
import UserDashboard from './pages/UserDashboard'
import AdminDashboard from './pages/AdminDashboard'
import TeamDashboard from './pages/TeamDashboard'
import ContentStudio from './pages/ContentStudio'
import CreativeStudio from './pages/CreativeStudio'
import Integrations from './pages/Integrations'
import SmartCalendar from './pages/SmartCalendar'
import PublishSchedule from './pages/PublishSchedule'
import BrainstormStudio from './pages/BrainstormStudio'
import SeoStudio from './pages/SeoStudio'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import CreditsPage from './pages/CreditsPage'

import { CreditProvider } from './context/CreditContext'
import UnderConstruction from './pages/UnderConstruction'

function App() {
  const isProduction = window.location.hostname.includes('mantram.ai');

  if (isProduction) {
    return <UnderConstruction />
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandProvider>
          <CreditProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<BrandOnboarding />} />
              <Route path="/nexus" element={<Nexus />} />
              <Route path="/brand-dna" element={<BrandDNA />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/dashboard" element={<UserDashboard />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/team" element={<TeamDashboard />} />
              <Route path="/content-studio" element={<ContentStudio />} />
              <Route path="/creative-studio" element={<CreativeStudio />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/smart-calendar" element={<SmartCalendar />} />
              <Route path="/publish" element={<PublishSchedule />} />
              <Route path="/brainstorm" element={<BrainstormStudio />} />
              <Route path="/seo-studio" element={<SeoStudio />} />
              <Route path="/credits" element={<CreditsPage />} />
              <Route path="/superadmin" element={<SuperAdminDashboard />} />
            </Routes>
          </CreditProvider>
        </BrandProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
