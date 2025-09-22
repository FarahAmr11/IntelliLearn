import { apiClient } from './authService';

export const apiService = {
    // Health check
    async healthCheck() {
        try {
            // Health endpoint is at /health, not /api/health
            const response = await fetch('http://localhost:5001/health');
            return response.json();
        } catch (error) {
            console.error('Health check failed:', error);
            throw error;
        }
    },

    // Document operations
    async uploadDocument(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post('/documents/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    async getDocuments() {
        const response = await apiClient.get('/documents');
        return response.data;
    },

    async getDocument(id) {
        const response = await apiClient.get(`/documents/${id}`);
        return response.data;
    },

    async deleteDocument(id) {
        const response = await apiClient.delete(`/documents/${id}`);
        return response.data;
    },

    // Processing operations (document-aware)
    async transcribe(documentId, force = false) {
        const response = await apiClient.post('/transcribe', {
            document_id: documentId,
            force
        });
        return response.data;
    },

    async summarize(documentId, text = null, mode = 'full', force = false) {
        const payload = { mode, force };
        if (documentId) payload.document_id = documentId;
        if (text) payload.text = text;
        const response = await apiClient.post('/summarize', payload);
        return response.data;
    },

    async translate(documentId, text = null, targetLang, sourceLang = null, force = false) {
        const payload = { target_lang: targetLang, force };
        if (documentId) payload.document_id = documentId;
        if (text) payload.text = text;
        if (sourceLang) payload.source_lang = sourceLang;

        const response = await apiClient.post('/translate', payload);
        return response.data;
    },

    // Processing operations (text-only)
    async textSummarize(text, mode = 'concise') {
        const response = await apiClient.post('/text/summarize', { text, mode });
        return response.data;
    },

    async textTranslate(text, targetLang, sourceLang = null) {
        const payload = { text, target_lang: targetLang };
        if (sourceLang) payload.source_lang = sourceLang;
        const response = await apiClient.post('/text/translate', payload);
        return response.data;
    },

    // Job listings
    async getJobs(params = {}) {
        const search = new URLSearchParams();
        if (params.document_id !== undefined) search.set('document_id', String(params.document_id));
        if (params.type) search.set('type', params.type);
        if (params.limit) search.set('limit', String(params.limit));
        const qs = search.toString();
        const response = await apiClient.get(`/jobs${qs ? `?${qs}` : ''}`);
        return response.data;
    },

    async getDocumentJobs(docId) {
        const response = await apiClient.get(`/documents/${docId}/jobs`);
        return response.data;
    },

    async startProcessing(documentId, operations) {
        const response = await apiClient.post('/start', {
            document_id: documentId,
            operations
        });
        return response.data;
    },

    async getJob(jobId) {
        const response = await apiClient.get(`/jobs/${jobId}`);
        return response.data;
    },

    async getJobsAll() {
        const response = await apiClient.get('/jobs');
        return response.data;
    },

    // Dashboard
    async getDashboardSummary() {
        console.log('Making request to:', `${apiClient.defaults.baseURL}/dashboard/summary`);
        const response = await apiClient.get('/dashboard/summary');
        return response.data;
    },

    // Quiz operations
    async generateQuiz(documentId, numQuestions, difficulty, title, force = false) {
        const payload = { document_id: documentId, num_questions: numQuestions, difficulty, title };
        if (force) payload.force = true;
        const response = await apiClient.post('/quizzes', payload);
        return response.data;
    },

    async getQuiz(quizId) {
        const response = await apiClient.get(`/quizzes/${quizId}`);
        return response.data;
    },

    async submitQuizAttempt(quizId, answersArray) {
        // answersArray: [{ ordinal, selected_index }]
        const response = await apiClient.post(`/quizzes/${quizId}/attempt`, {
            answers: answersArray
        });
        return response.data;
    },

    // FlashNote operations
    async generateFlashNotes(documentId, count = 10, density = 'study', force = false, title) {
        const payload = { count, density, force };
        if (documentId) payload.document_id = documentId;
        if (title) payload.title = title;
        const response = await apiClient.post('/flashnotes', payload);
        return response.data;
    },

    async listFlashNotes(documentId, limit = 50, offset = 0) {
        const search = new URLSearchParams();
        if (documentId) search.set('document_id', String(documentId));
        search.set('limit', String(limit));
        search.set('offset', String(offset));
        const response = await apiClient.get(`/flashnotes?${search.toString()}`);
        return response.data;
    },

    async getFlashNote(id) {
        const response = await apiClient.get(`/flashnotes/${id}`);
        return response.data;
    }
};
