from app import create_app
import os

app = create_app()
PORT = os.getenv('PORT', 5001)
DEBUG = os.getenv("DEBUG", True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=DEBUG)


