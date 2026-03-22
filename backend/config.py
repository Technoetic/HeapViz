import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

BIZROUTER_API_KEY = os.environ.get("BIZROUTER_API_KEY", "")
BIZROUTER_API_URL = "https://bizrouter.ai/api/v1/chat/completions"

HOST = "127.0.0.1"
PORT = 3000
CORS_ORIGINS = ["*"]
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "dist")
