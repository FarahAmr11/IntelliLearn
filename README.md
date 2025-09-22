#  IntelliLearn - AI-Powered Learning Platform

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React](https://img.shields.io/badge/react-18.2.0-blue.svg)](https://reactjs.org/)
[![Flask](https://img.shields.io/badge/flask-3.0.3-green.svg)](https://flask.palletsprojects.com/)

IntelliLearn is an innovative AI-powered learning platform that transforms various types of educational content into structured, study-ready formats. The platform leverages state-of-the-art machine learning models to provide transcription, summarization, translation, flashcard generation, and quiz creation services.

##  What We Achieve

IntelliLearn addresses the growing need for automated tools that can transform any type of learning material into structured, accessible formats. Our platform integrates five core AI services to create a comprehensive learning ecosystem:

###  Key Features

- **Universal Content Processing**: Upload and process PDFs, Word documents, audio files, videos, and plain text
- ** AI-Powered Intelligence**: Advanced ML models for transcription, summarization, and translation
- ** Smart Study Aids**: Automatically generate flashcards, quizzes, and study notes
- ** Multilingual Support**: Support for 20+ languages with intelligent translation
- ** Real-time Processing**: Instant feedback with optimized parallel processing
- ** Modern UI/UX**: Responsive, intuitive interface with drag-and-drop functionality

###  Core AI Services

1. ** Transcription Service**: Audio/video to text using Whisper models
2. ** Summarization Service**: Intelligent text summarization with multiple modes
3. ** Translation Service**: Multi-language translation capabilities
4. ** Flashcard Generation**: Automated study card creation
5. ** Quiz Generation**: Interactive quiz creation with multiple choice questions

##  Architecture

IntelliLearn follows a modern, scalable architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │    │   Flask Backend │    │   AI Services   │
│                 │    │                 │    │                 │
│ • Modern UI/UX  │◄──►│ • REST API      │◄──►│ • Whisper       │
│ • State Mgmt    │    │ • Authentication│    │ • BART/T5       │
│ • File Upload   │    │ • File Handling │    │ • Transformers  │
│ • Real-time UI  │    │ • Database ORM  │    │ • Translation   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

**Frontend:**
- React 18 with hooks and context
- Tailwind CSS for styling
- React Router for navigation
- Axios for API communication
- React Dropzone for file uploads

**Backend:**
- Flask 3.0.3 web framework
- SQLAlchemy ORM with SQLite
- JWT authentication
- Flask-CORS for cross-origin requests
- Marshmallow for serialization

**AI/ML:**
- PyTorch and Transformers
- Whisper for transcription
- BART/T5 for summarization
- Multi-language translation models
- Sentence transformers for embeddings

##  Project Structure

```
IntelliLearn/
├── backend/                 # Flask backend application
│   ├── app/                # Core application
│   │   ├── blueprints/     # API route definitions
│   │   ├── services/       # AI service implementations
│   │   ├── models.py       # Database models
│   │   └── config.py       # Configuration settings
│   ├── docs/               # Backend documentation
│   ├── requirements.txt    # Python dependencies
│   └── README.md          # Backend setup guide
├── frontend/               # React frontend application
│   ├── src/               # Source code
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API service layer
│   │   └── contexts/      # React contexts
│   ├── package.json       # Node.js dependencies
│   └── README.md          # Frontend setup guide
└── README.md              # This file
```

##  Quick Start

### Prerequisites

- Python 3.10 or higher
- Node.js 16 or higher
- pipenv (for Python dependency management)
- npm or yarn (for Node.js dependencies)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/IntelliLearn.git
cd IntelliLearn
```

### 2. Backend Setup

```bash
cd backend
pipenv install
pipenv run flask init-db
pipenv run flask --app wsgi.py --debug run -p 5001
```

 **Detailed backend setup**: See [backend/README.md](backend/README.md)

### 3. Frontend Setup

```bash
cd ../frontend
npm install
npm start
```

**Detailed frontend setup**: See [frontend/README.md](frontend/README.md)

### 4. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001
- **API Documentation**: http://localhost:5001/health

##  Use Cases

### For Students
- **Lecture Transcription**: Convert recorded lectures to text
- **Study Material Summarization**: Get key points from lengthy documents
- **Language Learning**: Translate content for multilingual study
- **Exam Preparation**: Auto-generate quizzes and flashcards

### For Educators
- **Content Creation**: Transform materials into multiple formats
- **Assessment Tools**: Quick quiz and flashcard generation
- **Accessibility**: Make content available in multiple languages
- **Time Saving**: Automate repetitive content processing tasks

### For Professionals
- **Meeting Transcription**: Convert audio meetings to text
- **Document Summarization**: Extract key insights from reports
- **Training Materials**: Create study aids from documentation
- **Multilingual Communication**: Translate content for global teams

##  Security Features

- JWT-based authentication with secure token management
- Password hashing with bcrypt
- Protected API endpoints
- File upload validation and sanitization
- Environment-based configuration management

##  Performance

- **3-5x faster processing** through parallel processing
- **Chunk-based analysis** for large documents
- **Real-time progress tracking** for long-running tasks
- **Optimized model loading** with caching
- **Efficient memory management** for AI operations

##  Multilingual Support

IntelliLearn supports over 20 languages including:
- English, Spanish, French, German
- Chinese (Simplified/Traditional), Japanese, Korean
- Arabic, Hindi, Portuguese, Russian
- And many more...

##  Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow PEP 8 for Python code
- Use ESLint and Prettier for JavaScript/React code
- Write comprehensive tests for new features
- Update documentation for API changes
- Ensure cross-browser compatibility
