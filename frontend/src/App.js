import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import TextProcessPage from './pages/TextProcessPage';
import AuthPage from './pages/AuthPage';
import LoadingSpinner from './components/LoadingSpinner';
import DocumentDetail from './pages/DocumentDetail';
import JobDetail from './pages/JobDetail';
import StudyAidsPage from './pages/StudyAidsPage';
import SchedulePage from './pages/SchedulePage';
import ProcessPage from './pages/ProcessPage';
import Footer from './components/Footer';

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return <LoadingSpinner />;
    if (!isAuthenticated) return <Navigate to="/auth" replace />;
    return children;
};

const PublicRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return <LoadingSpinner />;
    if (isAuthenticated) return <Navigate to="/dashboard" replace />;
    return children;
};

function App() {
    return (
        <AuthProvider>
            <Router>
                <Header />
                <div className="pt-20">
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
                        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                        <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                        <Route path="/process" element={<ProtectedRoute><ProcessPage /></ProtectedRoute>} />
                        <Route path="/process/:id" element={<ProtectedRoute><ProcessPage /></ProtectedRoute>} />
                        <Route path="/text-process" element={<ProtectedRoute><TextProcessPage /></ProtectedRoute>} />
                        <Route path="/study-aids" element={<ProtectedRoute><StudyAidsPage /></ProtectedRoute>} />
                        <Route path="/schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
                        <Route path="/document/:id" element={<ProtectedRoute><DocumentDetail /></ProtectedRoute>} />
                        <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetail /></ProtectedRoute>} />
                        <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
                <Footer />
            </Router>
        </AuthProvider>
    );
}

export default App;
