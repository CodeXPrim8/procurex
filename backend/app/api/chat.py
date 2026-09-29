import logging
import asyncio
import contextvars
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from ..services.regions import buyer_country_for
from datetime import datetime
import json
import re
from ..core.database import get_db
from ..api.dependencies import get_current_user, verify_supabase_token
from ..models.user import User
from ..models.chat import ChatSession, ChatMessage, MessageRole
from ..models.product import Product, VendorProduct
from ..schemas.chat import (
    ChatMessageCreate,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    ChatSessionSummary,
)
from pydantic import BaseModel
from ..services.ai_service import generate_ai_response, parse_product_query, is_catalog_query, is_quote_request, display_currency, buyer_memory_notes, issued_quotation, transcribe_audio_bytes, synthesize_speech_bytes
from ..services.quotation_service import quote_from_catalog
from ..services.business_service import ensure_default_business, get_business
from ..models.business import BusinessClient, ClientRequest
from ..services.buyer_memory import format_notes, get_memory, remember_search, remembered_product_names, search_bias
from ..services.chat_title import (
    natural_chat_title,
    should_replace_title,
    unique_chat_title,
)
from ..services.product_service import search_products
from ..schemas.product import ProductSearch

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

_DEBUG_LOGS = [
    r"c:\Users\clemx\PROCUREMENT\debug-53a75c.log",
    r"c:\Users\clemx\PROCUREMENT\.cursor\debug-53a75c.log",
]


def _dbg(message: str, data: dict, hypothesis_id: str = "F"):
    try:
        import time
        from pathlib import Path
        payload = json.dumps(
            {
                "sessionId": "53a75c",
                "location": "chat.py:transcribe",
                "message": message,
                "data": data,
                "timestamp": int(time.time() * 1000),
                "hypothesisId": hypothesis_id,
            }
        ) + "\n"
        for path in _DEBUG_LOGS:
            handle_path = Path(path)
            handle_path.parent.mkdir(parents=True, exist_ok=True)
            with handle_path.open("a", encoding="utf-8") as handle:
                handle.write(payload)
    except Exception:
        pass


@router.post("/transcribe")
async def transcribe_voice(file: UploadFile = File(...)):
    raw = await file.read()
    mime = file.content_type or "audio/webm"
    _dbg("transcribe request", {"bytes": len(raw or b""), "mime": mime})
    if not raw or len(raw) < 200:
        return {"text": ""}
    if len(raw) > 6_000_000:
        raise HTTPException(status_code=413, detail="Audio clip is too large")
    try:
        text = await asyncio.to_thread(transcribe_audio_bytes, raw, mime)
        _dbg("transcribe ok", {"chars": len(text or ""), "preview": (text or "")[:80]})
        return {"text": text or ""}
    except Exception as exc:
        logger.warning("Transcription failed: %s", exc)
        _dbg("transcribe failed", {"error": str(exc)[:180]})
        raise HTTPException(status_code=502, detail="Could not transcribe that audio")


class SpeakIn(BaseModel):
    text: str
    voice: Optional[str] = None


class ChatReplyIn(BaseModel):
    message: str
    voice: bool = False
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None
    local_per_ngn: Optional[float] = 1.0
    country: Optional[str] = None
    business_id: Optional[int] = None
    client_id: Optional[int] = None
    request_id: Optional[int] = None


@router.post("/speak")
async def speak_text(payload: SpeakIn):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to speak")
    try:
        audio, mime = await asyncio.to_thread(synthesize_speech_bytes, text, payload.voice)
        return Response(content=audio, media_type=mime or "audio/mpeg")
    except Exception as exc:
        logger.warning("Speech audio failed: %s", exc)
        raise HTTPException(status_code=501, detail="Voice playback audio is unavailable")


async def _stream_ai_chunks(
    user_message: str,
    context,
    product_results,
    voice: bool,
):
    loop = asyncio.get_running_loop()
    out: asyncio.Queue = asyncio.Queue()
    ctx = contextvars.copy_context()

    def produce():
        try:
            for chunk in generate_ai_response(
                user_message, context, product_results, voice=voice
            ):
                asyncio.run_coroutine_threadsafe(out.put(("ok", chunk)), loop).result()
            asyncio.run_coroutine_threadsafe(out.put(("end", None)), loop).result()
        except Exception as exc:
            asyncio.run_coroutine_threadsafe(out.put(("err", exc)), loop).result()

    loop.run_in_executor(None, lambda: ctx.run(produce))
    while True:
        kind, payload = await out.get()
        if kind == "end":
            return
        if kind == "err":
            raise payload
        if payload:
            yield payload


