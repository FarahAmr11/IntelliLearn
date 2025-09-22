import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing authentication on app load
        const initAuth = async () => {
            try {
                const savedToken = localStorage.getItem('il_token');
                const savedUser = localStorage.getItem('intellilearn-user');

                if (savedToken && savedUser) {
                    // Validate token
                    const isValid = await authService.validateToken(savedToken);
                    if (isValid) {
                        setToken(savedToken);
                        setUser(JSON.parse(savedUser));
                        setIsAuthenticated(true);
                    } else {
                        authService.clearAuth();
                        setToken(null);
                        setUser(null);
                        setIsAuthenticated(false);
                    }
                } else {
                    setToken(null);
                    setUser(null);
                    setIsAuthenticated(false);
                }
            } catch (error) {
                authService.clearAuth();
            } finally {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (email, password) => {
        try {
            const result = await authService.login(email, password);
            if (result.success) {
                // Update state with the returned data
                setToken(result.token);
                setUser(result.user);
                setIsAuthenticated(true);
                return { success: true };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const signup = async (email, password, name) => {
        try {
            const result = await authService.signup(email, password, name);
            if (result.success) {
                setToken(result.token);
                setUser(result.user);
                setIsAuthenticated(true);
                return { success: true };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        // Optimistically clear UI state first
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        try {
            await authService.logout();
        } catch (error) {
            // ignore network errors on logout
        } finally {
            authService.clearAuth();
        }
    };

    const value = {
        user,
        token,
        isAuthenticated,
        loading,
        login,
        signup,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
