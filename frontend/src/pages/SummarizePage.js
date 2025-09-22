import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { FileText, Sparkles, Download, Copy, CheckCircle } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const SummarizePage = () => {
    const { isAuthenticated } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [summaryMode, setSummaryMode] = useState('full');
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            loadDocuments();
        }
    }, [isAuthenticated]);

    const loadDocuments = async () => {
        try {
            const data = await apiService.getDocuments();
            setDocuments(data.documents || []);
        } catch (error) {
            console.error('Failed to load documents:', error);
            toast.error('Failed to load documents');
        }
    };

    const handleSummarize = async () => {
        if (!selectedDocument) {
            toast.error('Please select a document first');
            return;
        }

        setLoading(true);
        try {
            const result = await apiService.summarize(selectedDocument.id, null, summaryMode);
            setSummary(result.result?.summary || '');
            toast.success('Summary generated successfully');
        } catch (error) {
            toast.error(`Failed to generate summary: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopySummary = async () => {
        try {
            await navigator.clipboard.writeText(summary);
            setCopied(true);
            toast.success('Summary copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast.error('Failed to copy summary');
        }
    };

    const handleDownloadSummary = () => {
        const blob = new Blob([summary], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedDocument?.filename || 'summary'}_summary.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
                    <p className="text-gray-600 mb-6">Please sign in to access the summarize feature.</p>
                    <a href="/auth" className="btn-primary">Sign In</a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900">Summarize Documents</h1>
                        <p className="text-gray-600 mt-2">Generate AI-powered summaries of your documents</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Document Selection */}
                    <div className="lg:col-span-1">
                        <div className="card">
                            <h2 className="text-xl font-semibold text-gray-900 mb-6">Select Document</h2>

                            {documents.length > 0 ? (
                                <div className="space-y-3">
                                    {documents.map((doc) => (
                                        <div
                                            key={doc.id}
                                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedDocument?.id === doc.id
                                                ? 'border-primary bg-primary/5'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            onClick={() => setSelectedDocument(doc)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-5 h-5 text-gray-500" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">
                                                        {doc.filename}
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {new Date(doc.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                    <p className="text-gray-500 mb-4">No documents found</p>
                                    <a href="/upload" className="btn-primary">
                                        Upload Documents
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary Options and Results */}
                    <div className="lg:col-span-2">
                        <div className="card">
                            <h2 className="text-xl font-semibold text-gray-900 mb-6">Summary Options</h2>

                            {selectedDocument ? (
                                <div className="space-y-6">
                                    {/* Summary Mode Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-3">
                                            Summary Style
                                        </label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => setSummaryMode('concise')}
                                                className={`p-4 rounded-lg border text-left transition-colors ${summaryMode === 'concise'
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <h3 className="font-medium text-gray-900 mb-2">Concise</h3>
                                                <p className="text-sm text-gray-600">
                                                    Brief summary with key points for quick review
                                                </p>
                                            </button>
                                            <button
                                                onClick={() => setSummaryMode('detailed')}
                                                className={`p-4 rounded-lg border text-left transition-colors ${summaryMode === 'detailed'
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <h3 className="font-medium text-gray-900 mb-2">Detailed</h3>
                                                <p className="text-sm text-gray-600">
                                                    Comprehensive summary with more context
                                                </p>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Generate Button */}
                                    <button
                                        onClick={handleSummarize}
                                        disabled={loading}
                                        className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <>
                                                <LoadingSpinner size="small" />
                                                Generating Summary...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-5 h-5" />
                                                Generate Summary
                                            </>
                                        )}
                                    </button>

                                    {/* Summary Results */}
                                    {summary && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-semibold text-gray-900">Generated Summary</h3>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleCopySummary}
                                                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                                        title="Copy summary"
                                                    >
                                                        {copied ? (
                                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                                        ) : (
                                                            <Copy className="w-4 h-4 text-gray-600" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={handleDownloadSummary}
                                                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                                        title="Download summary"
                                                    >
                                                        <Download className="w-4 h-4 text-gray-600" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="bg-gray-50 rounded-lg p-6">
                                                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                                                    {summary}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        No document selected
                                    </h3>
                                    <p className="text-gray-500">
                                        Select a document from the list to generate a summary
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tips Section */}
                <div className="mt-12">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Tips for Better Summaries</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <span className="text-2xl">📝</span>
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Clear Content</h3>
                                <p className="text-sm text-gray-600">
                                    Well-structured documents produce better summaries
                                </p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <span className="text-2xl">⚡</span>
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Choose Style</h3>
                                <p className="text-sm text-gray-600">
                                    Select concise for quick review or detailed for comprehensive understanding
                                </p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <span className="text-2xl">🔄</span>
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Regenerate</h3>
                                <p className="text-sm text-gray-600">
                                    Try different styles to find what works best for your needs
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SummarizePage;
