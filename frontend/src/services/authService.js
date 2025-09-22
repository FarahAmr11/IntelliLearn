import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001/api';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('il_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token expiration
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            authService.clearAuth();
            window.location.href = '/auth';
        }
        return Promise.reject(error);
    }
);

export const authService = {
    async login(email, password) {
        try {
            const response = await apiClient.post('/auth/login', { email, password });
            const { token, user } = response.data;

            // Save auth data
            localStorage.setItem('il_token', token);
            localStorage.setItem('intellilearn-user', JSON.stringify(user));

            return { success: true, token, user };
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Login failed';
            return { success: false, error: errorMessage };
        }
    },

    async signup(email, password, name) {
        try {
            const response = await apiClient.post('/auth/signup', { email, password, name });
            const { token, user } = response.data;

            // Save auth data
            localStorage.setItem('il_token', token);
            localStorage.setItem('intellilearn-user', JSON.stringify(user));

            return { success: true, token, user };
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Signup failed';
            return { success: false, error: errorMessage };
        }
    },

    async logout() {
        try {
            await apiClient.post('/auth/logout');
        } catch (error) {
            console.warn('Logout request failed:', error);
        } finally {
            authService.clearAuth();
        }
    },

    async validateToken(token) {
        try {
            if (!token) {
                console.log('No token provided for validation');
                return false;
            }

            // Decode token to check expiration
            const payload = this.decodeToken(token);
            if (!payload) {
                console.log('Failed to decode token');
                return false;
            }

            if (this.isTokenExpired(payload)) {
                console.log('Token expired:', {
                    exp: payload.exp,
                    currentTime: Math.floor(Date.now() / 1000),
                    expReadable: new Date(payload.exp * 1000).toISOString()
                });
                return false;
            }

            console.log('Token is valid:', {
                exp: payload.exp,
                currentTime: Math.floor(Date.now() / 1000),
                expReadable: new Date(payload.exp * 1000).toISOString()
            });
            return true;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    },

    decodeToken(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('Error decoding token:', error);
            return null;
        }
    },

    isTokenExpired(payload) {
        if (!payload || !payload.exp) return true;
        const currentTime = Math.floor(Date.now() / 1000);
        return payload.exp < currentTime;
    },

    clearAuth() {
        localStorage.removeItem('il_token');
        localStorage.removeItem('intellilearn-user');
    },

    // Check if token is close to expiration (within 5 minutes)
    isTokenNearExpiry(token) {
        try {
            const payload = this.decodeToken(token);
            if (!payload || !payload.exp) return true;

            const currentTime = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = payload.exp - currentTime;

            // If token expires within 5 minutes, consider it near expiry
            return timeUntilExpiry < 300; // 5 minutes
        } catch (error) {
            return true;
        }
    }
};

export { apiClient };
