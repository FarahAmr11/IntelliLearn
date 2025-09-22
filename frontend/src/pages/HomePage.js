import React from 'react';
import { Link } from 'react-router-dom';
import {
    Upload,
    Zap,
    FileText,
    Brain,
    ChevronDown
} from 'lucide-react';

const HomePage = () => {
    return (
        <div className="min-h-screen bg-white">
            {/* Hero Section */}
            <section className="relative py-28 bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full mb-4">
                                AI-Powered Study Assistant
                            </span>
                            <h1 className="text-5xl font-bold text-gray-900 mb-6">
                                Study Smarter with AI
                            </h1>
                            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                                Turn lectures, notes, or textbook pages into <strong>concise summaries</strong>, <strong>quizzes</strong>, <strong>flashcards</strong>, and <strong>review plans</strong>. Built for high school and university students seeking clarity, speed, and better retention.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <a href="#how" className="btn-primary">
                                    Get Started
                                </a>
                                <a href="#features" className="btn-secondary">
                                    See Features
                                </a>
                            </div>
                        </div>
                        <div className="relative">
                            <img
                                src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=1200&auto=format&fit=crop"
                                alt="Student studying with laptop and notes"
                                className="rounded-2xl shadow-2xl"
                                loading="lazy"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section + Primary CTAs */}
            <section id="features" className="py-20">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            Everything you need to learn faster
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <Link to="/upload" className="card hover:shadow-lg transition-shadow group">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                                <Upload className="w-6 h-6 text-blue-600" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Upload Anything</h3>
                            <p className="text-gray-600">
                                Audio, video, PDF, or DOCX — content is extracted and prepared automatically.
                            </p>
                        </Link>

                        <Link to="/process" className="card hover:shadow-lg transition-shadow group">
                            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-yellow-200 transition-colors">
                                <Zap className="w-6 h-6 text-yellow-600" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Summarize Instantly</h3>
                            <p className="text-gray-600">
                                Concise or detailed summaries optimized for exams or deep revision.
                            </p>
                        </Link>

                        <Link to="/study-aids" className="card hover:shadow-lg transition-shadow group">
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                                <FileText className="w-6 h-6 text-green-600" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Auto-Notes</h3>
                            <p className="text-gray-600">
                                Turn transcripts into structured, readable notes that work with spaced review.
                            </p>
                        </Link>

                        <Link to="/study-aids" className="card hover:shadow-lg transition-shadow group">
                            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
                                <Brain className="w-6 h-6 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Practice Smarter</h3>
                            <p className="text-gray-600">
                                Generate quizzes and flashcards, then build a weekly review plan.
                            </p>
                        </Link>


                    </div>
                </div>
            </section>

            {/* How it Works Section */}
            <section id="how" className="py-20 bg-gray-50">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="flex items-center justify-between mb-16">
                        <h2 className="text-4xl font-bold text-gray-900">How it works</h2>
                        <Link to="/dashboard" className="btn-primary">
                            Open Dashboard
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                1
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Upload your content</h3>
                            <p className="text-gray-600">
                                Upload PDFs, DOCX, or audio/video files. Text is extracted from documents, while audio/video files are transcribed automatically.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                2
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Process & analyze</h3>
                            <p className="text-gray-600">
                                Summarize content (concise, detailed, or full), translate to different languages, or transcribe audio to text.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                3
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Create study materials</h3>
                            <p className="text-gray-600">
                                Generate interactive quizzes and flashnotes from your processed content to enhance learning and retention.
                            </p>
                        </div>

                        <div className="text-center">
                            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                4
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Study & review</h3>
                            <p className="text-gray-600">
                                Access all your materials from the dashboard, take quizzes, review flashnotes, and track your learning progress.
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                5
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Build your schedule</h3>
                            <p className="text-gray-600">
                                Distribute topics across your week and track progress on the dashboard.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="py-20">
                <div className="max-w-4xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            Frequently asked questions
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <details className="group">
                                <summary className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-900">What file types can I upload?</span>
                                    <ChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="p-4 pt-0">
                                    <p className="text-gray-600">
                                        Documents: PDF, DOCX, TXT. Audio: MP3, WAV, M4A, AAC, FLAC, OGG. Video: MP4, MOV, AVI, MKV, WEBM for audio extraction.
                                    </p>
                                </div>
                            </details>

                            <details className="group">
                                <summary className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-900">How do summary modes work?</span>
                                    <ChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="p-4 pt-0">
                                    <p className="text-gray-600">
                                        Choose "Concise" for brief key points, "Detailed" for comprehensive coverage, or "Full" for extensive analysis. You can re-run with different modes anytime.
                                    </p>
                                </div>
                            </details>

                            <details className="group">
                                <summary className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-900">Can I translate content?</span>
                                    <ChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="p-4 pt-0">
                                    <p className="text-gray-600">
                                        Yes! Translate summaries, transcriptions, or raw text between multiple languages including English, Spanish, French, German, Chinese, Japanese, and more.
                                    </p>
                                </div>
                            </details>
                        </div>

                        <div className="space-y-6">
                            <details className="group">
                                <summary className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-900">How accurate is transcription?</span>
                                    <ChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="p-4 pt-0">
                                    <p className="text-gray-600">
                                        Audio and video files are automatically transcribed with high accuracy. Clear audio provides the best results for generating summaries and study materials.
                                    </p>
                                </div>
                            </details>

                            <details className="group">
                                <summary className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-900">What study aids are generated?</span>
                                    <ChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="p-4 pt-0">
                                    <p className="text-gray-600">
                                        Create interactive quizzes with multiple-choice questions and flashnotes for active recall. Customize difficulty levels and number of questions.
                                    </p>
                                </div>
                            </details>

                            <details className="group">
                                <summary className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-900">Can I preview my documents?</span>
                                    <ChevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                                </summary>
                                <div className="p-4 pt-0">
                                    <p className="text-gray-600">
                                        Yes! Preview PDFs, play audio/video files directly in your browser, and download your original files anytime from the document page.
                                    </p>
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
            </section>

            {/* Contact Section */}
            <section id="contact" className="py-20 bg-gray-50">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">Contact</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="card">
                            <h3 className="text-xl font-semibold text-gray-900 mb-4">Get in touch</h3>
                            <p className="text-gray-600 mb-2">
                                Email: <a href="mailto:hello@intellilearn.ai" className="text-primary hover:underline">hello@intellilearn.ai</a>
                            </p>
                            <p className="text-gray-600">
                                We usually respond within 1–2 business days.
                            </p>
                        </div>

                        <div className="card">
                            <h3 className="text-xl font-semibold text-gray-900 mb-4">Supported tech</h3>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">OpenAI Whisper</span>
                                <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">T5 / Flan-T5</span>
                                <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full">MarianMT</span>
                                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">FFmpeg</span>
                                <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full">WCAG 2.2 AA</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer is global via App.js */}
        </div>
    );
};

export default HomePage;
