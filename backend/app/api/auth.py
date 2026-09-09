from fastapi import APIRouter, Depends
from ..models.user import User
from ..schemas.user import UserResponse
from .dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Returns the local user record associated with the authenticated Supabase user.
    """
    return current_user

