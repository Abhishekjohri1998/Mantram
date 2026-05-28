import { Component } from 'react';

/**
 * Global Error Boundary — catches unhandled React render errors across the app.
 * Prevents blank white screens by showing a branded recovery UI.
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('🚨 [ErrorBoundary] Unhandled render error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleGoHome = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.href = '/dashboard';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    background: '#050510',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                    padding: '24px',
                }}>
                    <div style={{
                        maxWidth: '480px',
                        width: '100%',
                        textAlign: 'center',
                    }}>
                        {/* Icon */}
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '20px',
                            background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                            border: '1px solid rgba(239,68,68,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 24px',
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#ef4444' }}>
                                error_outline
                            </span>
                        </div>

                        {/* Heading */}
                        <h1 style={{
                            fontSize: '22px',
                            fontWeight: '700',
                            color: '#f1f5f9',
                            marginBottom: '8px',
                            letterSpacing: '-0.02em',
                        }}>
                            Something went wrong
                        </h1>

                        {/* Description */}
                        <p style={{
                            fontSize: '14px',
                            color: '#94a3b8',
                            lineHeight: '1.6',
                            marginBottom: '28px',
                        }}>
                            An unexpected error occurred. This has been logged automatically. 
                            You can try again or go back to the dashboard.
                        </p>

                        {/* Error details (dev mode) */}
                        {import.meta.env.DEV && this.state.error && (
                            <div style={{
                                background: 'rgba(239,68,68,0.06)',
                                border: '1px solid rgba(239,68,68,0.15)',
                                borderRadius: '12px',
                                padding: '14px',
                                marginBottom: '24px',
                                textAlign: 'left',
                            }}>
                                <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f87171', wordBreak: 'break-all', margin: 0 }}>
                                    {this.state.error?.toString()}
                                </p>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleReset}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    border: '1px solid rgba(148,163,184,0.2)',
                                    background: 'rgba(148,163,184,0.08)',
                                    color: '#cbd5e1',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(148,163,184,0.15)'; }}
                                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(148,163,184,0.08)'; }}
                            >
                                Try Again
                            </button>
                            <button
                                onClick={this.handleGoHome}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                    fontWeight: '600',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                                onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
                            >
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
