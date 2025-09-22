from .summary_service import SummaryService
from .transcribe_service import TranscribeService
from .translate_service import TranslateService
from .quiz_service import QuizService
from .notes_service import NotesService
summarizer = SummaryService()
transcriber = TranscribeService()
translator = TranslateService()
notes_builder = NotesService()
quiz_builder = QuizService()
