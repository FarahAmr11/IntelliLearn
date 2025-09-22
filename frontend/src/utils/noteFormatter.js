// Utility functions for formatting FlashNote content

// Convert markdown-like content to HTML-like structure for better display
export const formatNoteContent = (content) => {
    if (!content) return '';

    // Split content into lines and process each line
    const lines = content.split('\n');
    const formattedLines = lines.map(line => {
        // Handle headers (### Notes, ##, #)
        if (line.startsWith('### ')) {
            return { type: 'h3', content: line.replace('### ', '') };
        } else if (line.startsWith('## ')) {
            return { type: 'h2', content: line.replace('## ', '') };
        } else if (line.startsWith('# ')) {
            return { type: 'h1', content: line.replace('# ', '') };
        }
        // Handle bullet points
        else if (line.startsWith('- ')) {
            return { type: 'bullet', content: line.replace('- ', '') };
        }
        // Handle numbered lists
        else if (/^\d+\.\s/.test(line)) {
            return { type: 'numbered', content: line.replace(/^\d+\.\s/, '') };
        }
        // Handle regular text
        else if (line.trim()) {
            return { type: 'text', content: line };
        }
        // Handle empty lines
        else {
            return { type: 'empty', content: '' };
        }
    });

    return formattedLines;
};

// Render formatted content as JSX
export const renderFormattedContent = (formattedLines) => {
    return formattedLines.map((line, index) => {
        switch (line.type) {
            case 'h1':
                return (
                    <h1 key={index} className="text-2xl font-bold text-gray-900 mb-4 mt-6 first:mt-0">
                        {line.content}
                    </h1>
                );
            case 'h2':
                return (
                    <h2 key={index} className="text-xl font-semibold text-gray-900 mb-3 mt-5 first:mt-0">
                        {line.content}
                    </h2>
                );
            case 'h3':
                return (
                    <h3 key={index} className="text-lg font-medium text-gray-900 mb-2 mt-4 first:mt-0">
                        {line.content}
                    </h3>
                );
            case 'bullet':
                return (
                    <div key={index} className="flex items-start mb-2">
                        <span className="text-blue-600 mr-2 mt-1">•</span>
                        <span className="text-gray-800">{line.content}</span>
                    </div>
                );
            case 'numbered':
                return (
                    <div key={index} className="flex items-start mb-2">
                        <span className="text-blue-600 mr-2 mt-1 font-medium">1.</span>
                        <span className="text-gray-800">{line.content}</span>
                    </div>
                );
            case 'text':
                return (
                    <p key={index} className="text-gray-800 mb-2 leading-relaxed">
                        {line.content}
                    </p>
                );
            case 'empty':
                return <div key={index} className="h-2"></div>;
            default:
                return (
                    <p key={index} className="text-gray-800 mb-2">
                        {line.content}
                    </p>
                );
        }
    });
};

// Format note metadata for display
export const formatNoteMetadata = (note) => {
    const metadata = [];

    if (note.tags) {
        metadata.push({ label: 'Tags', value: note.tags });
    }

    if (note.meta?.density) {
        metadata.push({ label: 'Density', value: note.meta.density });
    }

    if (note.created_at) {
        const date = new Date(note.created_at);
        metadata.push({ label: 'Created', value: date.toLocaleDateString() });
    }

    return metadata;
};

// Truncate text for preview
export const truncateText = (text, maxLength = 150) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

// Extract key takeaways from note content
export const extractKeyTakeaways = (content) => {
    if (!content) return [];

    const lines = content.split('\n');
    const takeaways = [];

    lines.forEach(line => {
        if (line.includes('Key Takeaways:') || line.includes('Key Points:')) {
            const text = line.replace(/.*Key (Takeaways|Points):\s*/, '');
            if (text.trim()) {
                takeaways.push(text.trim());
            }
        }
    });

    return takeaways;
};
