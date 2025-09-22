# 🔧 IntelliLearn Backend

A powerful Flask-based backend for the IntelliLearn AI-powered learning platform. This backend provides RESTful APIs for authentication, document management, and AI-powered content processing services.

## 🚀 Features

### Core Services
- **🎤 Transcription**: Audio/video to text using Whisper models
- **📝 Summarization**: Intelligent text summarization with BART/T5
- **🌐 Translation**: Multi-language translation capabilities
- **📚 Flashcard Generation**: Automated study card creation
- **❓ Quiz Generation**: Interactive quiz creation with MCQs

### Backend Capabilities
- **🔐 JWT Authentication**: Secure user authentication and authorization
- **📁 File Management**: Upload, storage, and retrieval of documents
- **🗄️ Database ORM**: SQLAlchemy with SQLite for data persistence
- **⚡ Parallel Processing**: Multi-threaded AI operations for performance
- **🔄 Job Tracking**: Real-time processing status and progress
- **🛡️ Security**: Password hashing, input validation, and CORS support

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flask Backend                            │
├─────────────────────────────────────────────────────────────────┤
│  API Layer (Blueprints)                                        │
│  ├── auth.py          # Authentication endpoints               │
│  ├── documents.py     # Document management                    │
│  ├── processing.py    # AI processing endpoints               │
│  ├── quiz.py          # Quiz generation & management          │
│  └── flashnotes.py    # Flashcard generation                  │
├─────────────────────────────────────────────────────────────────┤
│  Service Layer                                                  │
│  ├── transcribe_service.py    # Whisper transcription         │
│  ├── summary_service.py       # BART/T5 summarization         │
│  ├── translate_service.py     # Translation service           │
│  ├── quiz_service.py          # Quiz generation logic         │
│  └── notes_service.py         # Flashcard creation            │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  ├── models.py        # SQLAlchemy models                      │
│  ├── extensions.py    # Flask extensions (DB, CORS, etc.)     │
│  └── config.py        # Configuration management              │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Python**: 3.10 or higher
- **pipenv**: For dependency management
- **ffmpeg**: For audio/video processing (install via system package manager)
- **tesseract**: For OCR functionality (optional)

### System Dependencies

**macOS:**
```bash
brew install ffmpeg tesseract
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg tesseract-ocr
```

**Windows:**
- Download ffmpeg from https://ffmpeg.org/download.html
- Download tesseract from https://github.com/UB-Mannheim/tesseract/wiki

## 🚀 Setup Instructions

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Install Dependencies

Using pipenv (recommended):
```bash
pipenv install
```

Using pip (alternative):
```bash
pip install -r requirements.txt
```

### 3. Environment Configuration

Create a `.env` file in the backend directory:

```bash
# .env
SECRET_KEY=your-secret-key-here
JWT_SECRET=your-jwt-secret-here
DATABASE_URL=sqlite:///instance/app.db
UPLOAD_FOLDER=uploads
DEBUG=True

# Optional: AI Model Configuration
WHISPER_MODEL_SIZE=base  # tiny, base, small, medium, large
SUMMARIZATION_MODEL=facebook/bart-large-cnn
TRANSLATION_MODEL=Helsinki-NLP/opus-mt-en-de
```

### 4. Initialize Database

Create database tables:
```bash
pipenv run flask init-db
```

### 5. Start Development Server

```bash
pipenv run flask --app wsgi.py --debug run -p 5001
```

The backend will be available at: http://localhost:5001

## 📁 Project Structure

```
backend/
├── app/
│   ├── __init__.py              # Flask app factory
│   ├── __main__.py              # Entry point
│   ├── config.py                # Configuration classes
│   ├── extensions.py            # Flask extensions
│   ├── models.py                # Database models
│   ├── blueprints/              # API route handlers
│   │   ├── auth.py              # Authentication routes
│   │   ├── documents.py         # Document management
│   │   ├── processing.py        # AI processing endpoints
│   │   ├── quiz.py              # Quiz generation
│   │   ├── flashnotes.py        # Flashcard generation
│   │   └── main.py              # General routes
│   ├── services/                # Business logic layer
│   │   ├── transcribe_service.py
│   │   ├── summary_service.py
│   │   ├── translate_service.py
│   │   ├── quiz_service.py
│   │   └── notes_service.py
│   └── utils/                   # Utility functions
│       ├── auth.py              # Auth helpers
│       └── extract.py           # Text extraction
├── docs/                        # API documentation
├── instance/                    # Instance-specific files
│   └── app.db                   # SQLite database
├── uploads/                     # File upload directory
├── requirements.txt             # Python dependencies
├── Pipfile                      # Pipenv configuration
├── wsgi.py                      # WSGI entry point
└── README.md                    # This file
```

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | User registration |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/forgot-password` | Password reset request |
| POST | `/api/auth/reset-password` | Password reset confirmation |

### Document Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List user documents |
| POST | `/api/documents/upload` | Upload new document |
| GET | `/api/documents/{id}` | Get document details |
| DELETE | `/api/documents/{id}` | Delete document |
| GET | `/api/documents/download/{id}` | Download document |

### AI Processing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/processing/transcribe` | Transcribe audio/video |
| POST | `/api/processing/summarize` | Summarize text/document |
| POST | `/api/processing/translate` | Translate text |
| GET | `/api/processing/jobs/{id}` | Get processing job status |
| GET | `/api/processing/dashboard/summary` | Dashboard analytics |

