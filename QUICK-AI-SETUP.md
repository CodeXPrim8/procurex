# Quick AI Setup Guide 🚀

## ✅ What's New?

Your procurement system now supports **multiple AI providers** including **FREE options**! The AI can now handle:
- ✅ Natural, brilliant conversations
- ✅ Learning from context
- ✅ Product recommendations
- ✅ General chat and questions

## 🎯 Recommended: Google Gemini (FREE)

**Best option for getting started - completely free!**

### Quick Setup (3 steps):

1. **Get your free API key:**
   - Visit: https://makersuite.google.com/app/apikey
   - Sign in with Google
   - Click "Create API Key"
   - Copy the key

2. **Add to your `.env` file:**
   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-api-key-here
   ```

3. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

**That's it!** Your AI chat is now powered by Google Gemini with:
- 60 requests per minute (free tier)
- Excellent conversation quality
- Natural learning and context understanding

---

## 📋 Other Options

### Option 2: OpenAI GPT-3.5-turbo (Affordable)
- Very high quality
- ~$0.0015 per 1K tokens (very cheap)
- Get key: https://platform.openai.com/api-keys

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-3.5-turbo
```

### Option 3: Hugging Face (FREE)
- Open source models
- 30,000 requests/month free
- Get key: https://huggingface.co/settings/tokens

```env
AI_PROVIDER=huggingface
HUGGINGFACE_API_KEY=your-key-here
```

### Option 4: Fallback (No API Key)
- Works without any API key
- Limited but functional responses
- Good for testing

```env
AI_PROVIDER=fallback
```

---

## 🔄 Automatic Fallback

The system automatically tries different providers if one fails:
1. Your configured provider
2. Google Gemini (if available)
3. OpenAI (if available)
4. Hugging Face (if available)
5. Intelligent fallback (always works)

**Your chat will always work!**

---

## 📖 Full Documentation

For detailed setup instructions, see: [backend/AI-SETUP.md](backend/AI-SETUP.md)

---

## 🧪 Test It!

1. Start your backend:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. Open your web app and go to the chat page

3. Try asking:
   - "Hello! Can you help me find a laptop?"
   - "What's the best gaming laptop under $1000?"
   - "Tell me about yourself"

The AI will respond naturally and helpfully! 🎉

---

## 💡 Tips

- **For development:** Use Google Gemini (free tier is perfect)
- **For production (low cost):** Google Gemini or OpenAI GPT-3.5-turbo
- **For maximum quality:** OpenAI GPT-4 (change `OPENAI_MODEL=gpt-4`)

Enjoy your enhanced AI chat! 🚀









