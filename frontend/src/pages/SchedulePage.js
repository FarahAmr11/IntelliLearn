import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, RotateCcw, Sun, Moon } from 'lucide-react';

const SchedulePage = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [totalHours, setTotalHours] = useState(12);
    const [blockLength, setBlockLength] = useState(45);
    const [subjectsList, setSubjectsList] = useState('');
    const [schedule, setSchedule] = useState([]);
    const [activeTab, setActiveTab] = useState('plan');
    // const [isDarkMode, setIsDarkMode] = useState(false);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Theme toggle functionality
    useEffect(() => {
        const savedTheme = localStorage.getItem('intellilearn-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        // setIsDarkMode(theme === 'dark');
        document.documentElement.setAttribute('data-theme', theme);
    }, []);

    // const toggleTheme = () => {
    //     const newTheme = isDarkMode ? 'light' : 'dark';
    //     setIsDarkMode(!isDarkMode);
    //     document.documentElement.setAttribute('data-theme', newTheme);
    //     localStorage.setItem('intellilearn-theme', newTheme);
    // };

    const generateSchedule = () => {
        const lines = subjectsList.split(/\n+/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) {
            alert('Add at least one subject/topic.');
            return;
        }

        setCurrentStep(2);

        const totalMinutes = totalHours * 60;
        const sessions = Math.max(1, Math.floor(totalMinutes / blockLength));

        const items = lines.map(l => {
            const [subject, topic = ''] = l.split(/—|-/);
            return {
                subject: subject.trim(),
                topic: topic.trim()
            };
        });

        const buckets = Array.from({ length: 7 }, () => []);

        for (let i = 0; i < sessions; i++) {
            const item = items[i % items.length];
            buckets[i % 7].push({
                ...item,
                len: blockLength
            });
        }

        setSchedule(buckets);
        setCurrentStep(3);
        setActiveTab('plan');
    };

    const clearSchedule = () => {
        setSubjectsList('');
        setTotalHours(12);
        setBlockLength(45);
        setSchedule([]);
        setCurrentStep(1);
        setActiveTab('plan');
    };

    const renderEmptySchedule = () => {
        return days.map(day => (
            <div key={day} className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-w-[100px]">
                <h4 className="font-semibold text-gray-900 mb-2 text-center">{day}</h4>
                <div className="text-gray-400 text-center">—</div>
            </div>
        ));
    };

    const renderSchedule = () => {
        if (schedule.length === 0) {
            return renderEmptySchedule();
        }

        return schedule.map((tasks, i) => (
            <div key={days[i]} className="p-4 bg-gray-50 rounded-lg border border-gray-200 min-w-[100px]">
                <h4 className="font-semibold text-gray-900 mb-2 text-center">{days[i]}</h4>
                {tasks.length > 0 ? (
                    <div className="space-y-2">
                        {tasks.map((task, taskIndex) => (
                            <div key={taskIndex} className="p-2 bg-primary text-white rounded text-xs font-medium break-words min-h-[60px] flex flex-col justify-between">
                                <div>
                                    <div className="font-semibold leading-tight">{task.subject}</div>
                                    {task.topic && <div className="opacity-90 text-xs leading-tight mt-1">{task.topic}</div>}
                                </div>
                                <div className="text-xs opacity-75 mt-1">({task.len}m)</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-gray-400 text-center">—</div>
                )}
            </div>
        ));
    };

    const getMetadata = () => {
        if (schedule.length === 0) return { sessions: 0, hours: 0 };

        const totalSessions = schedule.reduce((sum, day) => sum + day.length, 0);
        const totalHoursPlanned = (totalSessions * blockLength / 60).toFixed(1);

        return {
            sessions: totalSessions,
            hours: totalHoursPlanned
        };
    };

    const metadata = getMetadata();

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link to="/study-aids" className="btn-secondary flex items-center gap-2">
                            ← Back
                        </Link>
                        <h1 className="text-4xl font-bold text-gray-900">Build Your Weekly Study Plan</h1>
                    </div>
                    {/* <button
                        onClick={toggleTheme}
                        className="p-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                        aria-label="Toggle dark mode"
                    >
                        {isDarkMode ? (
                            <Sun className="w-5 h-5" />
                        ) : (
                            <Moon className="w-5 h-5" />
                        )}
                    </button> */}
                </div>

                <p className="text-gray-600 mb-8">List subjects & topics, pick hours per week, and generate a balanced plan.</p>

                {/* Steps */}
                <div className="flex items-center gap-4 mb-8">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${currentStep >= 1
                        ? currentStep > 1
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                        }`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep >= 1
                            ? currentStep > 1
                                ? 'bg-green-600 text-white'
                                : 'bg-blue-600 text-white'
                            : 'bg-gray-400 text-white'
                            }`}>1</span>
                        Input
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${currentStep >= 2
                        ? currentStep > 2
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                        }`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep >= 2
                            ? currentStep > 2
                                ? 'bg-green-600 text-white'
                                : 'bg-blue-600 text-white'
                            : 'bg-gray-400 text-white'
                            }`}>2</span>
                        Process
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${currentStep >= 3
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                        }`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep >= 3
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-400 text-white'
                            }`}>3</span>
                        Plan
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-1 gap-8">
                    {/* Input Section */}
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Subjects & Hours</h2>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label htmlFor="hours" className="font-medium text-gray-700">Total hours / week</label>
                                <input
                                    id="hours"
                                    type="number"
                                    min="1"
                                    max="80"
                                    value={totalHours}
                                    onChange={(e) => setTotalHours(parseInt(e.target.value) || 1)}
                                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label htmlFor="block" className="font-medium text-gray-700">Block length</label>
                                <select
                                    id="block"
                                    value={blockLength}
                                    onChange={(e) => setBlockLength(parseInt(e.target.value))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                >
                                    <option value={30}>30 min</option>
                                    <option value={45}>45 min</option>
                                    <option value={60}>60 min</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="list" className="block font-medium text-gray-700 mb-2">
                                    Subjects & topics (one per line)
                                </label>
                                <textarea
                                    id="list"
                                    value={subjectsList}
                                    onChange={(e) => setSubjectsList(e.target.value)}
                                    placeholder="Calculus — derivatives&#10;ML — gradient descent&#10;Chemistry — lab review"
                                    className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={generateSchedule}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    <Calendar className="w-5 h-5" />
                                    Generate
                                </button>
                                <button
                                    onClick={clearSchedule}
                                    className="btn-secondary flex items-center gap-2"
                                >
                                    <RotateCcw className="w-5 h-5" />
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Results Section */}
                    <div className="card">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">Results</h2>

                        {/* Tabs */}
                        <div className="flex mb-6">
                            <button
                                onClick={() => setActiveTab('plan')}
                                className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'plan'
                                    ? 'bg-primary text-white'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }`}
                            >
                                Plan
                            </button>
                            <button
                                onClick={() => setActiveTab('meta')}
                                className={`px-4 py-2 font-medium rounded-lg transition-colors ${activeTab === 'meta'
                                    ? 'bg-primary text-white'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }`}
                            >
                                Metadata
                            </button>
                        </div>

                        {/* Plan Tab */}
                        {activeTab === 'plan' && (
                            <div>
                                <div className="mb-2 text-sm text-gray-600">
                                    <span className="inline-flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                                        </svg>
                                        Scroll horizontally to see all days
                                    </span>
                                </div>
                                <div className="overflow-x-auto border border-gray-200 rounded-lg p-4 bg-gray-50">
                                    <div className="grid grid-cols-7 gap-4 min-w-[700px]">
                                        {renderSchedule()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Metadata Tab */}
                        {activeTab === 'meta' && (
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <strong>Total sessions:</strong>
                                    <span>{metadata.sessions}</span>
                                </div>
                                <div className="flex justify-between">
                                    <strong>Block length:</strong>
                                    <span>{blockLength} min</span>
                                </div>
                                <div className="flex justify-between">
                                    <strong>Hours planned:</strong>
                                    <span>{metadata.hours} h</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SchedulePage;
