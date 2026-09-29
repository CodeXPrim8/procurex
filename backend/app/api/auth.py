from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..models.user import User
from ..schemas.user import UserPreferencesIn, UserResponse
from ..services.regions import RegionError, normalize_country, normalize_currency
from .dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Returns the local user record associated with the authenticated Supabase user.
    """
    return current_user


@router.put("/me/preferences", response_model=UserResponse)
def update_preferences(
    payload: UserPreferencesIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the buyer's region (drives which listings they see) and display currency."""
    try:
        country = normalize_country(payload.country)
        currency = normalize_currency(payload.preferred_currency)
    except RegionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    user = db.query(User).filter(User.id == current_user.id).first()
    user.country = country
    user.preferred_currency = currency
    db.commit()
    db.refresh(user)
    return user