### Quiz Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/quiz/generate` | Generate quiz from content |
| GET | `/api/quiz/{id}` | Get quiz details |
| POST | `/api/quiz/{id}/attempt` | Submit quiz attempt |
| GET | `/api/quiz/{id}/attempts` | Get quiz attempts |

### Flashcards

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/flashnotes/generate` | Generate flashcards |
| GET | `/api/flashnotes` | List user flashcards |
| GET | `/api/flashnotes/{id}` | Get flashcard details |
| DELETE | `/api/flashnotes/{id}` | Delete flashcard |

## 🤖 AI Models & Services

### Transcription Service
- **Model**: OpenAI Whisper (configurable size)
- **Formats**: MP3, WAV, MP4, AVI, MOV
- **Features**: Automatic language detection, timestamp generation
- **Languages**: 99+ languages supported

### Summarization Service
- **Model**: Facebook BART-large-CNN / Google T5
- **Modes**: Brief, detailed, key points
- **Features**: Chunk-based processing for long documents
- **Input**: Text, PDF, DOCX files

### Translation Service
- **Model**: Helsinki-NLP Opus models
- **Languages**: 20+ language pairs
- **Features**: Automatic source language detection
- **Quality**: Production-ready translation quality

### Quiz Generation
- **Technology**: Custom prompt engineering with LLMs
- **Question Types**: Multiple choice (4 options)
- **Difficulty**: Configurable difficulty levels
- **Features**: Answer explanations, topic categorization

### Flashcard Generation
- **Technology**: Extractive and abstractive techniques
- **Format**: Question-answer pairs
- **Features**: Source snippet tracking, tagging system
- **Customization**: Length and focus area control

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Flask secret key | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `DATABASE_URL` | Database connection string | `sqlite:///instance/app.db` |
| `UPLOAD_FOLDER` | File upload directory | `uploads` |
| `DEBUG` | Debug mode | `False` |
| `WHISPER_MODEL_SIZE` | Whisper model size | `base` |

### Model Configuration

Edit `app/config.py` to customize AI model settings:

```python
class Config:
    # Whisper Settings
    WHISPER_MODEL_SIZE = "base"  # tiny, base, small, medium, large
    
    # Summarization Settings
    SUMMARIZATION_MODEL = "facebook/bart-large-cnn"
    MAX_CHUNK_SIZE = 1024
    
    # Translation Settings
    TRANSLATION_MODEL_PREFIX = "Helsinki-NLP/opus-mt"
    
    # Processing Settings
    MAX_WORKERS = 4  # Parallel processing threads
    JOB_TIMEOUT = 3600  # Job timeout in seconds
```

## 🧪 Testing

Run the test suite:

```bash
pipenv run pytest
```

Run specific test modules:

```bash
pipenv run pytest tests/test_auth.py
pipenv run pytest tests/test_processing.py
```

## 📊 Performance Optimization

### Database Optimization
- Use connection pooling for production
- Add database indexes for frequently queried fields
- Consider PostgreSQL for production deployments

### AI Model Optimization
- Cache loaded models in memory
- Use GPU acceleration if available
- Implement model warm-up for faster first requests

### File Processing
- Implement chunked file uploads for large files
- Add file compression for storage optimization
- Use background tasks for time-consuming operations

## 🚀 Production Deployment

### Using Gunicorn

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app
```

### Using Docker

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 5001

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5001", "wsgi:app"]
```

### Environment Setup

For production, ensure:
- Set `DEBUG=False`
- Use a production database (PostgreSQL recommended)
- Configure proper secret keys
- Set up SSL certificates
- Implement rate limiting
- Configure logging and monitoring

## 🔧 Development

### Adding New AI Services

1. Create service file in `app/services/`
2. Implement the service class with required methods
3. Add API endpoints in appropriate blueprint
4. Update database models if needed
5. Add tests for the new functionality

### Code Style

- Follow PEP 8 for Python code
- Use type hints where possible
- Write docstrings for all functions
- Use meaningful variable and function names
- Implement proper error handling

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-ai-service

# Make changes and test
# ... development work ...

# Commit and push
git add .
git commit -m "Add new AI service for X"
git push origin feature/new-ai-service

# Create pull request
```

## 🐛 Troubleshooting

### Common Issues

**ImportError: No module named 'torch'**
```bash
pipenv install torch torchvision torchaudio
```

**FFmpeg not found**
```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt install ffmpeg
```

**Database connection errors**
```bash
# Reset database
rm instance/app.db
pipenv run flask init-db
```

**Model download issues**
```bash
# Clear cache and retry
rm -rf ~/.cache/huggingface/
python -c "from transformers import pipeline; pipeline('summarization')"
```

### Logging

Enable detailed logging by setting:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 📞 Support

- **Issues**: Report bugs and feature requests on GitHub
- **Documentation**: Check the `docs/` directory for detailed API docs
- **Community**: Join our Discord server for discussions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

**Backend developed with ❤️ using Flask and modern AI technologies**