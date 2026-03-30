import React, { createContext, useContext, useState, useCallback } from 'react'

const UIContext = createContext()

export const useUI = () => {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}

export const UIProvider = ({ children }) => {
  const [fidatoOpen, setFidatoOpen] = useState(false)
  const [intelMissionCount, setIntelMissionCount] = useState(0)

  const toggleFidato = useCallback(() => setFidatoOpen(prev => !prev), [])
  const openFidato = useCallback(() => setFidatoOpen(true), [])
  const closeFidato = useCallback(() => setFidatoOpen(false), [])

  const refreshIntelCount = useCallback(async (brandId) => {
    if (!brandId) return
    try {
      const token = localStorage.getItem('mantram_token')
      const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      const resp = await fetch(`${API_BASE}/intel/missions?brandId=${brandId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (resp.ok) {
        const data = await resp.json()
        setIntelMissionCount((data.missions || []).filter(m => m.status === 'active').length)
      }
    } catch { /* silent */ }
  }, [])

  return (
    <UIContext.Provider value={{
      fidatoOpen,
      toggleFidato,
      openFidato,
      closeFidato,
      intelMissionCount,
      setIntelMissionCount,
      refreshIntelCount
    }}>
      {children}
    </UIContext.Provider>
  )
}
