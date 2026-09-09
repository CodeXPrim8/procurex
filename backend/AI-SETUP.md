# AI Provider Setup Guide

This guide explains how to set up different AI providers for the ProcureX chat system. The system supports multiple AI providers, including free options!

## Quick Start (Recommended: Google Gemini - FREE)

Google Gemini offers a **generous free tier** and excellent conversation quality. This is the recommended option for getting started.

### 1. Get Your Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

### 2. Configure Your Environment

Add to your `.env` file:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-pro
```

### 3. Install Dependencies

```bash
pip install google-generativeai
```

That's it! Your AI chat is now ready with Google Gemini.

---

## Available AI Providers

### 1. Google Gemini (Recommended - FREE Tier Available)

**Why choose Gemini:**
- ✅ **Free tier available** (60 requests per minute)
- ✅ Excellent conversation quality
- ✅ Fast responses
- ✅ Great for general conversations and learning

**Setup:**
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-pro  # or "gemini-1.5-flash" for faster responses
```

**Get API Key:** [Google AI Studio](https://makersuite.google.com/app/apikey)

**Free Tier Limits:**
- 60 requests per minute
- 1,500 requests per day
- Perfect for development and small to medium usage

---

### 2. OpenAI GPT-3.5-turbo (Affordable)

**Why choose OpenAI:**
- ✅ Very high quality responses
- ✅ Excellent for complex queries
- ✅ More affordable than GPT-4
- ✅ Widely used and reliable

**Setup:**
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-3.5-turbo  # Cheaper than gpt-4
```

**Get API Key:** [OpenAI Platform](https://platform.openai.com/api-keys)

**Pricing:**
- GPT-3.5-turbo: ~$0.0015 per 1K tokens (very affordable)
- GPT-4: ~$0.03 per 1K tokens (more expensive)

---

### 3. Hugging Face (FREE Tier Available)

**Why choose Hugging Face:**
- ✅ **Free tier available**
- ✅ Open source models
- ✅ Good for experimentation
- ✅ Multiple model options

**Setup:**
```env
AI_PROVIDER=huggingface
HUGGINGFACE_API_KEY=your-api-key-here
HUGGINGFACE_MODEL=mistralai/Mixtral-8x7B-Instruct-v0.1
```

**Get API Key:** [Hugging Face](https://huggingface.co/settings/tokens)

**Free Tier:**
- 30,000 requests per month
- Great for development

**Popular Models:**
- `mistralai/Mixtral-8x7B-Instruct-v0.1` - High quality
- `meta-llama/Llama-2-7b-chat-hf` - Good balance
- `google/flan-t5-xxl` - Fast responses

---

### 4. Fallback Mode (No API Key Required)

If no AI provider is configured, the system uses an intelligent rule-based fallback that can handle:
- Greetings and basic conversations
- Product queries
- Pricing questions
- Help requests

**Setup:**
```env
AI_PROVIDER=fallback
```

No API keys needed, but responses are more limited.

---

## Configuration Priority

The system will automatically try providers in this order:

1. **Configured provider** (from `AI_PROVIDER` setting)
2. **Google Gemini** (if available)
3. **OpenAI** (if available)
4. **Hugging Face** (if available)
5. **Fallback** (always available)

This ensures your chat always works, even if one provider fails!

---

## Environment Variables Summary

Add these to your `.env` file:

```env
# Choose your AI provider: "gemini", "openai", "huggingface", or "fallback"
AI_PROVIDER=gemini

# Google Gemini (FREE tier available)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro

# OpenAI (Affordable)
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-3.5-turbo

# Hugging Face (FREE tier available)
HUGGINGFACE_API_KEY=your-huggingface-api-key
HUGGINGFACE_MODEL=mistralai/Mixtral-8x7B-Instruct-v0.1
```

---

## Testing Your Setup

After configuring your AI provider, test it by:

1. Starting your backend server:
   ```bash
   uvicorn app.main:app --reload
   ```

2. Opening the chat interface in your web app

3. Sending a test message like: "Hello, can you help me find a laptop?"

4. Check the backend logs to see which provider is being used:
   ```
   INFO: Using Google Gemini for AI response
   ```

---

## Recommendations

### For Development & Testing:
- **Google Gemini** - Free tier is perfect for development

### For Production (Low Cost):
- **Google Gemini** - Still free for moderate usage
- **OpenAI GPT-3.5-turbo** - Very affordable, high quality

### For Production (High Volume):
- **OpenAI GPT-3.5-turbo** - Best balance of cost and quality
- Consider **Google Gemini** for cost savings

### For Maximum Quality:
- **OpenAI GPT-4** - Best quality (change `OPENAI_MODEL=gpt-4`)
- **Google Gemini Pro** - Also excellent quality

---

## Troubleshooting

### "Provider X failed, trying fallback"
- Check your API key is correct
- Verify the API key has proper permissions
- Check your internet connection
- Review the backend logs for detailed error messages

### "No AI provider configured"
- Make sure you've set `AI_PROVIDER` in your `.env` file
- Verify at least one API key is set
- The system will use fallback mode if no providers are available

### Slow responses
- Try switching to a faster model (e.g., `gemini-1.5-flash`)
- Check your internet connection
- Consider using a different provider

---

## Need Help?

- Check the backend logs for detailed error messages
- Verify your API keys are correct
- Make sure dependencies are installed: `pip install -r requirements.txt`
- Review the provider-specific documentation links above

Happy chatting! 🚀









