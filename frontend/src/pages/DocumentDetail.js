import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiService } from '../services/apiService';
import LoadingSpinner from '../components/LoadingSpinner';
import { File } from 'lucide-react';
import { apiClient } from '../services/authService';

const DocumentDetail = () => {
    const { id } = useParams();
    const [doc, setDoc] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const d = await apiService.getDocument(id);
                setDoc(d);
                const j = await apiService.getDocumentJobs(id);
                setJobs(j);
            } catch (e) {
                // leave empty state
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString();
    };

    const loadPreview = async () => {
        if (!id) return;
        setPreviewLoading(true);
        setPreviewError('');
        try {
            const response = await apiClient.get(`/documents/download/${id}`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: doc?.mime_type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            if (previewUrl) {
                try { URL.revokeObjectURL(previewUrl); } catch (_) { /* ignore */ }
            }
            setPreviewUrl(url);
        } catch (e) {
            setPreviewError('Failed to load preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const closePreview = () => {
        if (previewUrl) {
            try { URL.revokeObjectURL(previewUrl); } catch (_) { /* ignore */ }
        }
        setPreviewUrl('');
        setPreviewError('');
    };

    const handleDownload = async () => {
        if (!id) return;
        try {
            const response = await apiClient.get(`/documents/download/${id}`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: doc?.mime_type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc?.original_name || doc?.filename || `document-${id}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) {
            // ignore
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="large" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 mt-15">
            <div className="max-w-5xl mx-auto px-4">
                <div className="flex items-center gap-3 mb-6">
                    <File className="w-8 h-8 text-gray-700" />
                    <h1 className="text-3xl font-bold text-gray-900">Document #{doc?.id}</h1>
                </div>

                <div className="card mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                        <p><span className="font-medium">Name:</span> {doc?.original_name || doc?.filename}</p>
                        <p><span className="font-medium">MIME:</span> {doc?.mime_type}</p>
                        <p><span className="font-medium">Size:</span> {doc?.size_bytes} bytes</p>
                        <p><span className="font-medium">Created:</span> {formatDate(doc?.created_at)}</p>
                        {doc?.language && <p><span className="font-medium">Language:</span> {doc.language}</p>}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                        <button
                            onClick={previewUrl ? closePreview : loadPreview}
                            className={`${previewUrl ? 'bg-red-600 hover:bg-red-700 text-white' : 'btn-secondary'} px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                            disabled={previewLoading}
                        >
                            {previewLoading ? 'Loading…' : (previewUrl ? 'Close Preview' : 'Preview')}
                        </button>
                        <button onClick={handleDownload} className="btn-primary">Download</button>
                    </div>
                    {previewError && <p className="text-sm text-red-600 mt-2">{previewError}</p>}
                    {previewUrl && (
                        <div className="mt-4">
                            {doc?.mime_type?.startsWith('audio/') ? (
                                <audio controls className="w-full">
                                    <source src={previewUrl} type={doc.mime_type} />
                                    Your browser does not support the audio element.
                                </audio>
                            ) : doc?.mime_type?.startsWith('video/') ? (
                                <video controls className="w-full max-h-[70vh] rounded">
                                    <source src={previewUrl} type={doc.mime_type} />
                                    Your browser does not support the video tag.
                                </video>
                            ) : (doc?.mime_type?.includes('pdf')) ? (
                                <iframe title="Document preview" src={previewUrl} className="w-full h-[70vh] rounded border" />
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-900">Processing History</h2>
                        <Link to={`/process`} className="text-primary hover:text-primary-600">Process This Document</Link>
                    </div>
                    {jobs.length ? (
                        <div className="divide-y">
                            {jobs.map(j => (
                                <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded">
                                    <div>
                                        <p className="font-medium text-gray-900">{j.type.charAt(0).toUpperCase() + j.type.slice(1)} Process #{j.id}</p>
                                        <p className="text-xs text-gray-500">{formatDate(j.created_at)} → {j.finished_at ? formatDate(j.finished_at) : 'In Progress'}</p>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full ${j.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        j.status === 'failed' ? 'bg-red-100 text-red-700' :
                                            j.status === 'running' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-700'
                                        }`}>
                                        {j.status === 'completed' ? 'Completed' :
                                            j.status === 'failed' ? 'Failed' :
                                                j.status === 'running' ? 'Processing' :
                                                    j.status}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-gray-500 mb-4">No processing history yet for this document.</p>
                            <Link to={`/process`} className="btn-primary">Start Processing</Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DocumentDetail;
