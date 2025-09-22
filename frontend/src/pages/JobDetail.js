import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiService } from '../services/apiService';
import LoadingSpinner from '../components/LoadingSpinner';
import { getLanguageName } from '../utils/languageUtils';
import { formatNoteContent, renderFormattedContent, formatNoteMetadata, truncateText } from '../utils/noteFormatter';

// Simple single-flight caches to avoid duplicate API calls under StrictMode or rapid re-renders
const jobPromiseCache = new Map(); // id -> Promise
const documentPromiseCache = new Map(); // id -> Promise

const JobDetail = () => {
    const { id } = useParams();
    const [job, setJob] = useState(null);
    const [loading, setLoading] = useState(true);
    const [documentDetails, setDocumentDetails] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let isActive = true;
        const load = async () => {
            try {
                let jobPromise = jobPromiseCache.get(id);
                if (!jobPromise) {
                    jobPromise = apiService.getJob(id);
                    jobPromiseCache.set(id, jobPromise);
                }
                const data = await jobPromise;
                if (!isActive) return;
                setJob(data);

                if (data?.document_id) {
                    try {
                        let docPromise = documentPromiseCache.get(data.document_id);
                        if (!docPromise) {
                            docPromise = apiService.getDocument(data.document_id);
                            documentPromiseCache.set(data.document_id, docPromise);
                        }
                        const doc = await docPromise;
                        if (!isActive) return;
                        setDocumentDetails(doc);
                    } catch (_) {
                        // ignore document fetch error
                    }
                }
            } catch (e) {
                if (!isActive) return;
                setError('Failed to load job');
            } finally {
                if (!isActive) return;
                setLoading(false);
            }
        };
        load();
        return () => { isActive = false; };
    }, [id]);

    const Section = ({ title, children }) => (
        <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-96 overflow-auto">
                {children}
            </div>
        </div>
    );

    const renderQuiz = (quiz) => {
        if (!quiz) return null;
        return (
            <div className="space-y-4">
                <p className="font-medium text-gray-900">{quiz.title || `Quiz #${quiz.id}`}</p>
                <div className="space-y-4">
                    {(quiz.questions || []).map((q, idx) => (
                        <div key={q.id || idx} className="p-4 bg-white rounded border">
                            <p className="font-medium text-gray-900 mb-2">{(q.ordinal || idx + 1)}. {q.prompt}</p>
                            {(q.options || []).length > 0 && (
                                <ul className="list-disc pl-5 text-sm text-gray-800 space-y-1">
                                    {q.options.map((opt, oi) => (
                                        <li key={oi} className={`${q.answer_index === oi ? 'text-green-700 font-medium' : ''}`}>{opt}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderFlashnotes = (notes) => {
        if (!notes || !notes.length) return null;
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">Generated FlashNotes</h4>
                    <span className="text-sm text-gray-500">{notes.length} notes created</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {notes.map((note) => {
                        const formattedContent = formatNoteContent(note.content);
                        const metadata = formatNoteMetadata(note);

                        return (
                            <div key={note.id} className="bg-white border border-gray-200 rounded-lg shadow-sm">
                                {/* Note Header */}
                                <div className="p-4 border-b border-gray-100">
                                    <h5 className="font-semibold text-gray-900 mb-2">
                                        {note.title || `FlashNote #${note.id}`}
                                    </h5>

                                    {/* Metadata */}
                                    {metadata.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {metadata.map((meta, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                                                    <span className="font-medium">{meta.label}:</span>
                                                    <span>{meta.value}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Note Content */}
                                <div className="p-4">
                                    <div className="text-gray-800 max-h-64 overflow-auto">
                                        {renderFormattedContent(formattedContent)}
                                    </div>
                                </div>

                                {/* Source Snippet */}
                                {note.source_snippet && (
                                    <div className="px-4 pb-4">
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <h6 className="text-sm font-medium text-blue-900 mb-2">Source Text:</h6>
                                            <p className="text-sm text-blue-800 leading-relaxed">
                                                {truncateText(note.source_snippet, 150)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>
        );
    }

    const toTitleCase = (str) => (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const renderFriendlyParams = (type, params) => {
        const p = params || {};
        const entries = [];
        const add = (label, value) => {
            if (value === undefined || value === null || value === '') return;
            entries.push({ label, value });
        };

        const typeLc = (type || '').toLowerCase();
        if (typeLc === 'translate') {
            add('Target language', getLanguageName(p.target_lang || p.targetLang || p.target));
            add('Source language', p.source_lang || p.sourceLang || p.source ? getLanguageName(p.source_lang || p.sourceLang || p.source) : 'Auto');
            add('Formality', p.formality);
        } else if (typeLc === 'summarize' || typeLc === 'summary') {
            add('Summary mode', p.mode || p.summary_mode || p.style);
            add('Max length', p.max_length || p.maxLength);
            add('Include bullets', p.include_bullets ? 'Yes' : (p.include_bullets === false ? 'No' : undefined));
        } else if (typeLc === 'transcribe' || typeLc === 'transcription') {
            add('Language', getLanguageName(p.language || p.lang));
            add('Diarization', p.diarization ? 'Enabled' : (p.diarization === false ? 'Disabled' : undefined));
            add('Model', p.model);
        }

        // Fallback: show any remaining simple scalar params
        Object.keys(p).forEach((k) => {
            const known = ['target_lang', 'targetLang', 'target', 'source_lang', 'sourceLang', 'source', 'formality', 'mode', 'summary_mode', 'style', 'max_length', 'maxLength', 'include_bullets', 'language', 'lang', 'diarization', 'model'];
            if (known.includes(k)) return;
            const v = p[k];
            if (['string', 'number', 'boolean'].includes(typeof v)) {
                add(toTitleCase(k), String(v));
            }
        });

        if (!entries.length) {
            return (
                <p className="text-sm text-gray-500">No parameters.</p>
            );
        }

        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {entries.map((e, i) => (
                    <div key={i} className="p-3 rounded bg-gray-50">
                        <p className="text-gray-500">{e.label}</p>
                        <p className="text-gray-900">{e.value}</p>
                    </div>
                ))}
            </div>
        );
    };

    const statusBadgeClass = (status) => {
        const s = (status || '').toLowerCase();
        if (s === 'completed' || s === 'success') return 'bg-green-100 text-green-700';
        if (s === 'failed' || s === 'error') return 'bg-red-100 text-red-700';
        if (s === 'running' || s === 'processing' || s === 'queued') return 'bg-blue-100 text-blue-700';
        return 'bg-gray-100 text-gray-700';
    };

    const isAudioVideo = (mime) => !!mime && (mime.startsWith('audio/') || mime.startsWith('video/'));

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString();
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 mt-15 ">
            <div className="max-w-5xl mx-auto px-4 ">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold text-gray-900">{toTitleCase(job?.type)} Process #{job?.id}</h1>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(job?.status)}`}>{toTitleCase(job?.status)}</span>
                    </div>
                    {job?.document_id ? (
                        <Link to={`/document/${job.document_id}`} className="btn-secondary">View Document</Link>
                    ) : (
                        <span className="text-sm text-gray-500">Text-only job</span>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="card">
                        <div className="text-sm text-gray-700 space-y-1">
                            <p><span className="font-medium">Type:</span> {job?.type}</p>
                            <p><span className="font-medium">Status:</span> {job?.status}</p>
                            <p><span className="font-medium">Created:</span> {formatDate(job?.started_at || job?.created_at || '')}</p>
                            <p><span className="font-medium">Finished:</span> {job?.finished_at ? formatDate(job.finished_at) : ''}</p>
                            {job?.document_id && <p><span className="font-medium">Document ID:</span> {job.document_id}</p>}
                        </div>
                    </div>
                    <div className="card">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Settings</h2>
                        {renderFriendlyParams(job?.type, job?.params)}
                    </div>
                    {documentDetails && (
                        <div className="card md:col-span-2">
                            <h2 className="text-lg font-semibold text-gray-900 mb-2">Document</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                                <p><span className="font-medium">Name:</span> {documentDetails.original_name || documentDetails.filename}</p>
                                <p><span className="font-medium">Type:</span> {documentDetails.mime_type} {isAudioVideo(documentDetails.mime_type) ? <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-2xs">audio/video</span> : <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-2xs">document</span>}</p>
                                <p><span className="font-medium">Size:</span> {documentDetails.size_bytes} bytes</p>
                                <p><span className="font-medium">Created:</span> {formatDate(documentDetails.created_at)}</p>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Link to={`/documents/${documentDetails.id}`} className="btn-primary">Open Document</Link>
                            </div>
                        </div>
                    )}
                </div>

                <div className="card">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Result</h2>
                    <div className="space-y-4">
                        {/* Quiz jobs may not have steps; render friendly summary */}
                        {(job?.type === 'quiz' && job?.result && !job?.result?.steps) ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                    {'count' in (job.result || {}) && (
                                        <div className="p-3 rounded bg-gray-50">
                                            <p className="text-gray-500">Questions Created</p>
                                            <p className="text-gray-900">{job.result.count}</p>
                                        </div>
                                    )}
                                    {'quiz_id' in (job.result || {}) && (
                                        <div className="p-3 rounded bg-gray-50">
                                            <p className="text-gray-500">Quiz ID</p>
                                            <p className="text-gray-900">{job.result.quiz_id}</p>
                                        </div>
                                    )}
                                    {job.input?.text_snippet && (
                                        <div className="p-3 rounded bg-gray-50 sm:col-span-1">
                                            <p className="text-gray-500">Source Text</p>
                                            <p className="text-gray-900 line-clamp-3">{job.input.text_snippet}</p>
                                        </div>
                                    )}
                                </div>
                                {job.input?.text_snippet && (
                                    <Section title="Source Text">{job.input.text_snippet}</Section>
                                )}
                                {/* Hide low-level raw by default; show if present as technical details */}
                                {job.result?.raw && (
                                    <details className="rounded border p-3">
                                        <summary className="cursor-pointer text-sm text-gray-700">Technical details</summary>
                                        <pre className="bg-gray-50 rounded-lg p-3 text-xs max-h-96 overflow-auto mt-2">{JSON.stringify(job.result.raw, null, 2)}</pre>
                                    </details>
                                )}
                            </div>
                        ) : job?.type === 'notes' && job?.result && !job?.result?.steps ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    {'count' in (job.result || {}) && (
                                        <div className="p-3 rounded bg-gray-50">
                                            <p className="text-gray-500">Notes Created</p>
                                            <p className="text-gray-900">{job.result.count}</p>
                                        </div>
                                    )}
                                    {'created_note_ids' in (job.result || {}) && (
                                        <div className="p-3 rounded bg-gray-50">
                                            <p className="text-gray-500">Note IDs</p>
                                            <p className="text-gray-900">{job.result.created_note_ids.join(', ')}</p>
                                        </div>
                                    )}
                                </div>
                                {job.input?.text_snippet && (
                                    <Section title="Source Text">{job.input.text_snippet}</Section>
                                )}
                                {/* Show note creation summary */}
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <h4 className="font-medium text-green-900 mb-2">FlashNotes Generated Successfully</h4>
                                    <p className="text-green-800 text-sm">
                                        {job.result.count} FlashNote{job.result.count !== 1 ? 's' : ''} created from the source text.
                                        You can view the detailed notes in the Study Aids section.
                                    </p>
                                </div>
                            </div>
                        ) : job?.result?.steps?.length ? (
                            job.result.steps.map((s, idx) => (
                                <div key={idx} className="border rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="font-medium text-gray-900">{toTitleCase(s.name)} • {toTitleCase(s.status)}</p>
                                        <p className="text-xs text-gray-500">{formatDate(s.started_at)} → {s.finished_at ? formatDate(s.finished_at) : ''}</p>
                                    </div>
                                    {s.output && typeof s.output === 'object' ? (
                                        (() => {
                                            const sections = [];
                                            const seen = new Set();
                                            const pushUnique = (key, label, value) => {
                                                if (!value || typeof value !== 'string') return;
                                                const norm = value.trim();
                                                if (!norm || seen.has(norm)) return;
                                                seen.add(norm);
                                                sections.push(<Section key={key} title={label}>{value}</Section>);
                                            };
                                            pushUnique('summary', 'Summary', s.output.summary);
                                            pushUnique('translation', 'Translation', s.output.translation);
                                            pushUnique('transcription', 'Transcription', s.output.transcription);
                                            if (!s.output.transcription) {
                                                pushUnique('text', 'Text', s.output.text);
                                            }
                                            if (typeof s.output.raw === 'string') {
                                                pushUnique('raw', 'Raw', s.output.raw);
                                            }
                                            if (s.output.quiz) {
                                                sections.push(<Section key="quiz" title="Quiz">{renderQuiz(s.output.quiz)}</Section>);
                                            }
                                            if (Array.isArray(s.output.notes) && s.output.notes.length > 0) {
                                                sections.push(<Section key="flashnotes" title="Flashnotes">{renderFlashnotes(s.output.notes)}</Section>);
                                            }
                                            if (!sections.length) {
                                                return <pre className="bg-gray-50 rounded-lg p-3 text-xs max-h-96 overflow-auto">{JSON.stringify(s.output, null, 2)}</pre>;
                                            }
                                            return <>{sections}</>;
                                        })()
                                    ) : (
                                        <pre className="bg-gray-50 rounded-lg p-3 text-xs max-h-96 overflow-auto">{JSON.stringify(s.output)}</pre>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-500">No result available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JobDetail;
