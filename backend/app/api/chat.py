import logging
import asyncio
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import json
from ..core.database import get_db
from ..api.dependencies import get_current_user, verify_supabase_token
from ..models.user import User
from ..models.chat import ChatSession, ChatMessage, MessageRole
from ..models.product import Product, VendorProduct
from ..schemas.chat import ChatMessageCreate, ChatMessageResponse, ChatSessionCreate, ChatSessionResponse
from ..services.ai_service import generate_ai_response, parse_product_query
from ..services.product_service import search_products
from ..schemas.product import ProductSearch

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_chat_session(
    session_data: ChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new chat session."""
    session = ChatSession(
        user_id=current_user.id,
        title=session_data.title
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def get_chat_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all chat sessions for current user."""
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.updated_at.desc()).all()
    return sessions


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific chat session with messages."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


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
    
    message = ChatMessage(
        session_id=session_id,
        role=message_data.role,
        content=message_data.content,
        metadata=message_data.metadata
    )
    db.add(message)
    
    # Update session timestamp
    session.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(message)
    logger.info("Stored message %s for session %s by user %s", message.id, session_id, current_user.email)
    return message


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
        
        while True:
            try:
                # Receive user message
                data = await websocket.receive_json()
                user_message = data.get("message", "")
                
                if not user_message:
                    await websocket.send_json({
                        "type": "error",
                        "error": "Please provide a message."
                    })
                    continue
                
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
                    db.commit()
                    db.refresh(user_msg)
                except Exception as e:
                    logger.error(f"Error saving user message: {e}")
                    # Continue even if saving fails
                
                # Start product search in background (non-blocking) using thread executor
                product_results = []
                product_search_task = None
                
                def search_products_sync():
                    # Create a NEW database session for the thread to avoid connection leaks
                    thread_db = None
                    try:
                        thread_db = next(get_db())
                        parsed_query = parse_product_query(user_message)
                        if parsed_query.get("category") != "unknown":
                            search_query = ProductSearch(query=parsed_query.get("query", user_message))
                            results = search_products(thread_db, search_query, limit=5)
                            return results
                    except Exception as e:
                        logger.warning(f"Error in product search: {e}")
                        return []
                    finally:
                        # Always close the thread's database session
                        if thread_db:
                            try:
                                thread_db.close()
                            except Exception as e:
                                logger.warning(f"Error closing thread DB session: {e}")
                
                # Start product search in thread pool (non-blocking)
                try:
                    loop = asyncio.get_running_loop()
                    product_search_task = loop.run_in_executor(None, search_products_sync)
                except RuntimeError:
                    # Fallback if no event loop is running
                    product_search_task = None
                    product_results = []
                
                # Generate AI response with streaming (start immediately, don't wait for product search)
                assistant_response = ""
                try:
                    chunk_count = 0
                    has_error = False
                    
                    # Start streaming immediately with empty product_results
                    # Product results will be added later if available
                    try:
                        for chunk in generate_ai_response(user_message, context, []):
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
                        
                        # Wait for product search to complete (if still running, with timeout)
                        if product_search_task:
                            try:
                                product_results = await asyncio.wait_for(product_search_task, timeout=1.5)
                            except asyncio.TimeoutError:
                                logger.warning("Product search timed out, continuing without results")
                                product_results = []
                            except Exception as e:
                                logger.warning(f"Product search error: {e}")
                                product_results = []
                        else:
                            # If task wasn't created, try synchronous search (fallback)
                            try:
                                parsed_query = parse_product_query(user_message)
                                if parsed_query.get("category") != "unknown":
                                    search_query = ProductSearch(query=parsed_query.get("query", user_message))
                                    product_results = search_products(db, search_query, limit=5)
                            except Exception as e:
                                logger.warning(f"Error in synchronous product search: {e}")
                                product_results = []
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
                
                # Save assistant message
                try:
                    assistant_msg = ChatMessage(
                        session_id=session_id,
                        role=MessageRole.ASSISTANT,
                        content=assistant_response,
                        metadata=json.dumps({"product_results": product_results}) if product_results else None
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
                        "product_results": product_results
                    })
                except Exception as e:
                    logger.error(f"Error sending done signal: {e}")
                    
            except Exception as e:
                logger.exception(f"Error processing message in WebSocket: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": "An error occurred while processing your message. Please try again."
                    })
                except:
                    pass
                continue
            
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



