
import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import {
    Upload,
    File,
    FileText,
    Video,
    Music,
    X,
    CheckCircle,
    Clock,
    AlertCircle
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import { LANGUAGE_OPTIONS } from '../utils/languageUtils';

const UploadPage = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [activeTab, setActiveTab] = useState('summary');
    const [processing, setProcessing] = useState(false);
    const [translationParams, setTranslationParams] = useState({
        sourceLang: '',
        targetLang: 'en'
    });
    const [summaryMode, setSummaryMode] = useState('concise');
    const [textInput, setTextInput] = useState('');
    const [textTranslationParams, setTextTranslationParams] = useState({ sourceLang: '', targetLang: 'en' });

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/auth');
        }
    }, [isAuthenticated, navigate]);

    // Keep selectedFile in sync with files array
    useEffect(() => {
        if (selectedFile && files.length > 0) {
            const updatedFile = files.find(f => f.documentId === selectedFile.documentId);
            if (updatedFile && updatedFile !== selectedFile) {
                setSelectedFile(updatedFile);
            }
        }
    }, [files, selectedFile]);

    const onDrop = useCallback(async (acceptedFiles) => {
        const newFiles = acceptedFiles.map(file => ({
            id: Date.now() + Math.random(),
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'uploading',
            progress: 0,
            documentId: null,
            preview: null,
            raw: null,
            transcribe: null,
            summary: null,
            translate: null
        }));

        setFiles(prev => [...prev, ...newFiles]);

        // Upload files
        for (const fileObj of newFiles) {
            try {
                const result = await apiService.uploadDocument(fileObj.file);
                fileObj.status = 'uploaded';
                fileObj.documentId = result.id; // Backend returns 'id', not 'document_id'
                fileObj.progress = 100;
                fileObj.raw = result.text_content || null; // save extracted raw text when provided
                setFiles(prev => [...prev]);
                toast.success(`${fileObj.name} uploaded successfully`);

                // Redirect to processing page for this document
                navigate(`/process/${fileObj.documentId}`);

                // Auto-select the first successfully uploaded file
                if (!selectedFile && fileObj.status === 'uploaded') {
                    setSelectedFile(fileObj);
                }

                // Auto-transcribe for audio/video
                const isAudio = fileObj.type.startsWith('audio/');
                const isVideo = fileObj.type.startsWith('video/');
                if (isAudio || isVideo) {
                    try {
                        const transRes = await apiService.transcribe(fileObj.documentId);
                        // Prefer direct field if backend provides
                        const textFromDirect = transRes.transcription || null;
                        // Or extract from structured result
                        let textFromSteps = null;
                        if (transRes.result && Array.isArray(transRes.result.steps)) {
                            const step = transRes.result.steps.find(s => s.name === 'transcribe');
                            textFromSteps = step?.output?.transcription || step?.output?.text || null;
                        }
                        const transcribedText = textFromDirect || textFromSteps;
                        if (transcribedText) {
                            fileObj.transcribe = transcribedText;
                            // also set as raw source if raw missing
                            if (!fileObj.raw) fileObj.raw = transcribedText;
                            setFiles(prev => [...prev]);
                            toast.success('Transcription completed');
                        }
                    } catch (e) {
                        toast.error('Auto transcription failed');
                    }
                }
            } catch (error) {
                fileObj.status = 'error';
                setFiles(prev => [...prev]);
                toast.error(`Failed to upload ${fileObj.name}`);
            }
        }
    }, [selectedFile, navigate]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'text/plain': ['.txt'],
            'text/markdown': ['.md'],
            'audio/*': ['.mp3', '.wav', '.m4a', '.ogg'],
            'video/*': ['.mp4', '.avi', '.mov', '.wmv'],
            'image/*': ['.png', '.jpg', '.jpeg']
        },
        multiple: true
    });

    const removeFile = (fileId) => {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        if (selectedFile?.id === fileId) {
            setSelectedFile(null);
        }
    };

    const getFileIcon = (type) => {
        if (type.startsWith('video/')) return <Video className="w-5 h-5" />;
        if (type.startsWith('audio/')) return <Music className="w-5 h-5" />;
        if (type.includes('pdf')) return <FileText className="w-5 h-5" />;
        return <File className="w-5 h-5" />;
    };

    const getFileType = (type) => {
        if (type.startsWith('video/')) return 'video';
        if (type.startsWith('audio/')) return 'audio';
        return 'document';
    };

    const getAvailableActions = (fileType) => {
        if (fileType === 'video' || fileType === 'audio') {
            return ['transcribe', 'summary', 'translate'];
        }
        return ['summary', 'translate'];
    };

    const handleAction = async (action, documentId) => {
        if (!documentId) {
            toast.error('File not uploaded yet');
            return;
        }

        setProcessing(true);
        try {
            // Prefer raw text from extraction, else transcribed text
            const availableText = selectedFile?.raw || selectedFile?.transcribe || null;
            let result;
            switch (action) {
                case 'transcribe':
                    result = await apiService.transcribe(documentId);
                    break;
                case 'summary':
                    result = await apiService.summarize(documentId, availableText, summaryMode);
                    break;
                case 'translate':
                    result = await apiService.translate(
                        documentId,
                        availableText,
                        translationParams.targetLang,
                        translationParams.sourceLang || null
                    );
                    break;
                default:
                    throw new Error('Unknown action');
            }

            toast.success(`${action} completed successfully`);

            // Extract the actual result from the backend response
            const extractedResult = extractResult(result, action);

            // If extraction failed, try to get result from the response directly
            let finalResult = extractedResult;
            if (!finalResult && result) {
                if (result.summary) finalResult = result.summary;
                else if (result.transcription) finalResult = result.transcription;
                else if (result.translation) finalResult = result.translation;
                else if (result.result && typeof result.result === 'string') finalResult = result.result;
            }

            // Update file with result
            setFiles(prev => {
                const updatedFiles = prev.map(f => {
                    if (f.documentId === documentId) {
                        const updatedFile = { ...f, [action]: finalResult };
                        if (action === 'transcribe' && finalResult && !updatedFile.raw) {
                            updatedFile.raw = finalResult;
                        }
                        if (selectedFile && selectedFile.documentId === documentId) {
                            setSelectedFile(updatedFile);
                        }
                        return updatedFile;
                    }
                    return f;
                });
                return updatedFiles;
            });
        } catch (error) {
            toast.error(`Failed to ${action}: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    // Helper function to extract result from backend response
    const extractResult = (result, action) => {
        if (!result) return null;

        // Handle translation response with direct field from backend as well
        if (action === 'translate' && result.translation) return result.translation;
        if (action === 'transcribe' && result.transcription) return result.transcription;
        if (action === 'summary' && result.summary) return result.summary;

        if (!result.result) {
            if (result.summary) return result.summary;
            if (result.transcription) return result.transcription;
            if (result.translation) return result.translation;
            return null;
        }

        const { result: jobResult } = result;

        if (jobResult.overall_status === 'completed' && jobResult.steps) {
            const step = jobResult.steps.find(s => s.name === action) || jobResult.steps[0];
            if (step && step.output) {
                switch (action) {
                    case 'summary':
                        if (step.output.summary && step.output.raw && step.output.summary === step.output.raw) {
                            return step.output.summary;
                        }
                        return step.output.summary || step.output.raw;
                    case 'transcribe':
                        return step.output.transcription || step.output.text || step.output.raw;
                    case 'translate':
                        return step.output.translation || step.output.raw;
                    default:
                        return step.output.raw;
                }
            }
        }
        return jobResult.raw || jobResult.summary || jobResult.transcription || jobResult.translation;
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'uploading': return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'uploaded': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-gray-500" />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold text-gray-900 mb-8">Upload & Process</h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Upload Area */}
                    <div className="lg:col-span-1">
                        <div className="card">
                            <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Files</h2>
                            <p className="text-sm text-gray-600 mb-4">Drag & drop or click to pick files. We support PDF, DOC/DOCX, TXT, Audio, and Video.</p>

                            {/* Drop Zone */}
                            <div
                                {...getRootProps()}
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive
                                    ? 'border-primary bg-primary/5'
                                    : 'border-gray-300 hover:border-primary hover:bg-gray-50'
                                    }`}
                                title="Drop PDF/DOC/TXT/MD/PNG/JPG/Audio/Video or click to browse"
                            >
                                <input {...getInputProps()} />
                                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                {isDragActive ? (
                                    <p className="text-primary font-medium">Drop files here...</p>
                                ) : (
                                    <div>
                                        <p className="text-gray-600 mb-2">Drag & drop files here, or click to select</p>
                                        <p className="text-sm text-gray-500">
                                            Supports PDF, DOC/DOCX, TXT, Markdown, Images, Audio, Video
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">Tip: You can select multiple files. They will upload one by one.</p>
                                    </div>
                                )}
                            </div>

                            {/* File List */}
                            {files.length > 0 && (
                                <div className="mt-6">
                                    <h3 className="font-medium text-gray-900 mb-4">Uploaded Files</h3>
                                    <div className="space-y-3">
                                        {files.map((fileObj) => (
                                            <div
                                                key={fileObj.id}
                                                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedFile?.id === fileObj.id
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                                onClick={() => setSelectedFile(fileObj)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="text-gray-500">
                                                        {getFileIcon(fileObj.type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900 truncate">
                                                            {fileObj.name}
                                                        </p>
                                                        <p className="text-sm text-gray-500">
                                                            {formatFileSize(fileObj.size)} • {getFileType(fileObj.type)}
                                                        </p>
                                                        {fileObj.status === 'uploaded' && (
                                                            <p className="text-xs text-green-600 font-medium">
                                                                ✓ Ready for processing
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {getStatusIcon(fileObj.status)}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeFile(fileObj.id);
                                                            }}
                                                            className="text-gray-400 hover:text-red-500"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {fileObj.status === 'uploading' && (
                                                    <div className="mt-2">
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-primary h-2 rounded-full transition-all"
                                                                style={{ width: `${fileObj.progress}%` }}
                                                            ></div>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">Uploading your document...</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* File Preview & Actions */}
                    <div className="lg:col-span-2">
                        {selectedFile ? (
                            <div className="card">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        {getFileIcon(selectedFile.type)}
                                        <div>
                                            <h2 className="text-xl font-semibold text-gray-900">
                                                {selectedFile.name}
                                            </h2>
                                            <p className="text-gray-500">
                                                {formatFileSize(selectedFile.size)} • {getFileType(selectedFile.type)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(selectedFile.status)}
                                        <span className="text-sm text-gray-500 capitalize">
                                            {selectedFile.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Show processing options only for uploaded files */}
                                {selectedFile.status === 'uploaded' ? (
                                    <>
                                        {/* Action Tabs */}
                                        <div className="flex mb-6">
                                            {getAvailableActions(getFileType(selectedFile.type)).map((action) => (
                                                <button
                                                    key={action}
                                                    onClick={() => setActiveTab(action)}
                                                    className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === action
                                                        ? 'bg-primary text-white'
                                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    {action.charAt(0).toUpperCase() + action.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <p className="text-yellow-800 text-sm">
                                            {selectedFile.status === 'uploading'
                                                ? 'File is being uploaded...'
                                                : 'File upload failed. Please try again.'}
                                        </p>
                                    </div>
                                )}

                                {/* Action Content - Only show for uploaded files */}
                                {selectedFile.status === 'uploaded' && (
                                    <div className="space-y-4">
                                        {activeTab === 'transcribe' && (
                                            <div>
                                                <h3 className="font-medium text-gray-900 mb-1">Transcription</h3>
                                                <p className="text-gray-600 mb-2 text-sm">
                                                    Upload an audio/video file. Click below to convert speech to text. After it finishes, you can generate a summary or translation from the transcript.
                                                </p>
                                                <p className="text-xs text-gray-500 mb-4">Tip: Audio/Video uploads auto-start transcription. You can rerun it if needed.</p>
                                                <button
                                                    onClick={() => handleAction('transcribe', selectedFile.documentId)}
                                                    disabled={processing || selectedFile.status !== 'uploaded'}
                                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Start converting your audio/video to text"
                                                >
                                                    {processing ? (
                                                        <>
                                                            <LoadingSpinner size="small" className="mr-2" />
                                                            Transcribing...
                                                        </>
                                                    ) : (
                                                        'Start Transcription'
                                                    )}
                                                </button>
                                            </div>
                                        )}

                                        {activeTab === 'summary' && (
                                            <div>
                                                <h3 className="font-medium text-gray-900 mb-1">Summary</h3>
                                                <p className="text-gray-600 mb-2 text-sm">
                                                    Summarize the uploaded document. If raw text or a transcript is available, it will be used automatically. Choose a mode and generate the summary.
                                                </p>
                                                <p className="text-xs text-gray-500 mb-4">Tip: For audio/video, run transcription first for best results.</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Mode
                                                        </label>
                                                        <select
                                                            className="input-field"
                                                            value={summaryMode}
                                                            onChange={(e) => setSummaryMode(e.target.value)}
                                                            title="Select how detailed you want the summary to be"
                                                        >
                                                            <option value="concise">Concise</option>
                                                            <option value="detailed">Detailed</option>
                                                            <option value="full">Full</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleAction('summary', selectedFile.documentId)}
                                                    disabled={processing || selectedFile.status !== 'uploaded'}
                                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Generate a summary of the document or transcript"
                                                >
                                                    {processing ? (
                                                        <>
                                                            <LoadingSpinner size="small" className="mr-2" />
                                                            Summarizing...
                                                        </>
                                                    ) : (
                                                        'Generate Summary'
                                                    )}
                                                </button>
                                            </div>
                                        )}

                                        {activeTab === 'translate' && (
                                            <div>
                                                <h3 className="font-medium text-gray-900 mb-1">Translation</h3>
                                                <p className="text-gray-600 mb-2 text-sm">
                                                    Translate the document text (or transcript) to your target language. Source language is optional and auto-detected if not set.
                                                </p>
                                                <p className="text-xs text-gray-500 mb-4">Tip: After transcription, translate the transcript for audio/video files.</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Target Language
                                                        </label>
                                                        <select
                                                            className="input-field"
                                                            value={translationParams.targetLang}
                                                            onChange={(e) => setTranslationParams(prev => ({
                                                                ...prev,
                                                                targetLang: e.target.value
                                                            }))}
                                                            title="Language to translate into"
                                                        >
                                                            {LANGUAGE_OPTIONS.map(option => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Source Language (Optional)
                                                        </label>
                                                        <select
                                                            className="input-field"
                                                            value={translationParams.sourceLang}
                                                            onChange={(e) => setTranslationParams(prev => ({
                                                                ...prev,
                                                                sourceLang: e.target.value
                                                            }))}
                                                            title="Original language of the text (leave blank to auto-detect)"
                                                        >
                                                            <option value="">Auto-detect</option>
                                                            {LANGUAGE_OPTIONS.map(option => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleAction('translate', selectedFile.documentId)}
                                                    disabled={processing || selectedFile.status !== 'uploaded'}
                                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Translate the document or transcript to your selected language"
                                                >
                                                    {processing ? (
                                                        <>
                                                            <LoadingSpinner size="small" className="mr-2" />
                                                            Translating...
                                                        </>
                                                    ) : (
                                                        'Start Translation'
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Results Display */}
                                {(() => {
                                    const hasResults = selectedFile.transcribe || selectedFile.summary || selectedFile.translate || selectedFile.raw;
                                    return hasResults;
                                })() && (
                                        <div className="mt-8 pt-6 border-t border-gray-200">
                                            <h3 className="font-medium text-gray-900 mb-4">Processing Results</h3>
                                            <div className="space-y-6">
                                                {selectedFile.raw && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                                            <h4 className="font-medium text-gray-900">Raw Text</h4>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">
                                                            {selectedFile.raw}
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedFile.transcribe && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                            <h4 className="font-medium text-gray-900">Transcription</h4>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">
                                                            {selectedFile.transcribe}
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedFile.summary && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                            <h4 className="font-medium text-gray-900">Summary</h4>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">
                                                            {selectedFile.summary}
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedFile.translate && (
                                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                                            <h4 className="font-medium text-gray-900">Translation</h4>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-80 overflow-auto">
                                                            {selectedFile.translate}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                            </div>
                        ) : (
                            <div className="card">
                                <div className="text-center py-12">
                                    <File className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        No file selected
                                    </h3>
                                    <p className="text-gray-500">
                                        Upload a file to get started with processing
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Process Text Directly */}
                <div className="mt-10 card">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Need to process plain text?</h2>
                    <p className="text-gray-600 mb-4">
                        Summarization and translation for copy/paste text have moved to a dedicated page.
                    </p>
                    <a href="/text-process" className="btn-primary inline-block">Go to Text Process</a>
                </div>
            </div>
        </div>
    );
};

export default UploadPage;
