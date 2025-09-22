// Language code to full name mapping
export const LANGUAGE_MAP = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ar': 'Arabic',
    'hi': 'Hindi'
};

// Get full language name from code
export const getLanguageName = (code) => {
    if (!code) return '';
    return LANGUAGE_MAP[code.toLowerCase()] || code.toUpperCase();
};

// Get language code from full name (reverse lookup)
export const getLanguageCode = (name) => {
    if (!name) return '';
    const entry = Object.entries(LANGUAGE_MAP).find(([code, fullName]) =>
        fullName.toLowerCase() === name.toLowerCase()
    );
    return entry ? entry[0] : name;
};

// Language options for dropdowns
export const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'zh', label: 'Chinese' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'ru', label: 'Russian' },
    { value: 'ar', label: 'Arabic' },
    { value: 'hi', label: 'Hindi' }
];
