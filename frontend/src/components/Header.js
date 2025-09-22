import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, LogOut, Menu, X } from 'lucide-react';

const Header = () => {
    const { user, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [logoutProcessing, setLogoutProcessing] = useState(false);

    const handleLogout = async () => {
        setLogoutProcessing(true);
        setShowLogoutConfirm(false);
        setShowUserMenu(false);
        try {
            await logout();
            navigate('/auth');
        } finally {
            setLogoutProcessing(false);
        }
    };

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleUserMenu = () => setShowUserMenu(!showUserMenu);

    const navLinkClass = ({ isActive }) => `transition-colors ${isActive ? 'text-primary font-medium' : 'text-gray-600 hover:text-gray-900'}`;
    const mobileNavLinkClass = ({ isActive }) => `px-2 py-1 transition-colors ${isActive ? 'text-primary font-medium' : 'text-gray-600 hover:text-gray-900'}`;

    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex items-center justify-between h-18 p-4">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-3 text-gray-900 no-underline">
                        <span className="w-9 h-9 rounded-lg bg-primary text-white font-bold flex items-center justify-center shadow-sm">I</span>
                        <span className="font-bold text-lg">IntelliLearn</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-6">
                        <NavLink to="/" className={navLinkClass}>Home</NavLink>
                        <NavLink to="/upload" className={navLinkClass}>Upload</NavLink>
                        <NavLink to="/process" className={navLinkClass}>Process</NavLink>
                        <NavLink to="/study-aids" className={navLinkClass}>Study Tools</NavLink>
                        <NavLink to="/schedule" className={navLinkClass}>Schedule</NavLink>
                        <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
                    </nav>

                    {/* Right controls */}
                    <div className="flex items-center gap-3">
                        {isAuthenticated ? (
                            <div className="relative">
                                <button onClick={toggleUserMenu} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors" aria-haspopup="menu" aria-expanded={showUserMenu} title="Account">
                                    <User size={18} />
                                    <span>{user?.email || 'Account'}</span>
                                </button>

                                {showUserMenu && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                        <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">{user?.email}</div>
                                        <button onClick={() => { setShowLogoutConfirm(true); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                                            <LogOut size={16} />
                                            Sign Out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <NavLink to="/auth" className="btn-primary">Sign In</NavLink>
                        )}

                        {/* Mobile Menu Button */}
                        <button onClick={toggleMenu} className="md:hidden p-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors" aria-label="Toggle menu">
                            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {isMenuOpen && (
                    <div className="md:hidden border-t border-gray-200 py-4">
                        <nav className="flex flex-col gap-4">
                            <NavLink to="/" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>Home</NavLink>
                            <NavLink to="/process" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>Process</NavLink>
                            <NavLink to="/upload" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>Upload</NavLink>
                            <NavLink to="/study-aids" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>Study Tools</NavLink>
                            <NavLink to="/schedule" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>Schedule</NavLink>
                            <NavLink to="/dashboard" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>Dashboard</NavLink>
                        </nav>
                    </div>
                )}
            </div>

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowLogoutConfirm(false)}></div>
                    <div role="dialog" aria-modal="true" className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">Sign out</h3>
                        <p className="text-sm text-gray-600 mb-5 text-center">Are you sure you want to sign out of your account?</p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setShowLogoutConfirm(false)} className="btn-secondary" disabled={logoutProcessing}>Cancel</button>
                            <button onClick={handleLogout} className="btn-primary" disabled={logoutProcessing}>{logoutProcessing ? 'Signing Out...' : 'Sign Out'}</button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;
