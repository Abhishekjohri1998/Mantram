import { createContext, useContext, useState, useEffect } from 'react';
import { auth as authAPI, setToken, clearToken, getToken, clearCache } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Check for existing token on mount
    useEffect(() => {
        const token = getToken();
        if (token) {
            authAPI.getProfile()
                .then(data => setUser(data.user))
                .catch(() => { clearToken(); setUser(null); })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }

        // Global interceptor for 401 Unauthorized API responses
        const handleUnauthorized = () => {
            console.warn('[AuthContext] Session expired or invalid. Logging out securely.');
            clearToken();
            setUser(null);
        };
        window.addEventListener('mantram:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('mantram:unauthorized', handleUnauthorized);
    }, []);

    const login = async (email, password) => {
        const data = await authAPI.login({ email, password });
        setToken(data.token);
        // Force refresh to get accurate brandCount (owned + shared)
        const profileData = await authAPI.getProfile();
        setUser(profileData.user);
        return { ...data, user: profileData.user };
    };

    const register = async (name, email, password, company, initialWebsite) => {
        const data = await authAPI.register({ name, email, password, company, initialWebsite });
        // If registration leads to immediate login (auto-approve)

        if (data.token) {
            setToken(data.token);
            const profileData = await authAPI.getProfile();
            setUser(profileData.user);
            return { ...data, user: profileData.user };
        }
        return data;
    };

    const logout = () => {
        clearToken();
        clearCache(); // Purge SWR cache to prevent stale data leaking between sessions
        setUser(null);
    };

    const loginWithToken = (token, userData) => {
        setToken(token);
        setUser(userData);
    };

    const updateProfile = async (updates) => {
        const data = await authAPI.updateProfile(updates);
        setUser(data.user);
        return data;
    };

    const refreshUser = async () => {
        try {
            const data = await authAPI.getProfile();
            setUser(data.user);
        } catch (err) {
            console.error('Failed to refresh user:', err);
        }
    };

    return (
        <AuthContext.Provider value={{
            user, loading, login, register, logout, loginWithToken,
            updateProfile, refreshUser, isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
