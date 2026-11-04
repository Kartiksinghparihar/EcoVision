"""Supabase access using the SERVICE ROLE key — server side only, never ship to the browser."""
import os
from supabase import create_client, Client

_client: Client | None = None


def db() -> Client:
    global _client
    if _client is None:
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    return _client
