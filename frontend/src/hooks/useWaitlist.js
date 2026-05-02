import { useState } from 'react'

/**
 * Waitlist submission hook. Wraps the existing /api/waitlist endpoint that
 * the previous Landing page used, so the backend contract is unchanged.
 *
 * `type` is 'individual' (early access) or 'enterprise' (agency demo).
 * `source` lets sub-pages tag their own funnel without breaking the schema.
 */
export default function useWaitlist() {
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState(null)

    async function submit({ email, name = '', type = 'individual', company = '', role = '', phone = '', teamSize = '', message = '', source = 'landing' }) {
        if (!email?.trim()) {
            setError('Email is required')
            return false
        }
        setSubmitting(true)
        setError(null)
        try {
            const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
            const res = await fetch(`${apiBaseUrl}/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name, type, company, role, phone, teamSize, message, source }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || data?.success === false) {
                setError(data?.message || 'Submission failed. Please try again.')
                return false
            }
            setSubmitted(true)
            return true
        } catch (e) {
            setError('Network error. Please check your connection.')
            return false
        } finally {
            setSubmitting(false)
        }
    }

    function reset() {
        setSubmitted(false)
        setSubmitting(false)
        setError(null)
    }

    return { submit, submitting, submitted, error, reset }
}
