import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { credits as creditsAPI } from '../services/api'

const CreditContext = createContext({})

export function CreditProvider({ children }) {
    const { user } = useAuth()
    const [balance, setBalance] = useState(null)
    const [costs, setCosts] = useState(null)
    const [creditError, setCreditError] = useState(false)
    const failCountRef = useRef(0)

    const refresh = async () => {
        try {
            const data = await creditsAPI.balance()
            setBalance({ remaining: data.remaining, total: data.total, used: data.used, unlimited: data.unlimited, plan: data.plan })
            if (data.costs) setCosts(data.costs)
            failCountRef.current = 0
            setCreditError(false)
        } catch (err) {
            failCountRef.current += 1
            console.warn(`[CreditContext] Failed to fetch credit balance (attempt ${failCountRef.current}):`, err.message)
            if (failCountRef.current >= 3) {
                setCreditError(true)
            }
        }
    }

    useEffect(() => {
        if (user) refresh()
        const interval = setInterval(() => { if (user) refresh() }, 60 * 1000)
        return () => clearInterval(interval)
    }, [user])

    return (
        <CreditContext.Provider value={{ balance, costs, creditError, refresh }}>
            {children}
        </CreditContext.Provider>
    )
}

export const useCredits = () => useContext(CreditContext)

