import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { credits as creditsAPI } from '../services/api'

const CreditContext = createContext({})

export function CreditProvider({ children }) {
    const { user } = useAuth()
    const [balance, setBalance] = useState(null)
    const [costs, setCosts] = useState(null)

    const refresh = async () => {
        try {
            const data = await creditsAPI.balance()
            setBalance({ remaining: data.remaining, total: data.total, used: data.used, unlimited: data.unlimited, plan: data.plan })
            if (data.costs) setCosts(data.costs)
        } catch { /* ignore */ }
    }

    useEffect(() => {
        if (user) refresh()
        const interval = setInterval(() => { if (user) refresh() }, 60 * 1000)
        return () => clearInterval(interval)
    }, [user])

    return (
        <CreditContext.Provider value={{ balance, costs, refresh }}>
            {children}
        </CreditContext.Provider>
    )
}

export const useCredits = () => useContext(CreditContext)
