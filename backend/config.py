import os

SUPABASE_URL = "https://dxaehcocrbvhatyfmrvp.supabase.co"
SUPABASE_KEY = "sb_publishable_5_U3dll4HB9fAXOxmgm83w_wnOiei-e"

BIZROUTER_API_KEY = os.environ.get("BIZROUTER_API_KEY", "")
BIZROUTER_API_URL = "https://bizrouter.ai/api/v1/chat/completions"

HOST = "127.0.0.1"
PORT = 3000
CORS_ORIGINS = ["*"]
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "dist")
