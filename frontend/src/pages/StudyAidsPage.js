import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import {
    Brain,
    FileText,
    RotateCcw,
    CheckCircle,
    Clock,
    Target,
    Tag,
    Calendar,
    Eye,
    EyeOff
} from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { formatNoteContent, renderFormattedContent, formatNoteMetadata, truncateText } from '../utils/noteFormatter';

const StudyAidsPage = () => {
    const { isAuthenticated } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [docSearch, setDocSearch] = useState('');
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [activeTab, setActiveTab] = useState('quiz');
    // Per-document loading flags to allow concurrent actions across documents
    const [loadingQuizByDoc, setLoadingQuizByDoc] = useState({}); // docId -> boolean
    const [loadingNotesByDoc, setLoadingNotesByDoc] = useState({}); // docId -> boolean
    // Per-document data stores
    const [quizzesByDoc, setQuizzesByDoc] = useState({}); // docId -> quiz
    const [notesByDoc, setNotesByDoc] = useState({}); // docId -> [notes]
    // Derived for current selection
    const currentDocId = selectedDocument?.id || null;
    const quiz = currentDocId ? quizzesByDoc[currentDocId] || null : null;
    const flashNotes = currentDocId ? notesByDoc[currentDocId] || [] : [];
    const [quizAnswers, setQuizAnswers] = useState({}); // questionId -> selected_index
    const [quizSubmitted, setQuizSubmitted] = useState(false);
    const [quizScore, setQuizScore] = useState(null);
    const [expandedNotes, setExpandedNotes] = useState({}); // noteId -> boolean
    const [showSourceSnippets, setShowSourceSnippets] = useState(false);
    const didFetchRef = useRef(false);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (didFetchRef.current) return;
        didFetchRef.current = true;
        loadDocuments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    const loadDocuments = async () => {
        try {
            const data = await apiService.getDocuments();
            // backend returns an array; some code may expect {documents: []}
            const list = Array.isArray(data) ? data : (data.documents || []);
            setDocuments(list);
        } catch (error) {
            console.error('Failed to load documents:', error);
            toast.error('Failed to load documents');
        }
    };

    const handleGenerateQuiz = async (force = false) => {
        if (!selectedDocument) {
            toast.error('Please select a document first');
            return;
        }
        const docId = selectedDocument.id;
        setLoadingQuizByDoc(prev => ({ ...prev, [docId]: true }));
        try {
            // Create quiz job, then fetch full quiz
            const gen = await apiService.generateQuiz(docId, 5, 'medium', undefined, force);
            const quizId = gen?.quiz?.id || gen?.quiz_id || gen?.id;
            if (!quizId) {
                toast.error('Quiz generation did not return an ID');
                setLoadingQuizByDoc(prev => ({ ...prev, [docId]: false }));
                return;
            }
            const full = await apiService.getQuiz(quizId);
            // Normalize to { questions: [...] }
            const normalized = {
                id: full.id,
                title: full.title,
                questions: (full.questions || []).map(q => ({
                    id: q.id,
                    ordinal: q.ordinal,
                    prompt: q.prompt,
                    options: q.options || [],
                    answer_index: q.answer_index
                }))
            };
            setQuizzesByDoc(prev => ({ ...prev, [docId]: normalized }));
            setQuizAnswers({});
            setQuizSubmitted(false);
            setQuizScore(null);
            toast.success(gen?.status === 'existing' ? 'Loaded existing quiz' : 'Quiz generated successfully');
        } catch (error) {
            toast.error(`Failed to generate quiz: ${error.message}`);
        } finally {
            setLoadingQuizByDoc(prev => ({ ...prev, [docId]: false }));
        }
    };

    const handleGenerateFlashNotes = async (force = false) => {
        if (!selectedDocument) {
            toast.error('Please select a document first');
            return;
        }
        const docId = selectedDocument.id;
        setLoadingNotesByDoc(prev => ({ ...prev, [docId]: true }));
        try {
            const result = await apiService.generateFlashNotes(docId, 6, 'study', force);
            const created = result.created || [];
            setNotesByDoc(prev => ({ ...prev, [docId]: created }));

            if (result.status === 'existing') {
                toast.success('Loaded existing flash notes');
            } else {
                toast.success('Flash notes generated successfully');
            }
        } catch (error) {
            toast.error(`Failed to generate flash notes: ${error.message}`);
        } finally {
            setLoadingNotesByDoc(prev => ({ ...prev, [docId]: false }));
        }
    };

    const handleQuizAnswer = (questionId, selectedIndex) => {
        setQuizAnswers(prev => ({
            ...prev,
            [questionId]: selectedIndex
        }));
    };

    const handleSubmitQuiz = async () => {
        if (!quiz) return;

        // ensure all answered
        const unanswered = quiz.questions.filter(q => quizAnswers[q.id] === undefined);
        if (unanswered.length > 0) {
            toast.error('Please answer all questions before submitting');
            return;
        }

        // Use per-doc quiz loading for submit to avoid blocking other actions
        const docId = selectedDocument?.id;
        if (docId) setLoadingQuizByDoc(prev => ({ ...prev, [docId]: true }));
        try {
            // Build answers in { ordinal, selected_index } format
            const answersArray = quiz.questions.map(q => ({
                ordinal: q.ordinal,
                selected_index: quizAnswers[q.id]
            }));
            const result = await apiService.submitQuizAttempt(quiz.id, answersArray);
            setQuizScore(result.score);
            setQuizSubmitted(true);
            toast.success(`Quiz completed! Score: ${result.score}`);
        } catch (error) {
            toast.error(`Failed to submit quiz: ${error.message}`);
        } finally {
            if (docId) setLoadingQuizByDoc(prev => ({ ...prev, [docId]: false }));
        }
    };

    const handleRetryQuiz = () => {
        setQuizAnswers({});
        setQuizSubmitted(false);
        setQuizScore(null);
    };

    const toggleNoteExpansion = (noteId) => {
        setExpandedNotes(prev => ({
            ...prev,
            [noteId]: !prev[noteId]
        }));
    };

    const toggleSourceSnippets = () => {
        setShowSourceSnippets(prev => !prev);
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
                    <p className="text-gray-600 mb-6">Please sign in to access study aids.</p>
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
                        <h1 className="text-4xl font-bold text-gray-900">Study Aids</h1>
                        <p className="text-gray-600 mt-2">Generate quizzes and flashnotes from your documents</p>
                    </div>
                    <Link to="/schedule" className="btn-primary flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Build Schedule
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Document Selection */}
                    <div className="lg:col-span-1">
                        <div className="card">
                            <h2 className="text-xl font-semibold text-gray-900 mb-3">Select Document</h2>
                            <div className="mb-4">
                                <input
                                    type="text"
                                    value={docSearch}
                                    onChange={(e) => setDocSearch(e.target.value)}
                                    placeholder="Search by name..."
                                    className="input-field w-full py-3 text-base"
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
                                                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedDocument?.id === doc.id
                                                    ? 'border-primary bg-primary/5'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                                onClick={() => setSelectedDocument(doc)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-5 h-5 text-gray-500" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900 truncate" title={doc.original_name || doc.filename}>{doc.original_name || doc.filename}</p>
                                                        <p className="text-sm text-gray-500" title={new Date(doc.created_at).toLocaleString()}>{new Date(doc.created_at).toLocaleDateString()}</p>
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

                    {/* Study Aids Content */}
                    <div className="lg:col-span-3">
                        <div className="card">
                            {/* Tabs */}
                            <div className="flex mb-6">
                                <button
                                    onClick={() => setActiveTab('quiz')}
                                    className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'quiz'
                                        ? 'bg-primary text-white'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                >
                                    Quiz
                                </button>
                                <button
                                    onClick={() => setActiveTab('flashcards')}
                                    className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'flashcards'
                                        ? 'bg-primary text-white'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                >
                                    Flashnotes
                                </button>
                            </div>

                            {selectedDocument ? (
                                <div>
                                    {/* Quiz Tab */}
                                    {activeTab === 'quiz' && (
                                        <div className="space-y-6">
                                            {!quiz ? (
                                                <div className="text-center py-12">
                                                    <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                                        Generate Quiz
                                                    </h3>
                                                    <p className="text-gray-500 mb-6">
                                                        Create a quiz from your document to test your knowledge
                                                    </p>
                                                    <div className="flex items-center justify-center gap-3">
                                                        <button
                                                            onClick={() => handleGenerateQuiz(false)}
                                                            disabled={!!loadingQuizByDoc[currentDocId]}
                                                            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            {loadingQuizByDoc[currentDocId] ? (
                                                                <>
                                                                    <LoadingSpinner size="small" />
                                                                    Generating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Brain className="w-5 h-5" />
                                                                    Generate Quiz
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => handleGenerateQuiz(true)}
                                                            disabled={!!loadingQuizByDoc[currentDocId]}
                                                            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title="Force regenerate a new quiz even if one exists"
                                                        >
                                                            Regenerate
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    {/* Quiz Header */}
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h3 className="text-xl font-semibold text-gray-900">
                                                                Quiz: {selectedDocument.original_name || selectedDocument.filename}
                                                            </h3>
                                                            <p className="text-gray-600">
                                                                {quiz.questions.length} questions
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {quizScore !== null && (
                                                                <div className="text-right">
                                                                    <p className="text-2xl font-bold text-primary">
                                                                        {quizScore}
                                                                    </p>
                                                                    <p className="text-sm text-gray-600">Score</p>
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => handleGenerateQuiz(true)}
                                                                disabled={!!loadingQuizByDoc[currentDocId]}
                                                                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="Force regenerate a new quiz for this document"
                                                            >
                                                                Regenerate
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Tips */}
                                                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900">
                                                        <p className="font-medium mb-1">Tips</p>
                                                        <ul className="list-disc ml-5 space-y-1">
                                                            <li>Select one option for every question.</li>
                                                            <li>The Submit button enables once all questions are answered.</li>
                                                            <li>After submitting, your score and correct answers are shown.</li>
                                                        </ul>
                                                    </div>

                                                    {/* Quiz Questions */}
                                                    <div className="space-y-6">
                                                        {quiz.questions.map((question, index) => (
                                                            <div key={question.id} className="p-6 bg-gray-50 rounded-lg">
                                                                <h4 className="font-medium text-gray-900 mb-4">
                                                                    {index + 1}. {question.prompt}
                                                                </h4>
                                                                <div className="space-y-2">
                                                                    {question.options.map((option, optionIndex) => {
                                                                        const isSelected = quizAnswers[question.id] === optionIndex;
                                                                        const isCorrect = optionIndex === question.answer_index;
                                                                        const isIncorrectSelected = quizSubmitted && isSelected && !isCorrect;
                                                                        const correctAfterSubmit = quizSubmitted && isCorrect;
                                                                        const base = 'flex items-center p-3 rounded-lg border cursor-pointer transition-colors';
                                                                        const stateClass = quizSubmitted
                                                                            ? (correctAfterSubmit
                                                                                ? 'border-green-400 bg-green-50'
                                                                                : (isIncorrectSelected ? 'border-red-300 bg-red-50' : 'border-gray-200'))
                                                                            : (isSelected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300');
                                                                        return (
                                                                            <label
                                                                                key={optionIndex}
                                                                                className={`${base} ${stateClass}`}
                                                                            >
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`question-${question.id}`}
                                                                                    value={optionIndex}
                                                                                    checked={isSelected}
                                                                                    onChange={() => handleQuizAnswer(question.id, optionIndex)}
                                                                                    className="sr-only"
                                                                                    disabled={quizSubmitted}
                                                                                />
                                                                                <span className="flex-1 text-gray-900">{option}</span>
                                                                                {correctAfterSubmit && (
                                                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                                                )}
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Quiz Actions */}
                                                    <div className="flex gap-4">
                                                        {!quizSubmitted ? (
                                                            <button
                                                                onClick={handleSubmitQuiz}
                                                                disabled={!!loadingQuizByDoc[currentDocId] || Object.keys(quizAnswers).length !== quiz.questions.length}
                                                                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                            >
                                                                {loadingQuizByDoc[currentDocId] ? (
                                                                    <>
                                                                        <LoadingSpinner size="small" />
                                                                        Submitting...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Target className="w-5 h-5" />
                                                                        Submit Quiz
                                                                    </>
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={handleRetryQuiz}
                                                                className="btn-secondary flex items-center gap-2"
                                                            >
                                                                <RotateCcw className="w-5 h-5" />
                                                                Retry Quiz
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleGenerateQuiz()}
                                                            disabled={!!loadingQuizByDoc[currentDocId]}
                                                            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            <RotateCcw className="w-5 h-5" />
                                                            New Quiz
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Flashnotes Tab */}
                                    {activeTab === 'flashcards' && (
                                        <div className="space-y-6">
                                            {flashNotes.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                                        Generate Flashnotes
                                                    </h3>
                                                    <p className="text-gray-500 mb-6">
                                                        Create flashnotes/notes from your document
                                                    </p>
                                                    <div className="flex gap-3 justify-center">
                                                        <button
                                                            onClick={() => handleGenerateFlashNotes(false)}
                                                            disabled={!!loadingNotesByDoc[currentDocId]}
                                                            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            {loadingNotesByDoc[currentDocId] ? (
                                                                <>
                                                                    <LoadingSpinner size="small" />
                                                                    Generating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Brain className="w-5 h-5" />
                                                                    Generate Notes
                                                                </>
                                                            )}
                                                        </button>
                                                        {flashNotes.length > 0 && (
                                                            <button
                                                                onClick={() => handleGenerateFlashNotes(true)}
                                                                disabled={!!loadingNotesByDoc[currentDocId]}
                                                                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                            >
                                                                <RotateCcw className="w-5 h-5" />
                                                                Force Re-generate
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-xl font-semibold text-gray-900">
                                                            Flashnotes: {selectedDocument.original_name || selectedDocument.filename}
                                                        </h3>
                                                        <div className="flex items-center gap-4">
                                                            <button
                                                                onClick={toggleSourceSnippets}
                                                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                                                            >
                                                                {showSourceSnippets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                {showSourceSnippets ? 'Hide' : 'Show'} Source
                                                            </button>
                                                            <p className="text-gray-600">
                                                                {flashNotes.length} notes
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                        {flashNotes.map((note) => {
                                                            const isExpanded = expandedNotes[note.id];
                                                            const formattedContent = formatNoteContent(note.content);
                                                            const metadata = formatNoteMetadata(note);

                                                            return (
                                                                <div key={note.id} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                                                    {/* Note Header */}
                                                                    <div className="p-4 border-b border-gray-100">
                                                                        <div className="flex items-start justify-between mb-2">
                                                                            <h4 className="font-semibold text-gray-900 text-lg leading-tight">
                                                                                {note.title || `FlashNote #${note.id}`}
                                                                            </h4>
                                                                            <button
                                                                                onClick={() => toggleNoteExpansion(note.id)}
                                                                                className="text-gray-400 hover:text-gray-600 text-sm"
                                                                            >
                                                                                {isExpanded ? 'Collapse' : 'Expand'}
                                                                            </button>
                                                                        </div>

                                                                        {/* Metadata */}
                                                                        {metadata.length > 0 && (
                                                                            <div className="flex flex-wrap gap-2 mb-3">
                                                                                {metadata.map((meta, idx) => (
                                                                                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                                                                                        {meta.label === 'Tags' && <Tag className="w-3 h-3" />}
                                                                                        {meta.label === 'Created' && <Calendar className="w-3 h-3" />}
                                                                                        <span className="font-medium">{meta.label}:</span>
                                                                                        <span>{meta.value}</span>
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Note Content */}
                                                                    <div className="p-4">
                                                                        <div className={`text-gray-800 ${isExpanded ? '' : 'max-h-48 overflow-hidden'}`}>
                                                                            {renderFormattedContent(formattedContent)}
                                                                        </div>

                                                                        {!isExpanded && formattedContent.length > 3 && (
                                                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                                                                <button
                                                                                    onClick={() => toggleNoteExpansion(note.id)}
                                                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                                                                >
                                                                                    Show more...
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Source Snippet */}
                                                                    {showSourceSnippets && note.source_snippet && (
                                                                        <div className="px-4 pb-4">
                                                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                                                <h5 className="text-sm font-medium text-blue-900 mb-2">Source Text:</h5>
                                                                                <p className="text-sm text-blue-800 leading-relaxed">
                                                                                    {truncateText(note.source_snippet, 200)}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="flex justify-center gap-3 pt-4">
                                                        <button
                                                            onClick={() => handleGenerateFlashNotes(false)}
                                                            disabled={!!loadingNotesByDoc[currentDocId]}
                                                            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            <RotateCcw className="w-5 h-5" />
                                                            Generate New Set
                                                        </button>
                                                        <button
                                                            onClick={() => handleGenerateFlashNotes(true)}
                                                            disabled={!!loadingNotesByDoc[currentDocId]}
                                                            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                        >
                                                            <RotateCcw className="w-5 h-5" />
                                                            Force Re-generate
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
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
                                        Select a document from the list to generate study aids
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Study Tips */}
                <div className="mt-12">
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Study Tips</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Clock className="w-6 h-6 text-blue-600" />
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Spaced Repetition</h3>
                                <p className="text-sm text-gray-600">
                                    Review flashnotes regularly for better retention
                                </p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Target className="w-6 h-6 text-green-600" />
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Active Recall</h3>
                                <p className="text-sm text-gray-600">
                                    Test yourself with quizzes to strengthen memory pathways
                                </p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                                    <Brain className="w-6 h-6 text-purple-600" />
                                </div>
                                <h3 className="font-medium text-gray-900 mb-2">Mix It Up</h3>
                                <p className="text-sm text-gray-600">
                                    Use both quizzes and flashnotes for comprehensive learning
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudyAidsPage;
