import { createContext, useContext, useState, useEffect } from 'react';
import { auth as authAPI, setToken, clearToken, getToken } from '../services/api.js';

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
    }, []);

    const login = async (email, password) => {
        const data = await authAPI.login({ email, password });
        setToken(data.token);
        // Force refresh to get accurate brandCount (owned + shared)
        const profileData = await authAPI.getProfile();
        setUser(profileData.user);
        return { ...data, user: profileData.user };
    };

    const register = async (name, email, password, company) => {
        const data = await authAPI.register({ name, email, password, company });
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
