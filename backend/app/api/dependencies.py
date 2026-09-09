import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from ..core.config import settings
from ..core.database import get_db
from ..models.user import User, UserRole
from typing import Optional, Tuple

bearer_scheme = HTTPBearer(auto_error=False)


async def _fetch_supabase_user(token: str) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        logger.error("Supabase credentials not configured in backend")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase credentials are not configured in backend",
        )

    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.SUPABASE_ANON_KEY,
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                headers=headers,
            )

        if response.status_code != status.HTTP_200_OK:
            error_detail = response.text[:200] if response.text else "Unknown error"
            logger.warning(f"Supabase auth failed: {response.status_code} - {error_detail}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Supabase token: {error_detail}",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            data = response.json()
        except Exception as e:
            logger.error(f"Failed to parse Supabase response as JSON: {e}")
            logger.error(f"Response text: {response.text[:500]}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid response from Supabase",
            )
        
        # Supabase /auth/v1/user endpoint returns the user object directly
        # But sometimes it might be wrapped in a "user" key or have error messages
        user = None
        if isinstance(data, dict):
            # Check for error messages first
            if "message" in data or "error" in data:
                error_msg = data.get("message") or data.get("error") or "Unknown error"
                logger.warning(f"Supabase returned error: {error_msg}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Supabase error: {error_msg}",
                )
            
            # Try direct user object first (most common format)
            if "id" in data and "email" in data:
                user = data
            # Otherwise try "user" key (alternative format)
            elif "user" in data and isinstance(data.get("user"), dict):
                user = data.get("user")
        
        if not user or not isinstance(user, dict):
            logger.warning(f"Supabase returned invalid user data. Response keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}")
            logger.warning(f"Full response: {str(data)[:500]}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Supabase user payload - user data not found in response",
            )
        
        # Verify user has required fields
        if not user.get("email"):
            logger.warning(f"Supabase user missing email field. User keys: {list(user.keys())}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Supabase user payload - missing email",
            )
        
        # Log for debugging
        logger.info(f"Supabase user authenticated: {user.get('email', 'unknown')}")
        return user
    except httpx.TimeoutException:
        logger.error("Supabase auth request timed out")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Supabase authentication timeout",
        )
    except httpx.RequestError as e:
        logger.error(f"Supabase auth request failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to Supabase: {str(e)}",
        )


def _get_or_create_local_user(db: Session, supabase_user: dict) -> User:
    email = supabase_user.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase user has no email",
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        metadata = supabase_user.get("user_metadata") or {}
        role_value = metadata.get("role", UserRole.BUYER.value)
        try:
            role = UserRole(role_value)
        except ValueError:
            role = UserRole.BUYER

        user = User(
            email=email,
            hashed_password="supabase",
            full_name=metadata.get("full_name"),
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


async def verify_supabase_token(
    token: str,
    db: Optional[Session] = None,
) -> Tuple[dict, Optional[User]]:
    """
    Validate Supabase token and optionally map it to a local user.
    Useful for websocket connections where FastAPI dependencies are unavailable.
    """
    supabase_user = await _fetch_supabase_user(token)
    local_user = _get_or_create_local_user(db, supabase_user) if db else None
    return supabase_user, local_user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    supabase_user = await _fetch_supabase_user(credentials.credentials)
    user = _get_or_create_local_user(db, supabase_user)
    return user



