                    {/* ── INTELLIGENCE HUB (Trends / News / Ideas) ── */}
                    <div className="dash-card overflow-hidden !p-0 anim-up" style={{ animationDelay: '140ms' }}>
                        {/* Tab bar */}
                        <div className="flex border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                            {intelTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`intel-tab flex-1 px-4 py-3 text-xs font-black cursor-pointer border-b-2 transition-all ${activeTab === tab.id ? 'active border-violet-500 text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)] border-transparent hover:text-[var(--sys-text)]'}`}>
                                    {tab.label}
                                </button>
                            ))}
                            <button onClick={() => { loadSummary(); loadTrends() }}
                                className="px-4 text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-colors border-l border-[var(--sys-border)]">
                                <span className={`material-symbols-outlined text-lg ${loadingSummary ? 'animate-spin' : ''}`}>refresh</span>
                            </button>
                        </div>

                        <div className="p-5">
                            {/* ── TRENDS TAB ── */}
                            {activeTab === 'trends' && (
                                <div className="space-y-2.5">
                                    {(trendsLoading && trendingTopics.length === 0) ? (
                                        <div className="flex items-center gap-2 py-6 text-[var(--sys-text-muted)] text-sm">
                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            Scanning trends…
                                        </div>
                                    ) : trendingTopics.length > 0 ? trendingTopics.slice(0, 5).map((trend, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] hover:border-rose-500/15 transition-all group"
                                            style={{ animation: `slide-up .35s ease-out ${i * 50}ms both` }}>
                                            <span className={`material-symbols-outlined text-xl shrink-0 ${trend.source === 'Grok xAI' ? 'text-orange-400' : 'text-rose-400'}`}>
                                                {trend.source === 'Grok xAI' ? 'smart_toy' : 'trending_up'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="text-sm font-bold text-[var(--sys-text)] truncate">{trend.title}</p>
                                                    {trend.urgency === 'high' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold shrink-0">🔥</span>}
                                                </div>
                                                {(trend.contentIdea || trend.angle) && (
                                                    <p className="text-xs text-[var(--sys-text-muted)] truncate">💡 {trend.contentIdea || trend.angle}</p>
                                                )}
                                            </div>
                                            <button onClick={() => navigate(`/content-studio?trend=${encodeURIComponent(trend.title)}&prompt=${encodeURIComponent(trend.contentIdea || `Create content about "${trend.title}"`)}`)}
                                                className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all cursor-pointer border border-rose-500/15 opacity-60 group-hover:opacity-100 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                                <span className="hidden sm:inline">Create</span>
                                            </button>
                                        </div>
                                    )) : grokTrends.slice(0, 4).map((t, i) => (
                                        <div key={i} className="p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-orange-500/20 transition-all"
                                            style={{ animation: `slide-up .35s ease-out ${i * 50}ms both` }}>
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <p className="text-sm font-bold text-[var(--sys-text)]">{t.topic}</p>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${t.urgency === 'now' ? 'bg-rose-500/15 text-rose-400' : t.urgency === 'today' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/10 text-[var(--sys-text-muted)]'}`}>
                                                    {t.urgency === 'now' ? '🔴 NOW' : t.urgency === 'today' ? '🟡 Today' : '📅 This week'}
                                                </span>
                                            </div>
                                            {t.marketingAngle && <p className="text-xs text-emerald-400">💡 {t.marketingAngle}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── NEWS TAB ── */}
                            {activeTab === 'news' && (
                                <div className="space-y-2.5">
                                    {loadingSummary ? (
                                        [1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-[var(--sys-surface)] animate-pulse" />)
                                    ) : businessNews.length > 0 ? businessNews.slice(0, 5).map((n, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-emerald-500/15 transition-all"
                                            style={{ animation: `slide-up .35s ease-out ${i * 60}ms both` }}>
                                            <span className="text-xl shrink-0">{n.emoji || '📰'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-bold text-[var(--sys-text)] leading-snug">{n.headline}</p>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${n.category === 'funding' ? 'bg-green-500/10 text-green-400' : n.category === 'competitor' ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-400'}`}>{n.category}</span>
                                                </div>
                                                <p className="text-xs text-emerald-400 mt-1">💡 {n.relevance}</p>
                                            </div>
                                        </div>
                                    )) : <p className="text-sm text-[var(--sys-text-muted)] py-6 text-center">No news yet — refresh to fetch latest.</p>}
                                </div>
                            )}

                            {/* ── IDEAS TAB ── */}
                            {activeTab === 'ideas' && (
                                <div className="space-y-2.5">
                                    {loadingSummary ? (
                                        [1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-[var(--sys-surface)] animate-pulse" />)
                                    ) : grokContent.length > 0 ? grokContent.slice(0, 5).map((s, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] hover:border-cyan-500/20 transition-all cursor-pointer group"
                                            onClick={() => navigate(`/content-studio?goal=write&prompt=${encodeURIComponent(s.hook || s.title)}`)}
                                            style={{ animation: `slide-up .35s ease-out ${i * 60}ms both` }}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400' : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-[var(--sys-text-muted)]'}`}>{s.platform}</span>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)] font-bold">{s.format}</span>
                                                    {s.viralPotential === 'high' && <span className="text-[10px] text-orange-400 font-bold ml-auto">🔥 Viral</span>}
                                                </div>
                                                <p className="text-sm font-bold text-[var(--sys-text)] group-hover:text-cyan-400 transition-colors line-clamp-1">{s.title}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)] line-clamp-2 mt-0.5">{s.hook}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] group-hover:text-cyan-400 transition-colors shrink-0 mt-1">arrow_forward</span>
                                        </div>
                                    )) : <p className="text-sm text-[var(--sys-text-muted)] py-6 text-center">No content ideas yet — refresh to generate.</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── UPCOMING OPPORTUNITIES ── */}
                    {upcoming.length > 0 && (
                        <div className="dash-card anim-up" style={{ animationDelay: '180ms' }}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">celebration</span>
                                    <span className="text-sm font-bold text-[var(--sys-text)]">Upcoming Opportunities</span>
                                </div>
                                <button onClick={() => navigate('/smart-calendar')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-bold cursor-pointer">View All →</button>
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                                {upcoming.slice(0, 7).map((e, i) => {
                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                    return (
                                        <button key={i} onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(e.name)}&tone=${e.tone}`)}
                                            className="shrink-0 w-36 rounded-xl p-3 text-left bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer border flex flex-col gap-2"
                                            style={{ borderColor: color.border + '25', animation: `slide-up .35s ease-out ${i * 40}ms both` }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xl">{e.emoji}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-violet-500/15 text-violet-400'}`}>
                                                    {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TMR' : `${e.daysUntil}d`}
                                                </span>
                                            </div>
                                            <p className="text-xs font-bold text-[var(--sys-text)] leading-tight line-clamp-2">{e.name}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
