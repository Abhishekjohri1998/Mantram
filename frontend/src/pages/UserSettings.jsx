import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { auth as authAPI, payments as paymentsAPI, team as teamAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useCredits } from '../context/CreditContext'

const SECTIONS = [
    { key: 'profile', label: 'Profile', icon: 'person' },
    { key: 'userid', label: 'User ID', icon: 'badge' },
    { key: 'security', label: 'Security', icon: 'lock' },
    { key: 'subscription', label: 'Subscription', icon: 'credit_card' },
    { key: 'credits', label: 'Credit Usage', icon: 'toll' },
    { key: 'preferences', label: 'Preferences', icon: 'tune' },
    { key: 'team', label: 'Team', icon: 'group' },
]

export default function UserSettings() {
    const { user, refreshUser } = useAuth()
    const { balance: creditBalance } = useCredits()
    const navigate = useNavigate()

    // Active section
    const [section, setSection] = useState('profile')

    // Profile
    const [profile, setProfile] = useState(null)
    const [profileLoading, setProfileLoading] = useState(true)
    const [editName, setEditName] = useState('')
    const [editCompany, setEditCompany] = useState('')
    const [profileSaving, setProfileSaving] = useState(false)
    const [profileMsg, setProfileMsg] = useState(null)

    // User ID claim
    const [claimInput, setClaimInput] = useState('')
    const [claimLoading, setClaimLoading] = useState(false)
    const [claimMsg, setClaimMsg] = useState(null)

    // Password
    const [currentPw, setCurrentPw] = useState('')
    const [newPw, setNewPw] = useState('')
    const [confirmPw, setConfirmPw] = useState('')
    const [pwLoading, setPwLoading] = useState(false)
    const [pwMsg, setPwMsg] = useState(null)
    const [showCurrentPw, setShowCurrentPw] = useState(false)
    const [showNewPw, setShowNewPw] = useState(false)

    // Subscription
    const [subStatus, setSubStatus] = useState(null)

    // Preferences
    const [prefs, setPrefs] = useState({})
    const [prefsSaving, setPrefsSaving] = useState(false)
    const [prefsMsg, setPrefsMsg] = useState(null)

    // Team
    const [teamInfo, setTeamInfo] = useState(null)

    useEffect(() => { loadProfile(); loadSubStatus() }, [])
    useEffect(() => { if (section === 'team') loadTeam() }, [section])

    const loadProfile = async () => {
        try {
            const data = await authAPI.getProfile()
            setProfile(data.user)
            setEditName(data.user?.name || '')
            setEditCompany(data.user?.company || '')
            setPrefs(data.user?.preferences || {})
        } catch (e) { console.error('Failed to load profile:', e) }
        finally { setProfileLoading(false) }
    }

    const loadSubStatus = async () => {
        try { setSubStatus(await paymentsAPI.subscriptionStatus()) } catch { }
    }

    const loadTeam = async () => {
        try { setTeamInfo(await teamAPI.getMembers()) } catch { }
    }

    const handleProfileSave = async () => {
        if (!editName.trim()) return
        setProfileSaving(true); setProfileMsg(null)
        try {
            await authAPI.updateProfile({ name: editName.trim(), company: editCompany.trim() })
            setProfileMsg({ type: 'success', text: 'Profile updated!' })
            if (refreshUser) refreshUser()
            loadProfile()
        } catch (e) { setProfileMsg({ type: 'error', text: e.message || 'Failed' }) }
        finally { setProfileSaving(false) }
    }

    const handleClaimUserId = async () => {
        if (!claimInput.trim()) return
        setClaimLoading(true); setClaimMsg(null)
        try {
            const data = await authAPI.claimUserId(claimInput.trim())
            setClaimMsg({ type: 'success', text: data.message || 'Claimed!' })
            loadProfile()
        } catch (e) { setClaimMsg({ type: 'error', text: e.message || 'Failed to claim' }) }
        finally { setClaimLoading(false) }
    }

    const handlePasswordChange = async () => {
        if (!currentPw || !newPw) return
        if (newPw.length < 6) { setPwMsg({ type: 'error', text: 'Min 6 characters' }); return }
        if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'Passwords do not match' }); return }
        setPwLoading(true); setPwMsg(null)
        try {
            const data = await authAPI.changePassword(currentPw, newPw)
            setPwMsg({ type: 'success', text: data.message || 'Password changed!' })
            setCurrentPw(''); setNewPw(''); setConfirmPw('')
        } catch (e) { setPwMsg({ type: 'error', text: e.message || 'Failed' }) }
        finally { setPwLoading(false) }
    }

    const handlePrefsSave = async () => {
        setPrefsSaving(true); setPrefsMsg(null)
        try {
            await authAPI.updateProfile({ preferences: prefs })
            setPrefsMsg({ type: 'success', text: 'Preferences saved!' })
            if (refreshUser) refreshUser()
        } catch (e) { setPrefsMsg({ type: 'error', text: e.message || 'Failed' }) }
        finally { setPrefsSaving(false) }
    }

    const copyUserId = () => {
        if (profile?.userId) {
            navigator.clipboard.writeText(profile.userId)
            setClaimMsg({ type: 'success', text: 'Copied to clipboard!' })
            setTimeout(() => setClaimMsg(null), 2000)
        }
    }

    // Helpers
    const initials = (profile?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    const creditPercent = creditBalance && !creditBalance.unlimited
        ? Math.min(100, (creditBalance.remaining / creditBalance.total) * 100) : 100
    const creditColorHex = creditPercent > 50 ? '#34d399' : creditPercent > 20 ? '#fbbf24' : '#fb7185'
    const creditBgHex = creditPercent > 50 ? 'rgba(52,211,153,0.1)' : creditPercent > 20 ? 'rgba(251,191,36,0.1)' : 'rgba(251,113,133,0.1)'

    const validClaimInput = claimInput.length >= 3 && claimInput.length <= 30 &&
        /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(claimInput.toLowerCase()) && !/--/.test(claimInput)

    const MsgBox = ({ msg }) => msg ? (
        <div className={`mt-4 px-4 py-2.5 rounded-xl text-sm font-medium ${msg.type === 'success' ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'}`}>
            {msg.text}
        </div>
    ) : null

    return (
        <DashboardLayout title="Account Settings" subtitle="Manage your profile, security, and preferences">
            <SEOHead title="Account Settings — Mantram AI" noIndex={true} />

            <div className="grid grid-cols-12 gap-6 max-w-6xl mx-auto">
                {/* ══════ SIDEBAR NAV ══════ */}
                <div className="col-span-12 lg:col-span-3">
                    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-3 lg:sticky lg:top-24">
                        {/* User mini card */}
                        <div className="flex items-center gap-3 p-3 mb-2">
                            <div className="size-11 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] font-bold text-base border border-primary/30">
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-[var(--sys-text)] truncate">{profile?.name || 'Loading...'}</p>
                                <p className="text-xs text-[var(--sys-text-muted)] truncate">{profile?.email}</p>
                            </div>
                        </div>

                        <div className="space-y-0.5">
                            {SECTIONS.map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setSection(s.key)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer text-left ${section === s.key
                                        ? 'bg-primary/10 text-primary border border-primary/20'
                                        : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-lg">{s.icon}</span>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ══════ MAIN CONTENT ══════ */}
                <div className="col-span-12 lg:col-span-9">
                    {profileLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="size-8 border border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>

{/* ═══════════════ PROFILE ═══════════════ */}
{section === 'profile' && (
    <div className="space-y-6">
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
            <div className="flex items-center gap-6 mb-8">
                <div className="size-20 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] font-bold text-2xl border border-primary/30">
                    {initials}
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-[var(--sys-text)]">{profile?.name}</h2>
                    <p className="text-sm text-[var(--sys-text-muted)]">{profile?.email}</p>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase">
                            {profile?.plan || 'Starter'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-bold">
                            {profile?.role === 'superadmin' ? 'Super Admin' : profile?.role || 'User'}
                        </span>
                    </div>
                </div>
            </div>

            <h3 className="text-base font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary">edit</span>
                Edit Profile
            </h3>
            <div className="space-y-4 max-w-lg">
                <div>
                    <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Full Name</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none transition-all"
                        placeholder="Your name" />
                </div>
                <div>
                    <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Company</label>
                    <input type="text" value={editCompany} onChange={e => setEditCompany(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none transition-all"
                        placeholder="Company name (optional)" />
                </div>
                <div>
                    <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Email</label>
                    <input type="text" value={profile?.email || ''} readOnly
                        className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-sm cursor-not-allowed" />
                    <p className="text-xs text-[var(--sys-text-muted)] mt-1">Email cannot be changed</p>
                </div>
            </div>
            <MsgBox msg={profileMsg} />
            <button onClick={handleProfileSave} disabled={profileSaving || !editName.trim()}
                className="mt-6 px-8 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light disabled:opacity-40 transition-all cursor-pointer">
                {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>

        {/* Account details grid */}
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
            <h3 className="text-base font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-[var(--sys-text-muted)]">info</span>Account Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Member Since', value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—', icon: 'calendar_month' },
                    { label: 'Brands', value: profile?.brandCount || 0, icon: 'business' },
                    { label: 'Plan', value: (profile?.plan || 'starter').charAt(0).toUpperCase() + (profile?.plan || 'starter').slice(1), icon: 'workspace_premium' },
                    { label: 'Status', value: profile?.approvalStatus === 'approved' ? 'Active' : profile?.approvalStatus || 'Pending', icon: 'verified' },
                ].map(item => (
                    <div key={item.label} className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-4 text-center">
                        <span className="material-symbols-outlined text-xl text-primary mb-2 block">{item.icon}</span>
                        <p className="text-lg font-bold text-[var(--sys-text)]">{item.value}</p>
                        <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold mt-1">{item.label}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
)}

{/* ═══════════════ USER ID ═══════════════ */}
{section === 'userid' && (
    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
        <h3 className="text-xl font-bold text-[var(--sys-text)] flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-2xl text-primary">badge</span>
            Your User ID
        </h3>
        <p className="text-sm text-[var(--sys-text-muted)] mb-8">Your unique identity on Mantram AI. Visible as your handle across the platform.</p>

        {/* Current ID display */}
        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[#FF4D00]/20 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider mb-1">Current User ID</p>
                    <div className="flex items-center gap-3">
                        <p className="text-3xl font-black text-transparent bg-clip-text bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                            {profile?.userId || '—'}
                        </p>
                        {profile?.userIdClaimed && (
                            <span className="px-2.5 py-1 rounded-full bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-xs font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">verified</span>
                                Claimed
                            </span>
                        )}
                    </div>
                </div>
                {profile?.userId && (
                    <button onClick={copyUserId}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all text-sm font-bold cursor-pointer">
                        <span className="material-symbols-outlined text-base">content_copy</span>Copy
                    </button>
                )}
            </div>
        </div>

        {/* Claim section */}
        {profile?.userIdClaimed ? (
            <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-5">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-primary">check_circle</span>
                    <div>
                        <p className="text-sm font-bold text-[var(--sys-text)]">User ID Claimed Permanently</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Your custom User ID has been locked in. This cannot be changed.</p>
                    </div>
                </div>
            </div>
        ) : (
            <div>
                <h4 className="text-base font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-primary">edit_square</span>
                    Claim Your Custom ID
                </h4>
                <p className="text-sm text-[var(--sys-text-muted)] mb-4">
                    Choose a unique handle for yourself. <span className="text-primary font-bold flex items-center gap-1 inline-flex"><span className="material-symbols-outlined text-xs">warning</span> This is a one-time action and cannot be undone.</span>
                </p>

                <div className="flex gap-3 max-w-lg mb-3">
                    <input
                        type="text"
                        value={claimInput}
                        onChange={e => setClaimInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        maxLength={30}
                        className="flex-1 px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none transition-all font-mono tracking-wider"
                        placeholder="e.g. creative-sultan"
                    />
                    <button
                        onClick={handleClaimUserId}
                        disabled={claimLoading || !validClaimInput}
                        className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
                    >
                        {claimLoading ? 'Claiming...' : <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">sell</span>Claim Forever</span>}
                    </button>
                </div>

                {/* Validation hints */}
                <div className="space-y-1 text-xs text-[var(--sys-text-muted)]">
                    <p className={claimInput.length >= 3 && claimInput.length <= 30 ? 'text-primary flex items-center gap-1' : 'flex items-center gap-1'}>
                        <span className="material-symbols-outlined text-[11px]">{claimInput.length >= 3 && claimInput.length <= 30 ? 'check' : 'radio_button_unchecked'}</span> 3-30 characters ({claimInput.length}/30)
                    </p>
                    <p className={claimInput && /^[a-z0-9]/.test(claimInput) && /[a-z0-9]$/.test(claimInput) ? 'text-primary flex items-center gap-1' : 'flex items-center gap-1'}>
                        <span className="material-symbols-outlined text-[11px]">{claimInput && /^[a-z0-9]/.test(claimInput) && /[a-z0-9]$/.test(claimInput) ? 'check' : 'radio_button_unchecked'}</span> Starts and ends with a letter or number
                    </p>
                    <p className={claimInput && !/--/.test(claimInput) && /^[a-z0-9-]*$/.test(claimInput) ? 'text-primary flex items-center gap-1' : 'flex items-center gap-1'}>
                        <span className="material-symbols-outlined text-[11px]">{claimInput && !/--/.test(claimInput) && /^[a-z0-9-]*$/.test(claimInput) ? 'check' : 'radio_button_unchecked'}</span> Only lowercase letters, numbers, and hyphens
                    </p>
                </div>
                <MsgBox msg={claimMsg} />
            </div>
        )}
    </div>
)}

{/* ═══════════════ SECURITY ═══════════════ */}
{section === 'security' && (
    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
        <div className="mb-8">
            <h3 className="text-xl font-bold text-[var(--sys-text)] flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-2xl text-primary">lock</span>
                Change Password
            </h3>
            <p className="text-sm text-[var(--sys-text-muted)]">Update your password to keep your account secure</p>
        </div>

        <div className="space-y-5 max-w-md">
            <div>
                <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Current Password</label>
                <div className="relative">
                    <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none transition-all pr-12"
                        placeholder="Enter current password" />
                    <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-lg">{showCurrentPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                </div>
            </div>
            <div>
                <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">New Password</label>
                <div className="relative">
                    <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none transition-all pr-12"
                        placeholder="Min 6 characters" />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-lg">{showNewPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                </div>
                {newPw && newPw.length < 6 && <p className="text-xs text-primary mt-1">Min 6 characters</p>}
            </div>
            <div>
                <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none transition-all"
                    placeholder="Confirm new password" />
                {confirmPw && confirmPw !== newPw && <p className="text-xs text-primary mt-1">Passwords do not match</p>}
            </div>
        </div>

        <MsgBox msg={pwMsg} />
        <button onClick={handlePasswordChange} disabled={pwLoading || !currentPw || !newPw || !confirmPw || newPw !== confirmPw || newPw.length < 6}
            className="mt-6 px-8 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light disabled:opacity-40 transition-all cursor-pointer">
            {pwLoading ? 'Changing...' : 'Change Password'}
        </button>

        {/* Login info */}
        <div className="mt-10 pt-8 border-t border-[var(--sys-border)]">
            <h4 className="text-base font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-[var(--sys-text-muted)]">devices</span>
                Login Information
            </h4>
            <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-4">
                    <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold mb-1">Last Active</p>
                    <p className="text-sm text-[var(--sys-text)] font-medium">
                        {profile?.lastActive ? new Date(profile.lastActive).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Now'}
                    </p>
                </div>
                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-4">
                    <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold mb-1">Account Created</p>
                    <p className="text-sm text-[var(--sys-text)] font-medium">
                        {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                </div>
            </div>
        </div>
    </div>
)}

{/* ═══════════════ SUBSCRIPTION ═══════════════ */}
{section === 'subscription' && (
    <div className="space-y-6">
        {subStatus?.isCancelled && subStatus?.isInGracePeriod && (
            <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] p-5 rounded-2xl flex items-center gap-4">
                <span className="material-symbols-outlined text-3xl text-primary">warning</span>
                <div className="flex-1">
                    <h3 className="text-base font-bold text-primary">Subscription Cancelled</h3>
                    <p className="text-sm text-[var(--sys-text-muted)]">
                        Access to <strong className="text-[var(--sys-text)]">{subStatus.plan}</strong> until{' '}
                        <strong className="text-[var(--sys-text)]">{new Date(subStatus.gracePeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                        {' '}— <strong className="text-primary">{subStatus.daysRemaining} days left</strong>
                    </p>
                </div>
                <button onClick={() => navigate('/credits')}
                    className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-light transition-all cursor-pointer">
                    Resubscribe
                </button>
            </div>
        )}

        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
            <h3 className="text-xl font-bold text-[var(--sys-text)] flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-2xl text-primary">credit_card</span>
                Subscription Overview
            </h3>

            {subStatus?.hasSubscription ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Plan', value: (subStatus.plan || 'Starter').charAt(0).toUpperCase() + (subStatus.plan || 'starter').slice(1), icon: 'workspace_premium', color: 'text-primary' },
                        { label: 'Billing', value: (subStatus.billingCycle || 'monthly').charAt(0).toUpperCase() + (subStatus.billingCycle || 'monthly').slice(1), icon: 'autorenew', color: 'text-primary' },
                        { label: 'Days Left', value: subStatus.daysRemaining || 0, icon: 'schedule', color: (subStatus.daysRemaining || 0) > 15 ? 'text-primary' : 'text-primary' },
                        { label: 'Renews On', value: subStatus.endDate ? new Date(subStatus.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', icon: 'event', color: 'text-[var(--sys-text-muted)]' },
                    ].map(item => (
                        <div key={item.label} className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-5">
                            <span className={`material-symbols-outlined text-xl ${item.color} mb-2 block`}>{item.icon}</span>
                            <p className="text-lg font-bold text-[var(--sys-text)]">{item.value}</p>
                            <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold mt-1">{item.label}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-8 text-center mb-8">
                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3 block">credit_card_off</span>
                    <p className="text-lg font-bold text-[var(--sys-text)]">No Active Subscription</p>
                    <p className="text-sm text-[var(--sys-text-muted)] mt-1">You're on the free starter plan</p>
                </div>
            )}

            <div className="flex flex-wrap gap-3">
                <button onClick={() => navigate('/credits')}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-lg">upgrade</span>
                    {subStatus?.hasSubscription ? 'Manage Subscription' : 'Upgrade Plan'}
                </button>
                <button onClick={() => navigate('/credits')}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold text-sm hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-lg">receipt_long</span>
                    Transaction History
                </button>
            </div>
        </div>
    </div>
)}

{/* ═══════════════ CREDIT USAGE ═══════════════ */}
{section === 'credits' && (
    <div className="space-y-6">
        {/* Credit balance card */}
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
            <h3 className="text-xl font-bold text-[var(--sys-text)] flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-2xl text-primary">toll</span>
                Credit Balance
            </h3>

            {creditBalance?.unlimited ? (
                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] rounded-xl p-6 flex items-center gap-4">
                    <span className="material-symbols-outlined text-4xl text-primary">all_inclusive</span>
                    <div>
                        <p className="text-2xl font-black text-primary">Unlimited Credits</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">Enterprise plan — no credit limits</p>
                    </div>
                </div>
            ) : creditBalance ? (
                <div>
                    <div className="flex items-end justify-between mb-4">
                        <div>
                            <p className="text-4xl font-black text-[var(--sys-text)]">{creditBalance.remaining}</p>
                            <p className="text-sm text-[var(--sys-text-muted)]">of {creditBalance.total} credits remaining</p>
                        </div>
                        <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: creditBgHex, color: creditColorHex }}>
                            {Math.round(creditPercent)}%
                        </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-[var(--sys-surface)] overflow-hidden mb-6">
                        <div className="h-full rounded-full transition-all"
                            style={{ width: `${creditPercent}%`, background: creditColorHex }} />
                    </div>

                    {/* Usage breakdown */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'Content', value: profile?.usage?.contentGenerated || 0, icon: 'article', color: '#34d399' },
                            { label: 'Creatives', value: profile?.usage?.creativesGenerated || 0, icon: 'palette', color: '#ec4899' },
                            { label: 'Brands', value: profile?.usage?.brandsCreated || 0, icon: 'business', color: '#8b5cf6' },
                        ].map(item => (
                            <div key={item.label} className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-4 text-center">
                                <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: item.color }}>{item.icon}</span>
                                <p className="text-xl font-bold text-[var(--sys-text)]">{item.value}</p>
                                <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold mt-1">{item.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <p className="text-[var(--sys-text-muted)]">Loading credit info...</p>
            )}

            <button onClick={() => navigate('/credits')}
                className="mt-6 flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light transition-all cursor-pointer">
                <span className="material-symbols-outlined text-lg">toll</span>
                Buy More Credits
            </button>
        </div>

        {/* Streak & Rewards */}
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
            <h4 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-lg text-primary">local_fire_department</span>
                Activity Streak
            </h4>
            <div className="flex items-center gap-6">
                <div className="text-center">
                    <p className="text-3xl font-black text-primary">{profile?.streak || 0}</p>
                    <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold">Day Streak</p>
                </div>
                <div className="flex-1 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-4">
                    <p className="text-sm text-[var(--sys-text-muted)]">
                        {(profile?.streak || 0) >= 7
                            ? 'On fire! Keep the momentum going.'
                            : (profile?.streak || 0) >= 3
                            ? 'Great streak! Keep it up for bonus rewards.'
                            : 'Log in daily to build your streak and earn bonus credits!'}
                    </p>
                </div>
            </div>
        </div>
    </div>
)}

{/* ═══════════════ PREFERENCES ═══════════════ */}
{section === 'preferences' && (
    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
        <h3 className="text-xl font-bold text-[var(--sys-text)] flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-2xl text-primary">tune</span>
            Preferences
        </h3>
        <p className="text-sm text-[var(--sys-text-muted)] mb-8">Customize your AI experience and platform behavior</p>

        <div className="space-y-8 max-w-lg">
            {/* AI Model Preferences */}
            <div>
                <h4 className="text-sm font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-[#FF4D00]">auto_awesome</span>
                    AI Model Defaults
                </h4>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Default Text Provider</label>
                        <select value={prefs.defaultTextProvider || ''} onChange={e => setPrefs(p => ({ ...p, defaultTextProvider: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none">
                            <option value="">Auto (Smart Router)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="gemini">Google (Gemini)</option>
                            <option value="grok">XAI (Grok)</option>
                            <option value="openai">OpenAI (GPT)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider block mb-1.5">Default Image Provider</label>
                        <select value={prefs.defaultImageProvider || ''} onChange={e => setPrefs(p => ({ ...p, defaultImageProvider: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary/50 outline-none">
                            <option value="">Auto</option>
                            <option value="flux">Flux</option>
                            <option value="gemini">Gemini Imagen</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Fidato / AI Assistant */}
            <div>
                <h4 className="text-sm font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-primary">smart_toy</span>
                    Fidato AI Assistant
                </h4>
                <div className="space-y-3">
                    <label className="flex items-center justify-between p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] cursor-pointer hover:bg-[var(--sys-surface)] transition-all">
                        <div>
                            <p className="text-sm text-[var(--sys-text)] font-medium">Enable Fidato</p>
                            <p className="text-xs text-[var(--sys-text-muted)]">AI assistant available across all studios</p>
                        </div>
                        <input type="checkbox" checked={prefs.fidatoEnabled !== false} onChange={e => setPrefs(p => ({ ...p, fidatoEnabled: e.target.checked }))}
                            className="accent-primary w-5 h-5 cursor-pointer" />
                    </label>
                    <label className="flex items-center justify-between p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] cursor-pointer hover:bg-[var(--sys-surface)] transition-all">
                        <div>
                            <p className="text-sm text-[var(--sys-text)] font-medium">Welcome Popup</p>
                            <p className="text-xs text-[var(--sys-text-muted)]">Show Fidato greeting when entering a studio</p>
                        </div>
                        <input type="checkbox" checked={prefs.fidatoPopup !== false} onChange={e => setPrefs(p => ({ ...p, fidatoPopup: e.target.checked }))}
                            className="accent-primary w-5 h-5 cursor-pointer" />
                    </label>
                </div>
            </div>
        </div>

        <MsgBox msg={prefsMsg} />
        <button onClick={handlePrefsSave} disabled={prefsSaving}
            className="mt-6 px-8 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light disabled:opacity-40 transition-all cursor-pointer">
            {prefsSaving ? 'Saving...' : 'Save Preferences'}
        </button>
    </div>
)}

{/* ═══════════════ TEAM ═══════════════ */}
{section === 'team' && (
    <div className="space-y-6">
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-8">
            <h3 className="text-xl font-bold text-[var(--sys-text)] flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-2xl text-primary">group</span>
                Team Management
            </h3>
            <p className="text-sm text-[var(--sys-text-muted)] mb-6">Manage your team members, roles, and collaboration settings</p>

            {/* Team stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: 'Members', value: teamInfo?.members?.length || 0, icon: 'group', color: '#8b5cf6' },
                    { label: 'Pending Invites', value: teamInfo?.invites?.length || 0, icon: 'mail', color: '#f59e0b' },
                    { label: 'Your Role', value: teamInfo?.isAdmin ? 'Admin' : 'Member', icon: 'shield_person', color: '#34d399' },
                ].map(item => (
                    <div key={item.label} className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-5 text-center">
                        <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: item.color }}>{item.icon}</span>
                        <p className="text-lg font-bold text-[var(--sys-text)]">{item.value}</p>
                        <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold mt-1">{item.label}</p>
                    </div>
                ))}
            </div>

            {/* Quick member list */}
            {teamInfo?.members?.length > 0 && (
                <div className="mb-6">
                    <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider mb-3">Team Members</p>
                    <div className="flex -space-x-2">
                        {teamInfo.members.slice(0, 8).map((m, i) => (
                            <div key={m._id || i}
                                className="size-10 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-xs font-bold border border-[#0a0a1a]"
                                title={m.name || m.email}>
                                {(m.name || '?').charAt(0).toUpperCase()}
                            </div>
                        ))}
                        {teamInfo.members.length > 8 && (
                            <div className="size-10 rounded-full bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] text-xs font-bold border border-[#0a0a1a]">
                                +{teamInfo.members.length - 8}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <button onClick={() => navigate('/team')}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-none hover:bg-primary-light transition-all cursor-pointer">
                <span className="material-symbols-outlined text-lg">open_in_new</span>
                Open Team Dashboard
            </button>
        </div>

        {/* Integrations link */}
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
            <button onClick={() => navigate('/integrations')} className="w-full flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-xl text-primary">electrical_services</span>
                    <div className="text-left">
                        <p className="text-sm font-bold text-[var(--sys-text)]">Integrations</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Connect Shopify, Meta, Google Ads & more</p>
                    </div>
                </div>
                <span className="material-symbols-outlined text-[var(--sys-text-muted)] group-hover:text-[var(--sys-text)] transition-all">chevron_right</span>
            </button>
        </div>
    </div>
)}

                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