def _other_session_titles(db: Session, user_id: int, exclude_id: Optional[int] = None) -> List[str]:
    query = db.query(ChatSession.title).filter(ChatSession.user_id == user_id)
    if exclude_id is not None:
        query = query.filter(ChatSession.id != exclude_id)
    return [row[0] or "" for row in query.all()]


def _apply_natural_title(session: ChatSession, user_texts: List[str], db: Optional[Session] = None) -> Optional[str]:
    title = natural_chat_title(user_texts, session.title)
    existing = _other_session_titles(db, session.user_id, session.id) if db is not None else []
    if title and should_replace_title(session.title, user_texts):
        session.title = unique_chat_title(title, existing)
        return session.title
    if session.title:
        unique = unique_chat_title(session.title, existing)
        if unique != session.title:
            session.title = unique
            return unique
    return session.title


def _thread_search_text(user_message: str, context: Optional[List[dict]] = None) -> str:
    """Combine recent buyer turns so a pasted spec still matches the earlier product request."""
    parts = []
    for item in context or []:
        if (item or {}).get("role") != "user":
            continue
        text = str((item or {}).get("content") or "").strip()
        if text:
            parts.append(text)
    current = (user_message or "").strip()
    if current:
        parts.append(current)
    return " ".join(parts[-4:]).strip() or current


def _apply_buyer_notes(db: Session, user_id: Optional[int]) -> object:
    row = get_memory(db, user_id)
    notes = format_notes(row)
    names = remembered_product_names(db, row)
    if names:
        notes = (notes + " Recently matched listings: " + ", ".join(names) + ".").strip()
    return buyer_memory_notes.set(notes or None)


def _last_catalog_rows(db: Session, session_id: int) -> list:
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id, ChatMessage.role == MessageRole.ASSISTANT)
        .order_by(ChatMessage.created_at.desc())
        .limit(12)
        .all()
    )
    for msg in messages:
        raw = msg.message_metadata
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        rows = payload.get("product_results")
        if rows:
            return rows
    return []


def _quote_quantity(text: str, context: Optional[List[dict]] = None) -> int:
    sources = [text or ""]
    if context:
        for item in reversed(context):
            if (item or {}).get("role") == "user":
                sources.append(str((item or {}).get("content") or ""))
                break
    patterns = (
        r"\b(?:qty|quantity)\s*[:=]?\s*(\d{1,4})\b",
        r"\b(\d{1,4})\s*(?:units?|pcs|pieces)\b",
        r"\b(\d{1,4})\s*[x×]\s*(?:units?|pcs|pieces|laptops?|phones?|notebooks?|items?)\b",
        r"\b(\d{1,4})\s+(?:laptops?|notebooks?|computers?|phones?|tablets?|monitors?|printers?)\b",
    )
    for blob in sources:
        lower = (blob or "").lower()
        for pattern in patterns:
            match = re.search(pattern, lower)
            if match:
                return max(1, min(int(match.group(1)), 1000))
    return 1


def _quote_scope(db: Session, user: User, business_id=None, client_id=None, request_id=None):
    try:
        business = get_business(db, user, int(business_id) if business_id else None)
    except Exception:
        business = ensure_default_business(db, user)
    client = None
    request = None
    if request_id and business:
        request = (
            db.query(ClientRequest)
            .filter(ClientRequest.id == int(request_id), ClientRequest.business_id == business.id)
            .first()
        )
        if request and request.client_id:
            client = request.client
    if client_id and business:
        client = (
            db.query(BusinessClient)
            .filter(BusinessClient.id == int(client_id), BusinessClient.business_id == business.id)
            .first()
        ) or client
    return business, client, request


def _quote_ai_payload(quotation_data, quote_error):
    if quotation_data and quotation_data.get("quotation_number"):
        return quotation_data
    if quote_error:
        return {"error": quote_error}
    return None


def _assistant_meta(product_results, quotation_data):
    meta = {}
    if product_results:
        meta["product_results"] = product_results
    if quotation_data and quotation_data.get("quotation_number"):
        meta["quotation"] = quotation_data
    return json.dumps(meta, default=str) if meta else None


