import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, User, Mail, Lock } from 'lucide-react';

const AuthPage = () => {
    const { login, signup } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('signin');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Sign in form state
    const [signInData, setSignInData] = useState({
        email: '',
        password: ''
    });

    // Sign up form state
    const [signUpData, setSignUpData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    const handleSignIn = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            const result = await login(signInData.email, signInData.password);
            if (result.success) {
                toast.success('Welcome back!');
                navigate('/dashboard');
            } else {
                const msg = result.error || 'Invalid credentials';
                setErrorMsg(msg);
            }
        } catch (error) {
            setErrorMsg('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        if (signUpData.password !== signUpData.confirmPassword) {
            setErrorMsg('Passwords do not match');
            setLoading(false);
            return;
        }

        if (signUpData.password.length < 6) {
            setErrorMsg('Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        try {
            const result = await signup(signUpData.email, signUpData.password, signUpData.name);
            if (result.success) {
                toast.success('Account created successfully!');
                navigate('/dashboard');
            } else {
                setErrorMsg(result.error || 'Signup failed');
            }
        } catch (error) {
            setErrorMsg('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const togglePasswordVisibility = () => setShowPassword(!showPassword);
    const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(!showConfirmPassword);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl font-bold text-white">I</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">IntelliLearn</h1>
                    <p className="text-gray-600 mt-2">Your AI-powered learning companion</p>
                </div>

                {/* Auth Card */}
                <div className="card">
                    {/* Tabs */}
                    <div className="flex mb-6">
                        <button onClick={() => { setActiveTab('signin'); setErrorMsg(''); }} className={`flex-1 py-3 px-4 text-center font-medium rounded-lg transition-colors ${activeTab === 'signin' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900'}`}>Sign In</button>
                        <button onClick={() => { setActiveTab('signup'); setErrorMsg(''); }} className={`flex-1 py-3 px-4 text-center font-medium rounded-lg transition-colors ${activeTab === 'signup' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900'}`}>Sign Up</button>
                    </div>

                    {errorMsg && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                            {errorMsg}
                        </div>
                    )}

                    {/* Sign In Form */}
                    {activeTab === 'signin' && (
                        <form onSubmit={handleSignIn} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                    <input type="email" value={signInData.email} onChange={(e) => setSignInData({ ...signInData, email: e.target.value })} className="input-field pl-10" placeholder="Enter your email" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                    <input type={showPassword ? 'text' : 'password'} value={signInData.password} onChange={(e) => setSignInData({ ...signInData, password: e.target.value })} className="input-field pl-10 pr-10" placeholder="Enter your password" required />
                                    <button type="button" onClick={togglePasswordVisibility} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                                </div>
                                <div className="text-right mt-2">
                                    <Link to="/auth/reset" className="text-sm text-primary hover:underline">Forgot password?</Link>
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Signing In...' : 'Sign In'}</button>
                        </form>
                    )}

                    {/* Sign Up Form */}
                    {activeTab === 'signup' && (
                        <form onSubmit={handleSignUp} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                    <input type="text" value={signUpData.name} onChange={(e) => setSignUpData({ ...signUpData, name: e.target.value })} className="input-field pl-10" placeholder="Enter your full name" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                    <input type="email" value={signUpData.email} onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })} className="input-field pl-10" placeholder="Enter your email" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                    <input type={showPassword ? 'text' : 'password'} value={signUpData.password} onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })} className="input-field pl-10 pr-10" placeholder="Create a password" required minLength={6} />
                                    <button type="button" onClick={togglePasswordVisibility} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                    <input type={showConfirmPassword ? 'text' : 'password'} value={signUpData.confirmPassword} onChange={(e) => setSignUpData({ ...signUpData, confirmPassword: e.target.value })} className="input-field pl-10 pr-10" placeholder="Confirm your password" required />
                                    <button type="button" onClick={toggleConfirmPasswordVisibility} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Creating Account...' : 'Create Account'}</button>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="text-center mt-8 text-sm text-gray-600">
                    <p>By continuing, you agree to our Terms of Service and Privacy Policy</p>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
