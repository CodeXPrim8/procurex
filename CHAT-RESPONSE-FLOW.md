# Chat Response System - What's In Charge

## Overview
The chat response system is handled by multiple components working together. Here's the complete flow:

## Components Responsible for Chat Responses

### 1. **Frontend (Web Client)**
**File:** `web/app/chat/page.tsx` and `web/components/ChatInterface.tsx`
- **Role:** User interface and WebSocket client
- **Responsibilities:**
  - Captures user input
  - Sends messages via WebSocket
  - Receives and displays streaming responses
  - Updates UI in real-time

### 2. **Backend WebSocket Handler**
**File:** `backend/app/api/chat.py` - `websocket_chat()` function (line 101)
- **Role:** Main chat orchestrator
- **Responsibilities:**
  - Receives user messages via WebSocket
  - Manages chat sessions
  - Coordinates AI response generation
  - Streams responses back to frontend
  - Handles authentication and session management

### 3. **AI Service** (THE MAIN RESPONSE GENERATOR)
**File:** `backend/app/services/ai_service.py`
- **Role:** Generates AI responses
- **Key Functions:**
  - `generate_ai_response()` - Main entry point (line 402)
  - `_generate_gemini_response()` - Gemini AI responses (line 94)
  - `_generate_openai_response()` - OpenAI responses (line 187)
  - `_generate_fallback_response()` - Rule-based responses (line 286)

### 4. **AI Providers** (The Actual "Brain")
- **Google Gemini** (`gemini-1.5-flash` or `gemini-pro`)
- **OpenAI GPT-3.5-turbo** (if configured)
- **Hugging Face** (if configured)
- **Fallback System** (rule-based responses when AI fails)

## Complete Flow Diagram

```
User Types Message
       ↓
Frontend (chat/page.tsx)
       ↓
WebSocket Send: { message: "hello" }
       ↓
Backend WebSocket Handler (chat.py:176-245)
       ├─→ Authenticates user
       ├─→ Saves user message to database
       ├─→ Sends typing indicator
       ├─→ Starts product search (background)
       └─→ Calls: generate_ai_response()
              ↓
       AI Service (ai_service.py:402)
              ├─→ Checks AI_PROVIDER setting
              ├─→ Tries Gemini first (if configured)
              │     └─→ _generate_gemini_response()
              │           └─→ Calls Google Gemini API
              │                 └─→ Streams response chunks
              ├─→ Falls back to OpenAI (if Gemini fails)
              ├─→ Falls back to Hugging Face (if OpenAI fails)
              └─→ Falls back to rule-based (if all AI fails)
                     └─→ _generate_fallback_response()
                           └─→ Pattern matching responses
              ↓
       Streams chunks back via WebSocket
              ↓
       Frontend receives chunks
              ↓
       Updates UI in real-time
              ↓
       User sees response
```

## Key Files and Their Roles

### Backend Files:

1. **`backend/app/api/chat.py`**
   - **Line 101-398:** `websocket_chat()` - Main WebSocket handler
   - **Line 245:** Calls `generate_ai_response()` to get AI response
   - **Line 250-253:** Streams chunks to frontend
   - **Line 298-317:** Error handling

2. **`backend/app/services/ai_service.py`**
   - **Line 402-434:** `generate_ai_response()` - Main AI response generator
   - **Line 94-175:** `_generate_gemini_response()` - Gemini AI
   - **Line 187-194:** `_generate_openai_response()` - OpenAI
   - **Line 286-399:** `_generate_fallback_response()` - Rule-based fallback
   - **Line 50-91:** `SYSTEM_PROMPT` - Defines AI personality

3. **`backend/app/core/config.py`**
   - **Line 20:** `AI_PROVIDER` - Which AI to use (gemini/openai/huggingface/fallback)
   - **Line 27-28:** `GEMINI_API_KEY` and `GEMINI_MODEL` - Gemini configuration

### Frontend Files:

1. **`web/app/chat/page.tsx`**
   - **Line 334-513:** `connectWebSocket()` - WebSocket connection
   - **Line 402-442:** `ws.onmessage` - Receives and processes AI responses
   - **Line 600-700:** `handleSend()` - Sends user messages

2. **`web/components/ChatMessage.tsx`**
   - Displays individual chat messages

## What Controls the Response Quality

1. **SYSTEM_PROMPT** (`ai_service.py:50-91`)
   - Defines AI personality and behavior
   - Controls how conversational and helpful the AI is

2. **AI Provider** (Gemini/OpenAI/HuggingFace)
   - The actual AI model generating responses
   - Quality depends on which provider is used

3. **Context Management** (`chat.py:171-174`)
   - Maintains conversation history
   - Keeps last 20 messages for context

4. **Error Handling** (`chat.py:298-317`)
   - Catches errors and provides fallback responses
   - Ensures user always gets a response

## Current Configuration

- **AI Provider:** Gemini (`gemini-1.5-flash`)
- **Response Style:** Conversational, ChatGPT-like
- **Context:** Last 20 messages (10 exchanges)
- **Streaming:** Real-time chunk-by-chunk responses
- **Fallback:** Rule-based responses if AI fails

## To Change Response Behavior

1. **Change AI Provider:** Edit `backend/.env` → `AI_PROVIDER=...`
2. **Modify Personality:** Edit `SYSTEM_PROMPT` in `ai_service.py:50-91`
3. **Adjust Context:** Change context size in `chat.py:338-339`
4. **Change Model:** Edit `GEMINI_MODEL` in `backend/.env`