def _issue_quote_if_requested(
    db: Session,
    user: User,
    session_id: int,
    user_message: str,
    context,
    product_results: list,
    local_per_ngn: float = 1.0,
    buyer_country: Optional[str] = None,
    business_id=None,
    client_id=None,
    request_id=None,
):
    if not is_quote_request(user_message, context):
        return product_results, None, None
    rows = product_results or _last_catalog_rows(db, session_id)
    if not rows:
        for item in reversed(context or []):
            if (item or {}).get("role") != "user":
                continue
            prior = str((item or {}).get("content") or "").strip()
            if not prior or is_quote_request(prior, context):
                continue
            rows = _catalog_for_message(
                db,
                prior,
                local_per_ngn,
                buyer_country,
                context=context,
                user_id=user.id,
            )
            if rows:
                break
    business, client, request = _quote_scope(db, user, business_id, client_id, request_id)
    try:
        _, error, data = quote_from_catalog(
            db,
            user,
            rows,
            _quote_quantity(user_message, context),
            business=business,
            client=client,
            request=request,
            user_message=user_message,
        )
        return rows, error, data
    except Exception as exc:
        logger.exception("Quote issue failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
        return rows, "I could not issue that quotation just now. Please try again.", None


def _catalog_for_message(
    db: Session,
    user_message: str,
    local_per_ngn: float,
    buyer_country: Optional[str] = None,
    context: Optional[List[dict]] = None,
    user_id: Optional[int] = None,
):
    try:
        search_text = _thread_search_text(user_message, context)
        parsed_query = parse_product_query(search_text, local_per_ngn)
        if not is_catalog_query(search_text, parsed_query, context) and not is_catalog_query(
            user_message, parsed_query, context
        ):
            return []
        memory = get_memory(db, user_id)
        rows = search_products(
            db,
            ProductSearch(
                query=parsed_query.get("query") or search_text,
                category=parsed_query.get("category"),
                max_price=parsed_query.get("max_price"),
                brand=parsed_query.get("brand"),
                in_stock_only=bool(parsed_query.get("in_stock_only")),
                buyer_country=buyer_country,
                spec_hints=parsed_query.get("spec_hints") or None,
                buyer_bias=search_bias(memory) or None,
            ),
            limit=10,
        ) or []
        remember_search(
            db,
            user_id,
            category=parsed_query.get("category"),
            brand=parsed_query.get("brand"),
            spec_hints=parsed_query.get("spec_hints"),
            query=user_message,
            rows=rows,
        )
        try:
            db.commit()
        except Exception:
            db.rollback()
        return rows
    except Exception as exc:
        logger.warning("Catalog search failed: %s", exc)
        return []


def _close_enough_utterance(prefetch: str, final: str) -> bool:
    left = " ".join((prefetch or "").lower().split())
    right = " ".join((final or "").lower().split())
    if not left or not right:
        return False
    if left == right:
        return True
    return right.startswith(left) and len(right) - len(left) <= 18


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_chat_session(
    session_data: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new chat session."""
    session = ChatSession(
        user_id=current_user.id,
        title=(session_data.title or "New chat").strip() or "New chat",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return ChatSessionResponse(
        id=session.id,
        user_id=session.user_id,
        title=session.title or "New chat",
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[],
    )


@router.get("/sessions", response_model=List[ChatSessionSummary])
async def get_chat_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all chat sessions for current user."""
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.updated_at.desc()).all()

    if sessions:
        texts_by_session = {session.id: [] for session in sessions}
        messages = db.query(ChatMessage).filter(
            ChatMessage.session_id.in_([session.id for session in sessions]),
            ChatMessage.role == MessageRole.USER,
        ).order_by(ChatMessage.created_at.asc()).all()
        for message in messages:
            texts_by_session.setdefault(message.session_id, []).append(message.content)
        changed = False
        for session in sessions:
            previous = session.title
            _apply_natural_title(session, texts_by_session.get(session.id, []), db)
            if session.title != previous:
                changed = True
        if changed:
            db.commit()

    return sessions


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific chat session with messages."""
    session = db.query(ChatSession).options(
        joinedload(ChatSession.messages)
    ).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return ChatSessionResponse(
        id=session.id,
        user_id=session.user_id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[ChatMessageResponse.model_validate(message) for message in session.messages],
    )


class ChatSessionRename(BaseModel):
    title: str


@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
async def rename_chat_session(
    session_id: int,
    payload: ChatSessionRename,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    title = unique_chat_title(
        (payload.title or "").strip()[:80] or "New chat",
        _other_session_titles(db, current_user.id, session.id),
    )
    session.title = title
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return ChatSessionResponse(
        id=session.id,
        user_id=session.user_id,
        title=session.title or "New chat",
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[],
    )


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_chat_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat session and its messages."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    logger.info("Deleted session %s for user %s", session_id, current_user.email)
    return Response(status_code=204)


@router.post("/sessions/{session_id}/messages", response_model=ChatMessageResponse)
async def create_message(
    session_id: int,
    message_data: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a message in a chat session."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    user_texts = [
        item.content
        for item in db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id,
            ChatMessage.role == MessageRole.USER,
        ).order_by(ChatMessage.created_at.asc()).all()
    ]
    message = ChatMessage(
        session_id=session_id,
        role=message_data.role,
        content=message_data.content,
        message_metadata=message_data.metadata
    )
    db.add(message)

    session.updated_at = datetime.utcnow()
    if message_data.role == MessageRole.USER:
        user_texts.append(message_data.content)
    _apply_natural_title(session, user_texts, db)

    db.commit()
    db.refresh(message)
    logger.info("Stored message %s for session %s by user %s", message.id, session_id, current_user.email)
    return ChatMessageResponse.model_validate(message)


@router.post("/sessions/{session_id}/reply")
async def generate_session_reply(
    session_id: int,
    payload: ChatReplyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a live AI reply when WebSocket is unavailable."""
    user_message = (payload.message or "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Please provide a message.")

    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if payload.business_id:
        session.business_id = payload.business_id

    local_per_ngn = 1.0
    try:
        local_per_ngn = float(payload.local_per_ngn or 1) or 1
    except (TypeError, ValueError):
        local_per_ngn = 1.0
    currency_token = display_currency.set({
        "code": str(payload.currency or "NGN"),
        "symbol": str(payload.currency_symbol or "₦"),
        "local_per_ngn": local_per_ngn,
    })
    try:
        context = [
            {"role": msg.role.value, "content": msg.content}
            for msg in db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
            .all()
        ]
        db.add(ChatMessage(session_id=session_id, role=MessageRole.USER, content=user_message))
        session.updated_at = datetime.utcnow()
        user_texts = [item["content"] for item in context if item.get("role") == "user"]
        user_texts.append(user_message)
        _apply_natural_title(session, user_texts, db)
        db.commit()

        product_results = _catalog_for_message(
            db,
            user_message,
            local_per_ngn,
            buyer_country_for(current_user, payload.country),
            context=context,
            user_id=current_user.id,
        )
        product_results, quote_error, quotation_data = _issue_quote_if_requested(
            db,
            current_user,
            session_id,
            user_message,
            context,
            product_results,
            local_per_ngn=local_per_ngn,
            buyer_country=buyer_country_for(current_user, payload.country),
            business_id=payload.business_id,
            client_id=payload.client_id,
            request_id=payload.request_id,
        )
        quote_payload = _quote_ai_payload(quotation_data, quote_error)
        notes_token = _apply_buyer_notes(db, current_user.id)
        quote_token = issued_quotation.set(quote_payload)
        assistant_response = ""
        try:
            async for chunk in _stream_ai_chunks(
                user_message, context, product_results, bool(payload.voice)
            ):
                if chunk:
                    assistant_response += chunk
        finally:
            buyer_memory_notes.reset(notes_token)
            issued_quotation.reset(quote_token)
        if not assistant_response.strip():
            assistant_response = "I can help with IT procurement. Please try that request again."

        db.add(
            ChatMessage(
                session_id=session_id,
                role=MessageRole.ASSISTANT,
                content=assistant_response,
                message_metadata=_assistant_meta(product_results, quotation_data),
            )
        )
        session.updated_at = datetime.utcnow()
        db.commit()
        return {
            "content": assistant_response,
            "title": session.title,
            "product_results": product_results,
            "quotation": quotation_data if quotation_data and quotation_data.get("quotation_number") else None,
        }
    finally:
        display_currency.reset(currency_token)


@router.websocket("/ws/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: int,
    token: str = None
):
    """WebSocket endpoint for real-time chat with streaming AI responses."""
    await websocket.accept()
    db = None
    try:
        if not token:
            await websocket.send_json({"error": "Missing authentication token"})
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        db = next(get_db())

        try:
            supabase_user, local_user = await verify_supabase_token(token, db)
            if not local_user:
                logger.warning(f"User account not provisioned for token (user might not exist in local DB)")
                await websocket.send_json({
                    "type": "error",
                    "error": "User account not provisioned. Please try logging out and back in."
                })
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
                return
        except HTTPException as e:
            logger.error(f"Authentication error: {e.detail} (status: {e.status_code})")
            await websocket.send_json({
                "type": "error",
                "error": f"Authentication failed: {e.detail}. Please try logging in again."
            })
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        except Exception as e:
            logger.exception(f"Error verifying token: {e}")
            await websocket.send_json({
                "type": "error",
                "error": f"Authentication error: {str(e)}. Please try logging in again."
            })
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
            return

        try:
            session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
            if not session:
                logger.warning(f"Session {session_id} not found for user {local_user.email}")
                await websocket.send_json({"error": "Session not found. Please create a new chat session."})
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            if session.user_id != local_user.id:
                logger.warning(f"Session {session_id} does not belong to user {local_user.email}")
                await websocket.send_json({"error": "Session does not belong to this user"})
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        except Exception as e:
            logger.error(f"Error checking session: {e}")
            await websocket.send_json({"error": "Error accessing chat session"})
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
            return

        logger.info("WebSocket connected for session %s user %s", session_id, local_user.email)
        
        # Get chat history
        messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.created_at).all()
        
        context = [
            {"role": msg.role.value, "content": msg.content}
            for msg in messages
        ]
        prefetch = {"query": "", "text": "", "products": [], "task": None}
        buyer_region = {"country": buyer_country_for(local_user)}

        async def produce_reply(message: str, voice: bool, local_per: float):
            def search_sync():
                thread_db = None
                try:
                    thread_db = next(get_db())
                    return _catalog_for_message(
                        thread_db,
                        message,
                        local_per,
                        buyer_region["country"],
                        context=context,
                        user_id=local_user.id,
                    )
                except Exception as exc:
                    logger.warning("Prefetch catalog search failed: %s", exc)
                    return []
                finally:
                    if thread_db:
                        try:
                            thread_db.close()
                        except Exception:
                            pass

            loop = asyncio.get_running_loop()
            try:
                products = await asyncio.wait_for(loop.run_in_executor(None, search_sync), timeout=2.5) or []
            except Exception:
                products = []
            parts = []
            notes_token = _apply_buyer_notes(db, local_user.id)
            try:
                async for chunk in _stream_ai_chunks(message, context, products, voice):
                    if chunk:
                        parts.append(chunk)
            finally:
                buyer_memory_notes.reset(notes_token)
            return "".join(parts), products
        
        while True:
            try:
                currency_token = None
                # Receive user message
                data = await websocket.receive_json()
                user_message = data.get("message", "")
                voice_mode = bool(data.get("voice"))
                is_prefetch = bool(data.get("prefetch"))
                
                if not user_message:
                    if is_prefetch:
                        continue
                    await websocket.send_json({
                        "type": "error",
                        "error": "Please provide a message."
                    })
                    continue

                local_per_ngn = 1.0
                try:
                    local_per_ngn = float(data.get("local_per_ngn") or 1) or 1
                except (TypeError, ValueError):
                    local_per_ngn = 1.0
                currency_token = display_currency.set({
                    "code": str(data.get("currency") or "NGN"),
                    "symbol": str(data.get("currency_symbol") or "₦"),
                    "local_per_ngn": local_per_ngn,
                })
                buyer_region["country"] = buyer_country_for(local_user, data.get("country"))
                quote_ids = {"business_id": None, "client_id": None, "request_id": None}
                for key in quote_ids:
                    try:
                        value = data.get(key)
                        quote_ids[key] = int(value) if value else None
                    except (TypeError, ValueError):
                        quote_ids[key] = None
                if quote_ids["business_id"]:
                    session.business_id = quote_ids["business_id"]

                if is_prefetch:
                    continue

                cached = None
                
                # Send typing indicator immediately for instant feedback
                try:
                    await websocket.send_json({
                        "type": "typing",
                        "status": True
                    })
                except:
                    pass
                
                # Save user message (non-blocking, don't wait for commit)
                user_msg = None
                try:
                    user_msg = ChatMessage(
                        session_id=session_id,
                        role=MessageRole.USER,
                        content=user_message
                    )
                    db.add(user_msg)
                    session.updated_at = datetime.utcnow()
                    user_texts = [
                        msg.get("content", "")
                        for msg in context
                        if msg.get("role") == "user"
                    ]
                    user_texts.append(user_message)
                    _apply_natural_title(session, user_texts, db)
                    db.commit()
                    db.refresh(user_msg)
                    try:
                        await websocket.send_json({
                            "type": "title",
                            "title": session.title,
                        })
                    except Exception:
                        pass
                except Exception as e:
                    logger.error(f"Error saving user message: {e}")
                    # Continue even if saving fails
                
                # Search the catalog before answering so replies use real stock and prices.
                product_results = []
                quotation_data = None
                quote_error = None

                def search_products_sync():
                    thread_db = None
                    try:
                        thread_db = next(get_db())
                        return _catalog_for_message(
                            thread_db,
                            user_message,
                            local_per_ngn,
                            buyer_region["country"],
                            context=context,
                            user_id=local_user.id,
                        )
                    except Exception as e:
                        logger.warning(f"Error in product search: {e}")
                        return []
                    finally:
                        if thread_db:
                            try:
                                thread_db.close()
                            except Exception as e:
                                logger.warning(f"Error closing thread DB session: {e}")

                try:
                    loop = asyncio.get_running_loop()
                    product_results = await asyncio.wait_for(
                        loop.run_in_executor(None, search_products_sync),
                        timeout=2.5,
                    ) or []
                except Exception as e:
                    logger.warning(f"Catalog search skipped: {e}")
                    try:
                        product_results = _catalog_for_message(
                            db,
                            user_message,
                            local_per_ngn,
                            buyer_region["country"],
                            context=context,
                            user_id=local_user.id,
                        )
                    except Exception as search_error:
                        logger.warning(f"Error in synchronous product search: {search_error}")
                        product_results = []

                product_results, quote_error, quotation_data = _issue_quote_if_requested(
                    db,
                    local_user,
                    session_id,
                    user_message,
                    context,
                    product_results,
                    local_per_ngn=local_per_ngn,
                    buyer_country=buyer_region["country"],
                    business_id=quote_ids.get("business_id"),
                    client_id=quote_ids.get("client_id"),
                    request_id=quote_ids.get("request_id"),
                )
                quote_payload = _quote_ai_payload(quotation_data, quote_error)

                assistant_response = ""
                notes_token = _apply_buyer_notes(db, local_user.id)
                quote_token = issued_quotation.set(quote_payload)
                try:
                    chunk_count = 0
                    has_error = False
                    try:
                        if cached and cached.get("text"):
                            assistant_response = str(cached.get("text") or "")
                            product_results = cached.get("products") or product_results
                            chunk_count = 1
                            await websocket.send_json({
                                "type": "chunk",
                                "content": assistant_response,
                            })
                            prefetch["query"] = ""
                            prefetch["text"] = ""
                            prefetch["products"] = []
                            prefetch["task"] = None
                        else:
                            async for chunk in _stream_ai_chunks(
                                user_message, context, product_results, voice_mode
                            ):
                                if chunk:  # Only process non-empty chunks
                                    assistant_response += chunk
                                    chunk_count += 1
                                    try:
                                        await websocket.send_json({
                                            "type": "chunk",
                                            "content": chunk
                                        })
                                    except Exception as send_error:
                                        logger.error(f"Error sending chunk: {send_error}")
                                        has_error = True
                                        break
                    except StopIteration:
                        # Generator exhausted normally
                        pass
                    except Exception as gen_error:
                        logger.error(f"Error in AI response generator: {gen_error}")
                        logger.exception("Generator error details:")
                        has_error = True
                        raise gen_error
                    
                    # If no chunks were received, send an error
                    if chunk_count == 0 and not assistant_response and not has_error:
                        logger.warning("No response generated from AI")
                        error_message = "I apologize, but I couldn't generate a response. Please try again."
                        assistant_response = error_message
                        await websocket.send_json({
                            "type": "chunk",
                            "content": error_message
                        })
                        
                except Exception as e:
                    error_details = str(e)
                    logger.error(f"Error generating AI response: {error_details}")
                    logger.exception("Full error traceback:")
                    
                    # Provide more helpful error message based on error type
                    if "Gemini client not initialized" in error_details or "API key" in error_details.lower():
                        error_message = "AI service is not properly configured. Please check the backend configuration (GEMINI_API_KEY or AI_PROVIDER settings)."
                    elif "rate limit" in error_details.lower() or "quota" in error_details.lower():
                        error_message = "AI service rate limit reached. Please try again in a moment."
                    elif "timeout" in error_details.lower():
                        error_message = "AI service request timed out. Please try again."
                    else:
                        error_message = f"I encountered an error: {error_details[:100]}. Please try again or check backend logs."
                    
                    assistant_response = error_message
                    try:
                        await websocket.send_json({
                            "type": "error",
                            "error": error_message
                        })
                    except:
                        pass
                    # Also send as chunk so it appears in chat
                    try:
                        await websocket.send_json({
                            "type": "chunk",
                            "content": error_message
                        })
                    except:
                        pass
                finally:
                    buyer_memory_notes.reset(notes_token)
                    issued_quotation.reset(quote_token)
                
                # Save assistant message
                try:
                    assistant_msg = ChatMessage(
                        session_id=session_id,
                        role=MessageRole.ASSISTANT,
                        content=assistant_response,
                        message_metadata=_assistant_meta(product_results, quotation_data),
                    )
                    db.add(assistant_msg)
                    session.updated_at = datetime.utcnow()
                    db.commit()
                except Exception as e:
                    logger.error(f"Error saving assistant message: {e}")
                    # Continue even if saving fails
                
                # Update context (increased for better conversation memory)
                context.append({"role": "user", "content": user_message})
                context.append({"role": "assistant", "content": assistant_response})
                # Keep last 20 messages (10 exchanges) for better conversation flow and learning
                if len(context) > 20:
                    context = context[-20:]
                
                # Send completion signal
                try:
                    await websocket.send_json({
                        "type": "done",
                        "product_results": json.loads(json.dumps(product_results or [], default=str)),
                        "quotation": json.loads(json.dumps(
                            quotation_data if quotation_data and quotation_data.get("quotation_number") else None,
                            default=str,
                        )),
                        "title": session.title,
                    })
                except Exception as e:
                    logger.error(f"Error sending done signal: {e}")
                    
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected for session %s", session_id)
                break
            except RuntimeError as e:
                if "disconnect" in str(e).lower():
                    logger.info("WebSocket already disconnected for session %s", session_id)
                    break
                logger.exception("WebSocket runtime error for session %s: %s", session_id, e)
                break
            except Exception as e:
                logger.exception(f"Error processing message in WebSocket: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": "An error occurred while processing your message. Please try again."
                    })
                except Exception:
                    break
                continue
            finally:
                if currency_token is not None:
                    display_currency.reset(currency_token)
            
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
    except Exception as e:
        logger.exception("WebSocket error for session %s: %s", session_id, e)
        try:
            await websocket.send_json({
                "type": "error",
                "error": f"Connection error: {str(e)}. Please try reconnecting."
            })
        except:
            pass  # WebSocket might already be closed
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except:
            pass  # WebSocket might already be closed
    finally:
        # Ensure database session is always closed to prevent connection leaks
        if db:
            try:
                db.close()
                logger.debug(f"Closed database session for WebSocket session {session_id}")
            except Exception as db_error:
                logger.error(f"Error closing database connection: {db_error}")
        
        # Ensure WebSocket is properly closed (with timeout to prevent hanging)
        try:
            if hasattr(websocket, 'client_state') and websocket.client_state.name != "DISCONNECTED":
                await asyncio.wait_for(
                    websocket.close(code=status.WS_1000_NORMAL_CLOSURE),
                    timeout=1.0
                )
        except asyncio.TimeoutError:
            logger.warning("WebSocket close timed out, forcing close")
        except Exception as close_error:
            logger.debug(f"WebSocket already closed or error closing: {close_error}")
        
        # Small delay to allow cleanup
        await asyncio.sleep(0.01)



