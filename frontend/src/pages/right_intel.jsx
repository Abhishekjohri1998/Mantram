                    {/* ── TRENDING KEYWORDS ── */}
                    {grokSeo?.risingKeywords?.length > 0 && (
                        <div className="dash-card border border-amber-500/10 anim-up" style={{ animationDelay: '160ms' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-400 text-lg">search</span>
                                <span className="text-sm font-bold text-[var(--sys-text)]">Trending Keywords</span>
                            </div>
                            <div className="space-y-2">
                                {grokSeo.risingKeywords.slice(0, 5).map((k, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-[var(--sys-text)] truncate">"{k.keyword}"</p>
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">{k.intent} intent</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ml-2 ${k.trend === 'breakout' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{k.growthRate}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/seo-studio')} className="w-full mt-3 py-2 rounded-xl bg-amber-500/5 text-amber-400 text-xs font-bold hover:bg-amber-500/10 transition-all cursor-pointer border border-amber-500/10">
                                Open SEO Studio →
                            </button>
                        </div>
                    )}

                    {/* ── QUICK WIN (next event) ── */}
                    {upcoming.length > 0 && (
                        <div className="dash-card bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10 anim-up" style={{ animationDelay: '200ms' }}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-amber-400 text-lg">tips_and_updates</span>
                                <span className="text-sm font-bold text-[var(--sys-text)]">Quick Win</span>
                            </div>
                            <p className="text-sm text-slate-300 mb-3">
                                <span className="text-base mr-1">{upcoming[0].emoji}</span>
                                <strong>{upcoming[0].name}</strong> is {upcoming[0].daysUntil === 0 ? 'today' : upcoming[0].daysUntil === 1 ? 'tomorrow' : `in ${upcoming[0].daysUntil} days`}
                            </p>
                            <button onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(upcoming[0].name)}&tone=${upcoming[0].tone}`)}
                                className="w-full py-2 rounded-xl bg-amber-500/10 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-amber-500/20">
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>Generate Content
                            </button>
                        </div>
                    )}
