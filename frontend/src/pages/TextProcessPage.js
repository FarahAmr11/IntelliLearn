import React, { useState } from 'react';
import { apiService } from '../services/apiService';
import { FileText, Languages, Sparkles } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import { LANGUAGE_OPTIONS } from '../utils/languageUtils';

const TextProcessPage = () => {
    const [text, setText] = useState('');
    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({
        summary: '',
        translation: ''
    });
    const [summaryMode, setSummaryMode] = useState('concise');
    const [targetLang, setTargetLang] = useState('en');
    const [sourceLang, setSourceLang] = useState('');

    const handleProcess = async (action) => {
        if (!text.trim()) {
            toast.error('Please enter some text first');
            return;
        }

        setLoading(true);
        try {
            let res;
            if (action === 'summary') {
                res = await apiService.textSummarize(text.trim(), summaryMode);
                const out = res.summary || res.result?.steps?.find(s => s.name === 'summarize')?.output?.summary || '';
                setResults(prev => ({ ...prev, summary: out }));
                setActiveTab('summary');
            } else if (action === 'translate') {
                res = await apiService.textTranslate(text.trim(), targetLang, sourceLang || null);
                const out = res.translation || res.result?.steps?.find(s => s.name === 'translate')?.output?.translation || '';
                setResults(prev => ({ ...prev, translation: out }));
                setActiveTab('translation');
            }
            toast.success(`${action} completed successfully`);
        } catch (error) {
            toast.error(`Failed to ${action}: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setText('');
        setResults({ summary: '', translation: '' });
    };

    const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="max-w-4xl mx-auto px-4">
                <h1 className="text-4xl font-bold text-gray-900 mb-8">Text Processing</h1>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Input Section */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-gray-900">Input Text</h2>
                            <button
                                onClick={handleClear}
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                Clear
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Enter your text
                                </label>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    className="input-field min-h-[300px] resize-none"
                                    placeholder="Paste or type your text here..."
                                />
                                <div className="flex justify-between items-center mt-2">
                                    <p className="text-sm text-gray-500">
                                        {wordCount} words
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        {text.length} characters
                                    </p>
                                </div>
                            </div>

                            {/* Options */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Summary Mode</label>
                                    <select className="input-field" value={summaryMode} onChange={(e) => setSummaryMode(e.target.value)}>
                                        <option value="concise">Concise</option>
                                        <option value="detailed">Detailed</option>
                                        <option value="full">Full</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
                                    <select className="input-field" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                                        {LANGUAGE_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Source Language (Optional)</label>
                                    <select className="input-field" value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                                        <option value="">Auto-detect</option>
                                        {LANGUAGE_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleProcess('summary')}
                                    disabled={loading || !text.trim()}
                                    className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading && activeTab === 'summary' ? (
                                        <>
                                            <LoadingSpinner size="small" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            Summarize
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleProcess('translate')}
                                    disabled={loading || !text.trim()}
                                    className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading && activeTab === 'translation' ? (
                                        <>
                                            <LoadingSpinner size="small" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Languages className="w-4 h-4" />
                                            Translate
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Results Section */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-gray-900">Results</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTab('summary')}
                                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${activeTab === 'summary'
                                        ? 'bg-primary text-white'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                >
                                    Summary
                                </button>
                                <button
                                    onClick={() => setActiveTab('translation')}
                                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${activeTab === 'translation'
                                        ? 'bg-primary text-white'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                >
                                    Translation
                                </button>
                            </div>
                        </div>

                        <div className="min-h-[300px]">
                            {activeTab === 'summary' && (
                                <div>
                                    {results.summary ? (
                                        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Sparkles className="w-5 h-5 text-primary" />
                                                <h3 className="font-medium text-gray-900">Summary</h3>
                                            </div>
                                            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                                                {results.summary}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-center">
                                            <div>
                                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-500">No summary generated yet</p>
                                                <p className="text-sm text-gray-400">
                                                    Click "Summarize" to generate a summary
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'translation' && (
                                <div>
                                    {results.translation ? (
                                        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Languages className="w-5 h-5 text-primary" />
                                                <h3 className="font-medium text-gray-900">Translation</h3>
                                            </div>
                                            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                                                {results.translation}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-center">
                                            <div>
                                                <Languages className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-500">No translation generated yet</p>
                                                <p className="text-sm text-gray-400">
                                                    Click "Translate" to generate a translation
                                                </p>
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
    );
};

export default TextProcessPage;
