import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { FileText, Clock, CheckCircle, TrendingUp, Upload, File, Languages, Sparkles } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Dashboard = () => {
    const { user } = useAuth();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const didFetchRef = useRef(false);

    useEffect(() => {
        if (didFetchRef.current) return;
        didFetchRef.current = true;
        loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadDashboard = async () => {
        try {
            try {
                await apiService.healthCheck();
            } catch (healthError) {
                toast.error('Backend server is not accessible. Please ensure the backend is running on port 5001.');
                setLoading(false);
                return;
            }

            const data = await apiService.getDashboardSummary();
            setDashboardData(data);
        } catch (error) {
            toast.error('Failed to load dashboard data');
            setDashboardData({
                counts: { documents: 0, jobs: 0, jobs_by_type: { summarize: 0, transcribe: 0, translate: 0, composite: 0, notes: 0, quiz: 0 } },
                recent_documents: [],
                recent_activity: []
            });
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString();
    };

    const jobsByType = dashboardData?.counts?.jobs_by_type || {};
    const [searchQuery, setSearchQuery] = useState('');
    const [searchScope, setSearchScope] = useState('documents'); // 'documents' | 'processes'
    const [jobTypeFilter, setJobTypeFilter] = useState(''); // summarize | translate | notes | quiz

    const toTitleCase = (str) => (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const statusBadgeClass = (status) => {
        const s = (status || '').toLowerCase();
        if (s === 'completed' || s === 'success') return 'bg-green-100 text-green-700';
        if (s === 'failed' || s === 'error') return 'bg-red-100 text-red-700';
        if (s === 'running' || s === 'processing' || s === 'queued') return 'bg-blue-100 text-blue-700';
        return 'bg-gray-100 text-gray-700';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="large" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-6xl mx-auto px-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-gray-600 mt-2">Welcome back, {user?.name || user?.email}!</p>
                    </div>
                </div>

                {/* Search & Scope */}
                <div className="card mb-8">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSearchScope('documents')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${searchScope === 'documents' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}>Documents</button>
                            <button onClick={() => setSearchScope('processes')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${searchScope === 'processes' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}>Processes</button>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search ${searchScope === 'documents' ? 'documents by name, type, or ID' : 'processes by type or ID'}`}
                            className="input-field w-full sm:max-w-md"
                        />
                    </div>
                    {jobTypeFilter && searchScope === 'processes' && (
                        <p className="text-xs text-gray-600 mt-2">Filtering processes by type: <span className="font-medium">{toTitleCase(jobTypeFilter)}</span> <button className="ml-2 text-primary" onClick={() => setJobTypeFilter('')}>Clear</button></p>
                    )}
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="card">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Documents</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {dashboardData?.counts?.documents || 0}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <FileText className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </div>

                    <div className="card cursor-pointer" onClick={() => { setSearchScope('processes'); setJobTypeFilter(''); setSearchQuery(''); }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Processes</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {dashboardData?.counts?.jobs || 0}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                                <Clock className="w-6 h-6 text-yellow-600" />
                            </div>
                        </div>
                    </div>

                    <div className="card cursor-pointer" onClick={() => { setSearchScope('processes'); setJobTypeFilter('summarize'); }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Summaries Run</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {jobsByType.summarize || 0}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-indigo-600" />
                            </div>
                        </div>
                    </div>

                    <div className="card cursor-pointer" onClick={() => { setSearchScope('processes'); setJobTypeFilter('translate'); }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Translations Run</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {jobsByType.translate || 0}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                <Languages className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Extra KPIs for Notes and Quizzes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="card cursor-pointer" onClick={() => { setSearchScope('processes'); setJobTypeFilter('notes'); }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Notes Generated</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {jobsByType.notes || 0}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </div>

                    <div className="card cursor-pointer" onClick={() => { setSearchScope('processes'); setJobTypeFilter('quiz'); }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Quizzes Created</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {jobsByType.quiz || 0}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-rose-100 rounded-lg flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-rose-600" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Recent Documents */}
                    {(searchScope !== 'processes' || (!jobTypeFilter && !searchQuery)) && (
                        <div className="card">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold text-gray-900">Recent Documents</h2>
                                <Link to="/upload" className="text-primary hover:text-primary-600 font-medium">
                                    Upload More
                                </Link>
                            </div>

                            <div className="space-y-4">
                                {dashboardData?.recent_documents?.filter((doc) => {
                                    if (searchScope !== 'documents') return true;
                                    const q = searchQuery.trim().toLowerCase();
                                    if (!q) return true;
                                    const name = (doc.name || doc.original_name || '').toLowerCase();
                                    const type = (doc.mime_type || '').toLowerCase();
                                    const idStr = String(doc.id);
                                    return name.includes(q) || type.includes(q) || idStr.includes(q);
                                }).length > 0 ? (
                                    dashboardData.recent_documents.filter((doc) => {
                                        if (searchScope !== 'documents') return true;
                                        const q = searchQuery.trim().toLowerCase();
                                        if (!q) return true;
                                        const name = (doc.name || doc.original_name || '').toLowerCase();
                                        const type = (doc.mime_type || '').toLowerCase();
                                        const idStr = String(doc.id);
                                        return name.includes(q) || type.includes(q) || idStr.includes(q);
                                    }).map((doc) => (
                                        <Link key={doc.id} to={`/documents/${doc.id}`} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                                <File className="w-5 h-5 text-gray-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">{doc.name || doc.original_name || `Document #${doc.id}`}</p>
                                                <p className="text-sm text-gray-500">{doc.mime_type} • {formatDate(doc.created_at)}</p>
                                            </div>
                                        </Link>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                        <p>{searchScope === 'documents' && searchQuery ? 'No matching documents' : 'No files uploaded yet'}</p>
                                        <p className="text-sm">{searchScope === 'documents' && searchQuery ? 'Try a different search' : 'Upload your first document to get started'}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-gray-900">Recent Processes</h2>
                            <Link to="/dashboard" className="text-primary hover:text-primary-600 font-medium">
                                Refresh
                            </Link>
                        </div>

                        <div className="space-y-4">
                            {dashboardData?.recent_activity?.filter((activity) => {
                                const typeOk = jobTypeFilter ? ((activity.type || '').toLowerCase() === jobTypeFilter) : true;
                                if (searchScope !== 'processes') return typeOk;
                                const q = searchQuery.trim().toLowerCase();
                                if (!q) return typeOk;
                                const idStr = String(activity.id);
                                const typeStr = (activity.type || '').toLowerCase();
                                const statusStr = (activity.status || '').toLowerCase();
                                const docStr = activity.document_id ? String(activity.document_id) : '';
                                return typeOk && (idStr.includes(q) || typeStr.includes(q) || statusStr.includes(q) || docStr.includes(q));
                            }).length > 0 ? (
                                dashboardData.recent_activity.filter((activity) => {
                                    const typeOk = jobTypeFilter ? ((activity.type || '').toLowerCase() === jobTypeFilter) : true;
                                    if (searchScope !== 'processes') return typeOk;
                                    const q = searchQuery.trim().toLowerCase();
                                    if (!q) return typeOk;
                                    const idStr = String(activity.id);
                                    const typeStr = (activity.type || '').toLowerCase();
                                    const statusStr = (activity.status || '').toLowerCase();
                                    const docStr = activity.document_id ? String(activity.document_id) : '';
                                    return typeOk && (idStr.includes(q) || typeStr.includes(q) || statusStr.includes(q) || docStr.includes(q));
                                }).map((activity) => (
                                    <Link key={activity.id} to={`/jobs/${activity.id}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm text-gray-900 font-medium">Process #{activity.id} • {toTitleCase(activity.type || 'process')}</p>
                                                <span className={`text-2xs px-2 py-0.5 rounded-full ${statusBadgeClass(activity.status)}`}>{toTitleCase(activity.status)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">{formatDate(activity.created_at)} {activity.document_id ? `• Document #${activity.document_id}` : '• Text-only'}</p>
                                        </div>
                                    </Link>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                    <p>{(searchScope === 'processes' && (searchQuery || jobTypeFilter)) ? 'No matching processes' : 'No recent processes'}</p>
                                    <p className="text-sm">{(searchScope === 'processes' && (searchQuery || jobTypeFilter)) ? 'Try a different search or clear filters' : 'Your processing activity will appear here'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
