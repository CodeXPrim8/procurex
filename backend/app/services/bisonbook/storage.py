"""BisonBook cloud storage: Supabase Storage when configured, local uploads/ otherwise."""
from __future__ import annotations

import logging
import mimetypes
import re
import uuid
from pathlib import Path
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.config import settings
from ...models.bisonbook import VendorFile
from ...models.vendor import Vendor
from .common import BisonBookError

logger = logging.getLogger(__name__)

LOCAL_ROOT = Path("uploads/bisonbook")
SIGNED_URL_SECONDS = 60 * 10
MAX_FILE_BYTES = 25 * 1024 * 1024


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", Path(name or "file").name).strip() or "file"
    return cleaned[:120]


def _safe_folder(folder: Optional[str]) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9&_ -]", "", (folder or "General")).strip()
    return cleaned[:60] or "General"


def _supabase():
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None
    try:
        from ..supabase_client import get_supabase_client

        return get_supabase_client()
    except Exception as exc:  # package missing or bad config
        logger.warning("Supabase storage unavailable, using local storage: %s", exc)
        return None


def quota_bytes() -> int:
    return int(settings.BISONBOOK_STORAGE_QUOTA_MB) * 1024 * 1024


def used_bytes(db: Session, vendor: Vendor) -> int:
    total = db.query(func.coalesce(func.sum(VendorFile.size), 0)).filter(VendorFile.vendor_id == vendor.id).scalar()
    return int(total or 0)


def record_vendor_file(
    db: Session,
    vendor: Vendor,
    *,
    folder: str,
    name: str,
    url: str,
    mime: Optional[str] = None,
    size: int = 0,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    storage_path: Optional[str] = None,
    storage_backend: str = "local",
) -> VendorFile:
    """Index a file that already exists (e.g. KYC upload). Caller commits."""
    row = VendorFile(
        vendor_id=vendor.id,
        folder=_safe_folder(folder),
        name=_safe_name(name),
        url=url,
        mime=mime or mimetypes.guess_type(name)[0],
        size=int(size or 0),
        source_type=source_type,
        source_id=source_id,
        storage_path=storage_path,
        storage_backend=storage_backend,
    )
    db.add(row)
    return row


def save_vendor_bytes(
    db: Session,
    vendor: Vendor,
    data: bytes,
    *,
    filename: str,
    folder: str = "General",
    mime: Optional[str] = None,
    source_type: str = "upload",
    source_id: Optional[int] = None,
    replace_source: bool = False,
) -> VendorFile:
    """Store bytes for a vendor and index them. Caller commits."""
    if not data:
        raise BisonBookError("The file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise BisonBookError("Files must be 25MB or smaller.")
    if replace_source and source_id is not None:
        for old in (
            db.query(VendorFile)
            .filter(
                VendorFile.vendor_id == vendor.id,
                VendorFile.source_type == source_type,
                VendorFile.source_id == source_id,
            )
            .all()
        ):
            delete_vendor_file(db, old)
    if used_bytes(db, vendor) + len(data) > quota_bytes():
        raise BisonBookError(
            f"Storage is full ({settings.BISONBOOK_STORAGE_QUOTA_MB} MB plan limit). Delete files or upgrade."
        )

    name = _safe_name(filename)
    folder_name = _safe_folder(folder)
    mime = mime or mimetypes.guess_type(name)[0] or "application/octet-stream"
    key = f"vendors/{vendor.id}/{re.sub(r'[^A-Za-z0-9]+', '-', folder_name).lower()}/{uuid.uuid4().hex}_{name.replace(' ', '_')}"

    client = _supabase()
    if client is not None:
        try:
            bucket = client.storage.from_(settings.SUPABASE_STORAGE_BUCKET)
            bucket.upload(key, data, {"content-type": mime, "upsert": "true"})
            row = record_vendor_file(
                db, vendor, folder=folder_name, name=name, url=f"supabase://{settings.SUPABASE_STORAGE_BUCKET}/{key}",
                mime=mime, size=len(data), source_type=source_type, source_id=source_id,
                storage_path=key, storage_backend="supabase",
            )
            db.flush()
            return row
        except Exception as exc:
            logger.warning("Supabase upload failed, falling back to local storage: %s", exc)

    path = LOCAL_ROOT / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    row = record_vendor_file(
        db, vendor, folder=folder_name, name=name, url="/" + path.as_posix(),
        mime=mime, size=len(data), source_type=source_type, source_id=source_id,
        storage_path=str(path), storage_backend="local",
    )
    db.flush()
    return row


def file_access_url(row: VendorFile) -> str:
    """URL the browser can open. Supabase files get a short-lived signed URL."""
    if row.storage_backend == "supabase" and row.storage_path:
        client = _supabase()
        if client is not None:
            try:
                signed = client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
                    row.storage_path, SIGNED_URL_SECONDS
                )
                return signed.get("signedURL") or signed.get("signedUrl") or row.url
            except Exception as exc:
                logger.warning("Could not sign Supabase URL: %s", exc)
    return row.url


def access_url(url: Optional[str]) -> Optional[str]:
    """Turn a stored supabase://bucket/key reference into a short-lived signed URL."""
    if not url or not url.startswith("supabase://"):
        return url
    _, _, rest = url.partition("supabase://")
    bucket, _, key = rest.partition("/")
    client = _supabase()
    if client is None:
        return url
    try:
        signed = client.storage.from_(bucket).create_signed_url(key, SIGNED_URL_SECONDS)
        return signed.get("signedURL") or signed.get("signedUrl") or url
    except Exception as exc:
        logger.warning("Could not sign Supabase URL: %s", exc)
        return url


def read_vendor_file(row: VendorFile) -> Optional[bytes]:
    if row.storage_backend == "supabase" and row.storage_path:
        client = _supabase()
        if client is not None:
            try:
                return client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).download(row.storage_path)
            except Exception as exc:
                logger.warning("Supabase download failed: %s", exc)
        return None
    if row.storage_path and Path(row.storage_path).exists():
        return Path(row.storage_path).read_bytes()
    if row.url.startswith("/uploads/"):
        path = Path(row.url.lstrip("/"))
        if path.exists():
            return path.read_bytes()
    return None


def delete_vendor_file(db: Session, row: VendorFile) -> None:
    """Remove bytes (BisonBook-owned only) and the index row. Caller commits."""
    if row.source_type != "kyc":
        if row.storage_backend == "supabase" and row.storage_path:
            client = _supabase()
            if client is not None:
                try:
                    client.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([row.storage_path])
                except Exception as exc:
                    logger.warning("Supabase delete failed: %s", exc)
        elif row.storage_path:
            try:
                Path(row.storage_path).unlink(missing_ok=True)
            except OSError:
                pass
    db.delete(row)


def serialize_file(row: VendorFile) -> dict:
    return {
        "id": row.id,
        "folder": row.folder,
        "name": row.name,
        "url": file_access_url(row),
        "mime": row.mime,
        "size": row.size,
        "storage_backend": row.storage_backend,
        "source_type": row.source_type,
        "source_id": row.source_id,
        "created_at": row.created_at,
    }
