import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Clock, Target, Brain } from 'lucide-react';
import { apiService } from '../services/apiService';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { LANGUAGE_OPTIONS } from '../utils/languageUtils';

const ProcessPage = () => {
    const { id } = useParams();
    const [documents, setDocuments] = useState([]);
    const [docSearch, setDocSearch] = useState('');
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [loading, setLoading] = useState(true);
    // Per-action processing flags so actions can run concurrently
    const [processingMap, setProcessingMap] = useState({ transcribe: false, summary: false, translate: false });
    const [summaryMode, setSummaryMode] = useState('concise');
    const [translationParams, setTranslationParams] = useState({ sourceLang: '', targetLang: 'en' });
    const [results, setResults] = useState({ transcription: null, summary: null, translation: null });
    const [lastSummaryModeRun, setLastSummaryModeRun] = useState(null);
    const [lastTranslateRun, setLastTranslateRun] = useState(null); // { targetLang, sourceLang }
    const [activeTab, setActiveTab] = useState('summary');
    const [showMeta, setShowMeta] = useState(false);
    const [rawViewMode, setRawViewMode] = useState('raw'); // 'raw' | 'preview'
    const [showRawPreview, setShowRawPreview] = useState(false);

    const didLoadDocsRef = useRef(false);
    const prevDocIdRef = useRef(null);
    // Avoid prefetching jobs to reduce API calls; only fetch on View Details page

    useEffect(() => {
        const loadDocs = async () => {
            try {
                const data = await apiService.getDocuments();
                const list = Array.isArray(data) ? data : (data.documents || []);
                setDocuments(list);
                if (id && !selectedDoc) {
                    const match = list.find(d => String(d.id) === String(id));
                    if (match) setSelectedDoc(match);
                }
            } catch (e) {
                toast.error('Failed to load documents');
            } finally {
                setLoading(false);
            }
        };
        if (didLoadDocsRef.current) return;
        didLoadDocsRef.current = true;
        loadDocs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Ensure full document details (including text_content) after selection
    useEffect(() => {
        const loadDocDetails = async () => {
            if (!selectedDoc) return;
            // If text_content not present, fetch full document
            if (selectedDoc.text_content === undefined) {
                try {
                    const full = await apiService.getDocument(selectedDoc.id);
                    setSelectedDoc(prev => ({ ...prev, ...full }));
                } catch (_) { /* ignore */ }
            }
        };
        loadDocDetails();
    }, [selectedDoc?.id]);

    // Reset results when switching to a different document
    useEffect(() => {
        const currentId = selectedDoc?.id ?? null;
        if (currentId && prevDocIdRef.current !== currentId) {
            setResults({ transcription: null, summary: null, translation: null });
            setLastSummaryModeRun(null);
            setLastTranslateRun(null);
            setProcessingMap({ transcribe: false, summary: false, translate: false });
            prevDocIdRef.current = currentId;
        }
    }, [selectedDoc?.id]);

    // For audio/video files, if raw text exists, treat it as the transcription and disable raw preview
    useEffect(() => {
        const mime = selectedDoc?.mime_type || '';
        const isAv = mime.startsWith('audio/') || mime.startsWith('video/');
        if (!selectedDoc || !isAv) return;
        if (selectedDoc.text_content && !results.transcription) {
            setResults(prev => ({ ...prev, transcription: selectedDoc.text_content }));
        }
    }, [selectedDoc?.id, selectedDoc?.mime_type, selectedDoc?.text_content]);

    // Do not prefetch jobs or job details here

    const runAction = async (action, force = false) => {
        if (!selectedDoc) return;
        setProcessingMap(prev => ({ ...prev, [action]: true }));
        try {
            if (action === 'transcribe') {
                const res = await apiService.transcribe(selectedDoc.id, force);
                const txt = res.transcription || (res.result?.steps?.find(s => s.name === 'transcribe')?.output?.transcription) || null;
                if (txt) setResults(prev => ({ ...prev, transcription: txt }));

                if (res.status === 'existing') {
                    toast.success('Loaded existing transcription');
                } else {
                    toast.success('Transcription completed');
                }
            } else if (action === 'summary') {
                const sourceText = results.transcription || selectedDoc.text_content || null;
                if (!sourceText) {
                    toast.error('No text available. Transcribe first or upload a text document.');
                    setProcessingMap(prev => ({ ...prev, [action]: false }));
                    return;
                }
                const res = await apiService.summarize(selectedDoc.id, sourceText, summaryMode, force);
                const text = res.summary || (res.result?.steps?.find(s => s.name === 'summarize')?.output?.summary) || null;
                if (text) setResults(prev => ({ ...prev, summary: text }));
                setLastSummaryModeRun(summaryMode);

                if (res.status === 'existing') {
                    toast.success('Loaded existing summary');
                } else {
                    toast.success('Summary completed');
                }
            } else if (action === 'translate') {
                const sourceText = results.summary || results.transcription || selectedDoc.text_content || null;
                if (!sourceText) {
                    toast.error('No text available. Transcribe or summarize first.');
                    setProcessingMap(prev => ({ ...prev, [action]: false }));
                    return;
                }
                const res = await apiService.translate(selectedDoc.id, sourceText, translationParams.targetLang, translationParams.sourceLang || null, force);
                const text = res.translation || (res.result?.steps?.find(s => s.name === 'translate')?.output?.translation) || null;
                if (text) setResults(prev => ({ ...prev, translation: text }));
                setLastTranslateRun({ targetLang: translationParams.targetLang, sourceLang: translationParams.sourceLang || '' });

                if (res.status === 'existing') {
                    toast.success('Loaded existing translation');
                } else {
                    toast.success('Translation completed');
                }
            }
            // Do not fetch jobs here; View Details page will load them on demand
        } catch (e) {
            toast.error(`Failed to ${action}`);
        } finally {
            setProcessingMap(prev => ({ ...prev, [action]: false }));
        }
    };

    const typeBadge = (mime) => {
        if (!mime) return 'file';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('image/')) return 'image';
        if (mime.includes('pdf')) return 'pdf';
        if (mime.startsWith('text/')) return 'text';
        return 'document';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="large" />
            </div>
        );
    }

    return (
        <>
            <div className="bg-gray-50 py-12">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-4xl font-bold text-gray-900">Process</h1>
                            <p className="text-gray-600 mt-2">Summarize, translate and transcribe your documents</p>
                            <p className="text-sm text-gray-500 mt-1">Tip: Select a document on the left. For audio/video, transcribe first, then summarize/translate.</p>
                        </div>
                        <Link to="/upload" className="btn-primary" title="Upload a new document or audio/video">Upload New</Link>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-1">
                            <div className="card">
                                <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Documents</h2>
                                <div className="mb-4">
                                    <input
                                        type="text"
                                        value={docSearch}
                                        onChange={(e) => setDocSearch(e.target.value)}
                                        placeholder="Search by name..."
                                        className="input-field w-full"
                                    />
                                </div>
                                {documents.length > 0 ? (
                                    <div className="space-y-3">
                                        {documents
                                            .filter(d => {
                                                const q = docSearch.trim().toLowerCase();
                                                if (!q) return true;
                                                const name = (d.original_name || d.filename || '').toLowerCase();
                                                return name.includes(q);
                                            })
                                            .map((doc) => (
                                                <div
                                                    key={doc.id}
                                                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedDoc?.id === doc.id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                                                    onClick={() => setSelectedDoc(doc)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 truncate" title={doc.original_name || doc.filename}>{doc.original_name || doc.filename || `Document #${doc.id}`}</p>
                                                            <p className="text-sm text-gray-500 truncate" title={`${doc.mime_type || ''} • ${new Date(doc.created_at).toLocaleDateString()}`}>
                                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 mr-2 text-2xs uppercase">{typeBadge(doc.mime_type)}</span>
                                                                {doc.mime_type} • {new Date(doc.created_at).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                        <p className="text-gray-500 mb-4">No documents found</p>
                                        <Link to="/upload" className="btn-primary inline-block">Upload Documents</Link>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-3">
                            <div className="card">
                                {!selectedDoc ? (
                                    <div className="text-center py-12 text-gray-500">Select a document to start processing</div>
                                ) : (
                                    <div className="space-y-8">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="text-xl font-semibold text-gray-900 truncate" title={selectedDoc.original_name || selectedDoc.filename}>{selectedDoc.original_name || selectedDoc.filename}</h3>
                                                <p className="text-sm text-gray-600">
                                                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 mr-2 text-2xs uppercase">{typeBadge(selectedDoc.mime_type)}</span>
                                                    <span className="truncate inline-block align-middle" title={`${selectedDoc.mime_type} • ${selectedDoc.size_bytes} bytes`}>
                                                        {selectedDoc.mime_type} • {selectedDoc.size_bytes} bytes
                                                    </span>
                                                </p>
                                                <p className="text-xs text-gray-500">Created {new Date(selectedDoc.created_at).toLocaleString()}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setShowMeta(true)} className="btn-secondary" title="Show full metadata">Metadata</button>
                                                <Link to={`/documents/${selectedDoc.id}`} className="btn-secondary">View Details</Link>
                                            </div>
                                        </div>

                                        {/* Tabs */}
                                        <div className="flex mb-4" title="Choose an action to run on this document">
                                            <button onClick={() => setActiveTab('summary')} className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'summary' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>Summary</button>
                                            <button onClick={() => setActiveTab('transcribe')} className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'transcribe' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>Transcribe</button>
                                            <button onClick={() => setActiveTab('translate')} className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'translate' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>Translate</button>
                                        </div>

                                        {/* Raw Text Section with View Toggle and Preview */}
                                        {selectedDoc.text_content && !(selectedDoc.mime_type && (selectedDoc.mime_type.startsWith('audio/') || selectedDoc.mime_type.startsWith('video/'))) && (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-medium text-gray-900">Source Content</h4>
                                                    <div className="flex items-center gap-2">
                                                        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                                                            <button
                                                                className={`px-3 py-1 text-sm ${rawViewMode === 'raw' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                                                onClick={() => setRawViewMode('raw')}
                                                                title="Show raw text"
                                                            >
                                                                Raw
                                                            </button>
                                                            <button
                                                                className={`px-3 py-1 text-sm ${rawViewMode === 'preview' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                                                onClick={() => setRawViewMode('preview')}
                                                                title="Show formatted preview"
                                                            >
                                                                Preview
                                                            </button>
                                                        </div>
                                                        <button className="btn-secondary" onClick={() => setShowRawPreview(true)} title="Open full preview">
                                                            Open Preview
                                                        </button>
                                                    </div>
                                                </div>
                                                {rawViewMode === 'raw' ? (
                                                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-auto">{selectedDoc.text_content}</div>
                                                ) : (
                                                    <div className="bg-white rounded-lg p-4 text-sm text-gray-800 border border-gray-200 max-h-64 overflow-auto">
                                                        {String(selectedDoc.text_content)
                                                            .split(/\n\n+/)
                                                            .map((block, idx) => (
                                                                <p key={idx} className="mb-3 whitespace-pre-wrap leading-relaxed">
                                                                    {block}
                                                                </p>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Active Tab Content */}
                                        {activeTab === 'summary' && (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-medium text-gray-900">Summarize</p>
                                                    {results.summary && <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">done</span>}
                                                </div>
                                                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 max-w-md">
                                                    <select className="input-field w-full sm:flex-1" value={summaryMode} onChange={(e) => setSummaryMode(e.target.value)}>
                                                        <option value="concise">Concise</option>
                                                        <option value="detailed">Detailed</option>
                                                        <option value="full">Full</option>
                                                    </select>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => runAction('summary', false)} disabled={processingMap.summary || !(selectedDoc.text_content || results.transcription) || (!!results.summary && lastSummaryModeRun === summaryMode)} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" title={(selectedDoc.text_content || results.transcription) ? ((!!results.summary && lastSummaryModeRun === summaryMode) ? 'Already summarized with current settings' : 'Generate summary') : 'No text available. For audio/video, transcribe first.'}>{processingMap.summary ? 'Working...' : ((!!results.summary && lastSummaryModeRun === summaryMode) ? 'Completed' : 'Run Summary')}</button>
                                                        {results.summary && (
                                                            <button onClick={() => runAction('summary', true)} disabled={processingMap.summary} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" title="Force regenerate summary">Force</button>
                                                        )}
                                                    </div>
                                                </div>
                                                {results.summary && (
                                                    <div>
                                                        <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">{results.summary}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {activeTab === 'transcribe' && (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-medium text-gray-900">Transcribe</p>
                                                    {results.transcription && <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">done</span>}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => runAction('transcribe', false)} disabled={processingMap.transcribe || !!results.transcription || !(selectedDoc.mime_type && (selectedDoc.mime_type.startsWith('audio/') || selectedDoc.mime_type.startsWith('video/'))) || (!!selectedDoc.text_content)} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" title={selectedDoc.mime_type && (selectedDoc.mime_type.startsWith('audio/') || selectedDoc.mime_type.startsWith('video/')) ? ((results.transcription || selectedDoc.text_content) ? 'Already transcribed' : 'Convert speech to text') : 'Transcription is only for audio/video files'}>{processingMap.transcribe ? 'Working...' : ((!!results.transcription || !!selectedDoc.text_content) ? 'Completed' : 'Run Transcription')}</button>
                                                    {(results.transcription || selectedDoc.text_content) && (
                                                        <button onClick={() => runAction('transcribe', true)} disabled={processingMap.transcribe} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed" title="Force regenerate transcription">Force</button>
                                                    )}
                                                </div>
                                                {results.transcription && (
                                                    <div>
                                                        <h4 className="font-medium text-gray-900 mb-2">Transcription</h4>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">{results.transcription}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {activeTab === 'translate' && (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-medium text-gray-900">Translate</p>
                                                    {results.translation && <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">done</span>}
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mb-2">
                                                    <div>
                                                        <label className="block text-sm text-gray-700 mb-1">Target Language</label>
                                                        <select className="input-field" value={translationParams.targetLang} onChange={(e) => setTranslationParams(prev => ({ ...prev, targetLang: e.target.value }))}>
                                                            {LANGUAGE_OPTIONS.map(option => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm text-gray-700 mb-1">Source Language</label>
                                                        <select className="input-field" value={translationParams.sourceLang} onChange={(e) => setTranslationParams(prev => ({ ...prev, sourceLang: e.target.value }))}>
                                                            <option value="">Auto</option>
                                                            {LANGUAGE_OPTIONS.map(option => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                                <button onClick={() => runAction('translate')} disabled={
                                                    processingMap.translate ||
                                                    !(results.summary || results.transcription || selectedDoc.text_content) ||
                                                    (
                                                        !!results.translation &&
                                                        lastTranslateRun &&
                                                        lastTranslateRun.targetLang === translationParams.targetLang &&
                                                        (lastTranslateRun.sourceLang || '') === (translationParams.sourceLang || '')
                                                    )
                                                } className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed" title={(results.summary || results.transcription || selectedDoc.text_content) ? (((!!results.translation && lastTranslateRun && lastTranslateRun.targetLang === translationParams.targetLang && (lastTranslateRun.sourceLang || '') === (translationParams.sourceLang || ''))) ? 'Already translated with current settings' : 'Translate content') : 'No text available. Transcribe or summarize first.'}>{processingMap.translate ? 'Working...' : (((!!results.translation && lastTranslateRun && lastTranslateRun.targetLang === translationParams.targetLang && (lastTranslateRun.sourceLang || '') === (translationParams.sourceLang || ''))) ? 'Completed' : 'Run Translation')}</button>
                                                {results.translation && (
                                                    <div>
                                                        <h4 className="font-medium text-gray-900 mb-2">Translation</h4>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">{results.translation}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {!results.transcription && !results.summary && !results.translation && (
                                            <p className="text-gray-500">No results yet. Use the active tab to process this document.</p>
                                        )}
                                        {showMeta && (
                                            <div className="fixed inset-0 z-50 flex items-center justify-center">
                                                <div className="absolute inset-0 bg-black/50" onClick={() => setShowMeta(false)}></div>
                                                <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-6 border border-gray-200">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div>
                                                            <h4 className="text-lg font-semibold text-gray-900">Document Details</h4>
                                                            <p className="text-xs text-gray-500">Full metadata for the selected document</p>
                                                        </div>
                                                        <button onClick={() => setShowMeta(false)} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                        <div className="p-3 rounded-lg bg-gray-50">
                                                            <p className="text-gray-500">Display Name</p>
                                                            <p className="text-gray-900 break-all">{selectedDoc.original_name || selectedDoc.filename || `Document #${selectedDoc.id}`}</p>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-gray-50">
                                                            <p className="text-gray-500">File Type</p>
                                                            <p className="text-gray-900 break-all">
                                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 mr-2 text-2xs uppercase">{typeBadge(selectedDoc.mime_type)}</span>
                                                                {selectedDoc.mime_type || '—'}
                                                            </p>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-gray-50">
                                                            <p className="text-gray-500">Size</p>
                                                            <p className="text-gray-900">{selectedDoc.size_bytes} bytes</p>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-gray-50">
                                                            <p className="text-gray-500">Created At</p>
                                                            <p className="text-gray-900">{new Date(selectedDoc.created_at).toLocaleString()}</p>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-gray-50 md:col-span-2">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <p className="text-gray-500">Document ID</p>
                                                                    <p className="text-gray-900 font-mono text-xs break-all">{selectedDoc.id}</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => { navigator.clipboard.writeText(String(selectedDoc.id)); toast.success('Copied ID'); }}
                                                                    className="btn-secondary"
                                                                >
                                                                    Copy ID
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {selectedDoc.language && (
                                                            <div className="p-3 rounded-lg bg-gray-50">
                                                                <p className="text-gray-500">Language</p>
                                                                <p className="text-gray-900">{selectedDoc.language}</p>
                                                            </div>
                                                        )}
                                                        {(selectedDoc.filename || selectedDoc.original_name) && (
                                                            <div className="p-3 rounded-lg bg-gray-50 md:col-span-2">
                                                                <p className="text-gray-500">Original Filename</p>
                                                                <p className="text-gray-900 break-all">{selectedDoc.original_name || selectedDoc.filename}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="mt-6 flex justify-end gap-2">
                                                        <button onClick={() => setShowMeta(false)} className="btn-secondary">Close</button>
                                                        <Link to={`/documents/${selectedDoc.id}`} className="btn-primary">Open Document</Link>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {showRawPreview && selectedDoc.text_content && (
                                            <div className="fixed inset-0 z-50 flex items-center justify-center">
                                                <div className="absolute inset-0 bg-black/50" onClick={() => setShowRawPreview(false)}></div>
                                                <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 p-6 border border-gray-200">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div>
                                                            <h4 className="text-lg font-semibold text-gray-900">Preview</h4>
                                                            <p className="text-xs text-gray-500">Formatted view of the source content</p>
                                                        </div>
                                                        <button onClick={() => setShowRawPreview(false)} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
                                                    </div>
                                                    <div className="border border-gray-200 rounded-lg p-4 max-h-[70vh] overflow-auto text-sm text-gray-900">
                                                        {rawViewMode === 'raw' ? (
                                                            <div className="whitespace-pre-wrap">{selectedDoc.text_content}</div>
                                                        ) : (
                                                            <div>
                                                                {String(selectedDoc.text_content)
                                                                    .split(/\n\n+/)
                                                                    .map((block, idx) => (
                                                                        <p key={idx} className="mb-3 whitespace-pre-wrap leading-relaxed">
                                                                            {block}
                                                                        </p>
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="mt-6 flex justify-end">
                                                        <button onClick={() => setShowRawPreview(false)} className="btn-secondary">Close</button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-12">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Study Tips</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Clock className="w-6 h-6 text-blue-600" />
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Spaced Repetition</h3>
                                <p className="text-sm text-gray-600">Review flashnotes regularly for better retention</p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Target className="w-6 h-6 text-green-600" />
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Active Recall</h3>
                                <p className="text-sm text-gray-600">Test yourself with quizzes to strengthen memory pathways</p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Brain className="w-6 h-6 text-purple-600" />
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Mix It Up</h3>
                                <p className="text-sm text-gray-600">Use both summaries and quizzes for comprehensive learning</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProcessPage;


