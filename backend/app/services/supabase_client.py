from supabase import Client, create_client
from ..core.config import settings


def get_supabase_client() -> Client | None:
    """
    Lazily create a Supabase client using the configured credentials.
    Returns None if the configuration is incomplete.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None

    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )


supabase_client: Client | None = get_supabase_client()

