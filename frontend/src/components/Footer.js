import React from 'react';

const Footer = () => {
    const year = new Date().getFullYear();
    return (
        <footer className="mt-12 border-t bg-white">
            <div className="max-w-6xl mx-auto px-4 py-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
                    <div>
                        <h3 className="text-gray-900 font-semibold mb-3">IntelliLearn</h3>
                        <p className="text-gray-600 mb-3">AI-powered tools to summarize, translate, transcribe, generate notes and quizzes.</p>
                        <p className="text-gray-600">© {year} IntelliLearn</p>
                    </div>
                    <div>
                        <h4 className="text-gray-900 font-semibold mb-3">Product</h4>
                        <ul className="space-y-2 text-gray-600">
                            <li><a href="/dashboard" className="hover:text-gray-900">Dashboard</a></li>
                            <li><a href="/upload" className="hover:text-gray-900">Upload</a></li>
                            <li><a href="/process" className="hover:text-gray-900">Processes</a></li>
                            <li><a href="/study-aids" className="hover:text-gray-900">Study Aids</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-gray-900 font-semibold mb-3">Resources</h4>
                        <ul className="space-y-2 text-gray-600">
                            <li><a href="/#features" className="hover:text-gray-900">Features</a></li>
                            <li><a href="/#how" className="hover:text-gray-900">How it works</a></li>
                            <li><a href="/#faq" className="hover:text-gray-900">FAQ</a></li>
                            <li><a href="/auth" className="hover:text-gray-900">Sign in</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-gray-900 font-semibold mb-3">Stay in touch</h4>
                        <form className="flex gap-2 mb-3" onSubmit={(e) => e.preventDefault()}>
                            <input type="email" className="input-field flex-1" placeholder="Your email" aria-label="Email" />
                            <button type="submit" className="btn-primary">Subscribe</button>
                        </form>
                        <div className="flex items-center gap-4 text-gray-600">
                            <a href="mailto:hello@intellilearn.ai" className="hover:text-gray-900">hello@intellilearn.ai</a>
                            <span className="text-gray-300">•</span>
                            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-gray-900">GitHub</a>
                        </div>
                    </div>
                </div>
                <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500">
                    <p>Built with care for learners.</p>
                    <div className="flex items-center gap-4 mt-3 sm:mt-0">
                        <a href="/privacy" className="hover:text-gray-800">Privacy</a>
                        <a href="/terms" className="hover:text-gray-800">Terms</a>
                        <a href="/contact" className="hover:text-gray-800">Contact</a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;


