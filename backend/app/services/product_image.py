import io
import json
import logging
import uuid
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from ..core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_BYTES = 8 * 1024 * 1024
MIN_SIDE = 400
MAX_PRODUCT_IMAGES = 8
UPLOAD_DIR = Path("uploads/products")


def _load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        return image.convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file is not a valid image. Upload a JPG, PNG, or WebP photo of the product.",
        ) from exc


def _assert_quality(image: Image.Image) -> None:
    width, height = image.size
    if min(width, height) < MIN_SIDE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product photo is too small ({width}x{height}). Use a clear image at least {MIN_SIDE}px on the shortest side.",
        )


def _assert_matches_product(image: Image.Image, product_name: str, category: str) -> None:
    if not settings.GEMINI_API_KEY:
        return

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(settings.GEMINI_MODEL or "gemini-1.5-flash")
        prompt = f"""You are checking a marketplace product photo.
Product name: {product_name}
Category: {category}

Reply with JSON only:
{{"clear": true, "shows_product": true, "reason": "short reason"}}

clear=false if blurry, dark, cropped badly, or screenshot/text-only.
shows_product=false if the photo is not this product (wrong item, logo-only, stock collage, or unrelated scene).
"""
        response = model.generate_content([prompt, image])
        text = (response.text or "").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            logger.warning("Gemini image check returned non-JSON: %s", text[:200])
            return
        payload = json.loads(text[start : end + 1])
        if payload.get("clear") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=payload.get("reason")
                or "That photo is not clear enough. Upload a sharp, well-lit picture of the actual product.",
            )
        if payload.get("shows_product") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=payload.get("reason")
                or f"That photo does not look like {product_name}. Upload a picture of this {category.lower()}.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Product image AI check skipped: %s", exc)


def save_product_image(file: UploadFile, product_name: str, category: str) -> Tuple[str, str]:
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a JPG, PNG, or WebP photo of the product.",
        )

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The image file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is larger than 8MB. Compress it or upload a smaller photo.",
        )

    image = _load_image(data)
    _assert_quality(image)
    _assert_matches_product(image, product_name, category)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.jpg"
    dest = UPLOAD_DIR / filename
    image.save(dest, format="JPEG", quality=88, optimize=True)
    return f"/uploads/products/{filename}", filename
