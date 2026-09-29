from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session
from typing import List
from ..core.database import get_db
from ..api.dependencies import get_current_user
from ..models.user import User
from ..schemas.business import (
    BusinessCreate,
    BusinessUpdate,
    BusinessOut,
    ClientCreate,
    ClientUpdate,
    ClientOut,
    RequestCreate,
    RequestUpdate,
    RequestOut,
)
from ..services import business_service as svc

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.get("", response_model=List[BusinessOut])
def list_businesses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return svc.list_businesses(db, current_user)


@router.post("", response_model=BusinessOut, status_code=201)
def create_business(
    payload: BusinessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.create_business(db, current_user, payload)


@router.get("/{business_id}", response_model=BusinessOut)
def get_business(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc._owned_business(db, current_user, business_id)


@router.patch("/{business_id}", response_model=BusinessOut)
def update_business(
    business_id: int,
    payload: BusinessUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.update_business(db, current_user, business_id, payload)


@router.delete("/{business_id}", status_code=204)
def delete_business(
    business_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc.delete_business(db, current_user, business_id)
    return None


@router.post("/{business_id}/branding/{kind}", response_model=BusinessOut)
async def upload_branding(
    business_id: int,
    kind: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.save_brand_file(db, current_user, business_id, file, kind)


@router.post("/{business_id}/clients", response_model=ClientOut, status_code=201)
def create_client(
    business_id: int,
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.create_client(db, current_user, business_id, payload)


@router.patch("/{business_id}/clients/{client_id}", response_model=ClientOut)
def update_client(
    business_id: int,
    client_id: int,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.update_client(db, current_user, business_id, client_id, payload)


@router.delete("/{business_id}/clients/{client_id}", status_code=204)
def delete_client(
    business_id: int,
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc.delete_client(db, current_user, business_id, client_id)
    return None


@router.post("/{business_id}/requests", response_model=RequestOut, status_code=201)
def create_request(
    business_id: int,
    payload: RequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.create_request(db, current_user, business_id, payload)


@router.patch("/{business_id}/requests/{request_id}", response_model=RequestOut)
def update_request(
    business_id: int,
    request_id: int,
    payload: RequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.update_request(db, current_user, business_id, request_id, payload)


@router.delete("/{business_id}/requests/{request_id}", status_code=204)
def delete_request(
    business_id: int,
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    svc.delete_request(db, current_user, business_id, request_id)
    return None
