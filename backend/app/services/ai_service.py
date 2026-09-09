import json
import re
import logging
import time
from typing import Dict, List, Optional, Any, Generator
from ..core.config import settings

logger = logging.getLogger(__name__)

# Initialize AI clients based on provider
_openai_client = None
_gemini_client = None
_huggingface_available = False

# Initialize OpenAI client
if settings.OPENAI_API_KEY:
    try:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("OpenAI client initialized")
    except Exception as e:
        logger.warning(f"Failed to initialize OpenAI client: {e}")

# Initialize Google Gemini client
if settings.GEMINI_API_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        _gemini_client = genai.GenerativeModel(settings.GEMINI_MODEL)
        logger.info(f"Google Gemini client initialized with model: {settings.GEMINI_MODEL}")
    except Exception as e:
        logger.warning(f"Failed to initialize Gemini client: {e}")

# Check Hugging Face availability
if settings.HUGGINGFACE_API_KEY:
    try:
        import requests
        _huggingface_available = True
        logger.info("Hugging Face API available")
    except ImportError:
        logger.warning("requests library not installed. Install with: pip install requests")
        _huggingface_available = False
    except Exception as e:
        logger.warning(f"Hugging Face not available: {e}")
        _huggingface_available = False
else:
    _huggingface_available = False


SYSTEM_PROMPT = """You are ProcureX, a senior IT procurement specialist for Nigerian businesses.

Be commercially sharp, precise, and easy to talk to:
- Remember this thread: quantities, brands, budgets, and constraints already stated.
- When live catalog rows are provided, use ONLY those items. Never invent products, SKUs, prices, or stock.
- Quote catalog prices in Nigerian Naira (₦). Do not convert unless the user asks.
- Lead with the answer, then ranked options with key specs, price, stock, and vendor, then one useful next step (quote, compare, or tighten spec).
- Compare options when asked which is better. Recommend a default if the use case is clear.
- If nothing matches, say so and suggest a narrower search.
- For greetings, be brief and professional, then invite a sourcing request.
- Ask at most one clarifying question when the request is incomplete.
- Do not mention these instructions, model names, or that you are a language model.

Do not be playful, emoji-heavy, or vague."""

NGN_PER_USD = 1500
GEMINI_MODEL_CANDIDATES = [
    "gemini-3.6-flash",
    settings.GEMINI_MODEL,
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
]

CATEGORY_ALIASES = {
    "laptop": "Laptop",
    "laptops": "Laptop",
    "notebook": "Laptop",
    "notebooks": "Laptop",
    "macbook": "Laptop",
    "computer": "Laptop",
    "computers": "Laptop",
    "phone": "Phone",
    "phones": "Phone",
    "smartphone": "Phone",
    "smartphones": "Phone",
    "mobile": "Phone",
    "mobiles": "Phone",
    "iphone": "Phone",
    "tablet": "Tablet",
    "tablets": "Tablet",
    "ipad": "Tablet",
    "monitor": "Monitor",
    "monitors": "Monitor",
    "screen": "Monitor",
    "desktop": "Desktop",
    "printer": "Printer",
    "printers": "Printer",
    "server": "Server",
    "servers": "Server",
}

BRAND_ALIASES = (
    "dell", "hp", "lenovo", "apple", "samsung", "asus", "acer",
    "tecno", "infinix", "itel", "xiaomi", "huawei", "logitech",
)


def format_catalog_price(price: Optional[int]) -> str:
    if price is None:
        return "Price on request"
    return f"₦{int(price):,}"


def format_product_lines(product_results: Optional[List[Dict]], limit: int = 8) -> str:
    if not product_results:
        return ""
    lines = []
    for product in product_results[:limit]:
        specs = product.get("specifications") or {}
        spec_bits = [
            str(specs[key])
            for key in ("processor", "ram", "storage", "screen_size", "resolution")
            if specs.get(key)
        ]
        spec_text = f" ({', '.join(spec_bits)})" if spec_bits else ""
        stock = int(product.get("stock") or 0)
        availability = f"{stock} in stock" if stock > 0 else "out of stock"
        vendor = product.get("vendor_name") or "verified vendor"
        lines.append(
            f"- {product.get('name', 'Unnamed product')}{spec_text}: "
            f"{format_catalog_price(product.get('price'))}, {availability}, sold by {vendor}."
        )
    return "\n".join(lines)


def _chat_messages(
    user_message: str,
    context: Optional[List[Dict[str, str]]] = None,
    product_results: Optional[List[Dict]] = None,
) -> List[Dict[str, str]]:
    system = SYSTEM_PROMPT
    catalog = format_product_lines(product_results)
    if catalog:
        system += (
            "\n\nLive catalog matches for this request. Use only these items:\n"
            f"{catalog}"
        )
    elif product_results is not None:
        system += (
            "\n\nLive catalog search returned no matching items. "
            "Say that clearly and help the user refine the request."
        )
    messages: List[Dict[str, str]] = [{"role": "system", "content": system}]
    if context:
        for msg in context[-12:]:
            role = msg.get("role") if msg.get("role") in ("user", "assistant") else "user"
            content = (msg.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages


def _compat_client(api_key: str, base_url: Optional[str] = None, extra_headers: Optional[Dict[str, str]] = None):
    from openai import OpenAI
    kwargs: Dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    if extra_headers:
        kwargs["default_headers"] = extra_headers
    return OpenAI(**kwargs)


def _stream_openai_compat(client, models: List[str], messages: List[Dict[str, str]]) -> Generator[str, None, None]:
    last_error = None
    for model in models:
        if not model:
            continue
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.35,
                max_tokens=1400,
                stream=True,
            )
            yielded = False
            for chunk in response:
                delta = None
                if chunk.choices:
                    delta = chunk.choices[0].delta.content
                if delta:
                    yielded = True
                    yield delta
            if yielded:
                return
            last_error = Exception(f"{model} returned an empty response")
        except Exception as exc:
            last_error = exc
            logger.warning("Compatible model %s failed: %s", model, exc)
    raise last_error or Exception("No OpenAI-compatible model available")


def _stream_claude(messages: List[Dict[str, str]], models: List[str]) -> Generator[str, None, None]:
    import httpx

    system = "\n".join(m["content"] for m in messages if m["role"] == "system").strip()
    chat = [m for m in messages if m["role"] in ("user", "assistant")]
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY or "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    last_error = None
    for model in models:
        if not model:
            continue
        try:
            yielded = False
            with httpx.Client(timeout=45.0) as client:
                with client.stream(
                    "POST",
                    "https://api.anthropic.com/v1/messages",
                    headers=headers,
                    json={
                        "model": model,
                        "max_tokens": 1400,
                        "temperature": 0.35,
                        "system": system,
                        "messages": chat,
                        "stream": True,
                    },
                ) as response:
                    if response.status_code >= 400:
                        body = response.read().decode("utf-8", errors="ignore")[:400]
                        raise Exception(f"Claude {model} HTTP {response.status_code}: {body}")
                    for line in response.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if not payload or payload == "[DONE]":
                            continue
                        try:
                            data = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        if data.get("type") == "content_block_delta":
                            text = (data.get("delta") or {}).get("text")
                            if text:
                                yielded = True
                                yield text
            if yielded:
                return
            last_error = Exception(f"{model} returned an empty response")
        except Exception as exc:
            last_error = exc
            logger.warning("Claude model %s failed: %s", model, exc)
    raise last_error or Exception("No Claude model available")


def _ai_attempts(
    user_message: str,
    context: Optional[List[Dict[str, str]]],
    product_results: Optional[List[Dict]],
):
    messages = _chat_messages(user_message, context, product_results)
    used = set()

    def add(name: str, runner):
        if name in used:
            return
        used.add(name)
        attempts.append((name, runner))

    attempts = []

    if settings.XAI_API_KEY:
        client = _compat_client(settings.XAI_API_KEY, "https://api.x.ai/v1")
        add("Grok", lambda: _stream_openai_compat(
            client,
            [settings.GROK_MODEL, "grok-4", "grok-3", "grok-2-latest"],
            messages,
        ))

    if settings.OPENAI_API_KEY:
        client = _compat_client(settings.OPENAI_API_KEY)
        add("ChatGPT", lambda: _stream_openai_compat(
            client,
            [settings.OPENAI_MODEL, "gpt-4o", "gpt-4.1", "gpt-4o-mini"],
            messages,
        ))

    if settings.MOONSHOT_API_KEY:
        client = _compat_client(settings.MOONSHOT_API_KEY, settings.MOONSHOT_BASE_URL)
        add("Kimi", lambda: _stream_openai_compat(
            client,
            [settings.MOONSHOT_MODEL, "kimi-k2-0905", "moonshot-v1-auto", "moonshot-v1-128k"],
            messages,
        ))

    if settings.ANTHROPIC_API_KEY:
        add("Claude", lambda: _stream_claude(
            messages,
            [settings.ANTHROPIC_MODEL, "claude-sonnet-4-5", "claude-3-5-sonnet-latest"],
        ))

    if settings.OPENROUTER_API_KEY:
        client = _compat_client(
            settings.OPENROUTER_API_KEY,
            "https://openrouter.ai/api/v1",
            {
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "ProcureX",
            },
        )
        openrouter_models = [
            ("Grok", [f"x-ai/{settings.GROK_MODEL}", "x-ai/grok-4", "x-ai/grok-3"]),
            ("ChatGPT", [f"openai/{settings.OPENAI_MODEL}", "openai/gpt-4o", "openai/gpt-4.1"]),
            ("Kimi", ["moonshotai/kimi-k2", "moonshotai/kimi-k2-0905", "moonshot/kimi-k2"]),
            ("Claude", ["anthropic/claude-sonnet-4.5", "anthropic/claude-sonnet-4", "anthropic/claude-3.5-sonnet"]),
        ]
        for name, models in openrouter_models:
            add(name, lambda models=models: _stream_openai_compat(client, models, messages))

    if _gemini_client:
        add("Gemini", lambda: _generate_gemini_response(user_message, context, product_results))

    provider = (settings.AI_PROVIDER or "smart").lower()
    if provider in {"grok", "chatgpt", "openai", "kimi", "claude", "gemini"}:
        preferred = {"openai": "ChatGPT", "chatgpt": "ChatGPT"}.get(provider, provider.title())
        attempts.sort(key=lambda item: 0 if item[0] == preferred else 1)

    return attempts


def is_catalog_query(user_message: str, parsed: Optional[Dict[str, Any]] = None) -> bool:
    text = (user_message or "").lower()
    parsed = parsed or {}
    if parsed.get("category") or parsed.get("max_price") or parsed.get("brand") or parsed.get("in_stock_only"):
        return True
    keywords = (
        "laptop", "phone", "tablet", "monitor", "product", "stock", "available",
        "price", "cost", "quote", "quotation", "vendor", "buy", "purchase",
        "naira", "budget", "under", "in stock",
    )
    return any(word in text for word in keywords)


def _generate_gemini_response(
    user_message: str,
    context: Optional[List[Dict[str, str]]] = None,
    product_results: Optional[List[Dict]] = None
) -> Generator[str, None, None]:
    """Generate response using Google Gemini (FREE tier available)."""
    if not _gemini_client:
        raise Exception("Gemini client not initialized")
    
    try:
        import google.generativeai as genai
        
        # Build the full prompt with system context
        system_context = SYSTEM_PROMPT
        catalog = format_product_lines(product_results)
        if catalog:
            system_context += (
                "\n\nLive catalog matches for this request. Use only these items:\n"
                f"{catalog}"
            )
        elif product_results is not None:
            system_context += (
                "\n\nLive catalog search returned no matching items. "
                "Say that clearly and help the user refine the request."
            )
        
        # Build conversation history (increased for better context and learning)
        conversation_text = ""
        if context:
            # Convert context to readable format (keep more messages for better conversation flow)
            # Use last 12 messages (6 exchanges) for better context and memory
            for msg in context[-12:]:
                role = "User" if msg.get("role") == "user" else "Assistant"
                conversation_text += f"{role}: {msg.get('content', '')}\n"
        
        # Build the full prompt
        full_prompt = f"{system_context}\n\n{conversation_text}User: {user_message}\nAssistant:"
        
        generation_config = {
            "temperature": 0.35,
            "top_p": 0.9,
            "top_k": 40,
            "max_output_tokens": 1200,
        }

        def extract_text(chunk) -> str:
            try:
                if hasattr(chunk, "text") and chunk.text:
                    return chunk.text
            except Exception:
                pass
            parts_text = []
            if hasattr(chunk, "parts"):
                for part in chunk.parts:
                    if hasattr(part, "text") and part.text:
                        parts_text.append(part.text)
            if hasattr(chunk, "candidates") and chunk.candidates:
                for candidate in chunk.candidates:
                    content = getattr(candidate, "content", None)
                    parts = getattr(content, "parts", None) if content else None
                    if parts:
                        for part in parts:
                            if hasattr(part, "text") and part.text:
                                parts_text.append(part.text)
            return "".join(parts_text)

        last_model_error = None
        seen = set()
        for candidate in GEMINI_MODEL_CANDIDATES:
            model_name = (candidate or "").replace("models/", "").strip()
            if not model_name or model_name in seen:
                continue
            seen.add(model_name)
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    full_prompt,
                    stream=True,
                    generation_config=generation_config,
                )
                yielded = False
                for chunk in response:
                    text = extract_text(chunk)
                    if text:
                        yielded = True
                        yield text
                if yielded:
                    logger.info("Gemini response generated with %s", model_name)
                    return
                last_model_error = Exception(f"{model_name} returned empty content")
            except Exception as model_error:
                last_model_error = model_error
                logger.warning("Gemini model %s failed: %s", model_name, model_error)

        try:
            logger.info("Attempting non-streaming Gemini fallback...")
            for candidate in seen or GEMINI_MODEL_CANDIDATES:
                model_name = (candidate or "").replace("models/", "").strip()
                if not model_name:
                    continue
                try:
                    fallback_model = genai.GenerativeModel(model_name)
                    simple_response = fallback_model.generate_content(full_prompt)
                    text = extract_text(simple_response)
                    if text:
                        yield text
                        return
                except Exception as fallback_error:
                    last_model_error = fallback_error
                    continue
        except Exception as fallback_error:
            last_model_error = fallback_error

        raise last_model_error or Exception("No Gemini model available")
    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        logger.exception("Full error details:")
        raise


def _generate_openai_response(
    user_message: str,
    context: Optional[List[Dict[str, str]]] = None,
    product_results: Optional[List[Dict]] = None
) -> Generator[str, None, None]:
    """Generate response using OpenAI GPT-3.5-turbo (cheaper than GPT-4)."""
    if not _openai_client:
        raise Exception("OpenAI client not initialized")
    
    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        if context:
            messages.extend(context[-12:])  # Increased for better conversation context
        
        if product_results:
            catalog = format_product_lines(product_results)
            if catalog:
                messages.append({
                    "role": "system",
                    "content": f"Live catalog matches. Use only these items:\n{catalog}",
                })
        
        messages.append({"role": "user", "content": user_message})
        
        response = _openai_client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            temperature=0.9,  # Increased for more creative, engaging responses
            max_tokens=2048,  # Increased for longer, more detailed responses
            stream=True
        )
        
        for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
                
    except Exception as e:
        logger.error(f"OpenAI API error: {str(e)}")
        raise


def _generate_huggingface_response(
    user_message: str,
    context: Optional[List[Dict[str, str]]] = None,
    product_results: Optional[List[Dict]] = None
) -> Generator[str, None, None]:
    """Generate response using Hugging Face Inference API (FREE tier available)."""
    if not _huggingface_available or not settings.HUGGINGFACE_API_KEY:
        raise Exception("Hugging Face not available")
    
    try:
        import requests
        
        # Build prompt
        prompt = SYSTEM_PROMPT + "\n\n"
        
        if context:
            for msg in context[-12:]:  # Increased for better conversation context
                role = "User" if msg.get("role") == "user" else "Assistant"
                prompt += f"{role}: {msg.get('content', '')}\n"
        
        if product_results:
            products_info = "\n".join([
                f"- {p.get('name', 'Unknown')}: ${p.get('price', 0)/100:.2f} (Stock: {p.get('stock', 0)})"
                for p in product_results[:5]
            ])
            prompt += f"\nAvailable products:\n{products_info}\n"
        
        prompt += f"User: {user_message}\nAssistant:"
        
        # Call Hugging Face API
        api_url = f"https://api-inference.huggingface.co/models/{settings.HUGGINGFACE_MODEL}"
        headers = {"Authorization": f"Bearer {settings.HUGGINGFACE_API_KEY}"}
        
        response = requests.post(
            api_url,
            headers=headers,
            json={"inputs": prompt, "parameters": {"max_new_tokens": 512, "temperature": 0.7}},
            stream=True,
            timeout=30
        )
        
        if response.status_code == 200:
            # Parse streaming response
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line.decode('utf-8'))
                        if 'generated_text' in data:
                            text = data['generated_text']
                            # Extract only the new part
                            if prompt in text:
                                new_text = text[len(prompt):]
                                if new_text:
                                    yield new_text
                    except json.JSONDecodeError:
                        continue
        else:
            raise Exception(f"Hugging Face API error: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Hugging Face API error: {str(e)}")
        raise


def _generate_fallback_response(
    user_message: str,
    product_results: Optional[List[Dict]] = None
) -> str:
    """Professional catalog-aware reply when the AI provider is unavailable."""
    lower_message = user_message.lower().strip()
    catalog = format_product_lines(product_results)

    if (re.match(r'^(hello|hi|hey|good morning|good afternoon|good evening|greetings|howdy)$', lower_message) or
        lower_message.startswith('hello ') or lower_message.startswith('hi ') or lower_message.startswith('hey ')):
        return (
            "Good day. I am ProcureX, your IT procurement assistant. "
            "I can help you check catalog items, compare prices, confirm stock, and prepare quotations. "
            "What would you like to source today?"
        )

    if 'how are you' in lower_message or "how's it going" in lower_message:
        return (
            "I am well, thank you. Whenever you are ready, I can search laptops, phones, and other IT equipment "
            "with current prices and availability."
        )

    if catalog:
        if any(word in lower_message for word in ['stock', 'available', 'availability']):
            return (
                "Here is current availability from verified vendors:\n\n"
                f"{catalog}\n\n"
                "Tell me a quantity and I can prepare a quotation."
            )
        if any(word in lower_message for word in ['under', 'budget', 'price', 'cost', 'naira', '$']):
            return (
                "These catalog items match your budget or pricing request:\n\n"
                f"{catalog}\n\n"
                "I can filter further by brand, specification, or quantity."
            )
        return (
            "Here are the matching items in the ProcureX catalog:\n\n"
            f"{catalog}\n\n"
            "Which option should I quote, or would you like a tighter specification?"
        )

    if any(word in lower_message for word in ['laptop', 'phone', 'tablet', 'monitor', 'product', 'stock', 'available', 'price']):
        return (
            "I searched the catalog and did not find a match for that request. "
            "Share a category, brand, budget, or specification and I will search again."
        )

    if re.match(r'^(thanks?|thank you|appreciate it)$', lower_message) or lower_message.startswith('thank'):
        return "You are welcome. Let me know if you need another search or a quotation."

    return (
        "I can help you source IT equipment from verified vendors, including pricing, stock, and quotations. "
        "Tell me what you need, for example laptops, phones, or a budget range."
    )


def generate_ai_response(
    user_message: str,
    context: Optional[List[Dict[str, str]]] = None,
    product_results: Optional[List[Dict]] = None
) -> Generator[str, None, None]:
    """Try Grok, ChatGPT, Kimi, and Claude, then Gemini, then the catalog fallback."""
    for name, runner in _ai_attempts(user_message, context, product_results):
        try:
            logger.info("Using %s for AI response", name)
            produced = False
            for chunk in runner():
                if chunk:
                    produced = True
                    yield chunk
            if produced:
                return
            logger.warning("%s returned no content", name)
        except Exception as exc:
            logger.warning("%s failed: %s", name, exc)

    logger.info("Using fallback response system (no AI provider configured or all failed)")
    try:
        fallback_response = _generate_fallback_response(user_message, product_results)
        if not fallback_response:
            fallback_response = "Good day. I can help you source IT equipment. What do you need?"
        chunk_size = 10
        for i in range(0, len(fallback_response), chunk_size):
            yield fallback_response[i:i + chunk_size]
    except Exception as fallback_error:
        logger.error("Even fallback response failed: %s", fallback_error)
        yield "I can help with IT procurement. Please try that request again."


def parse_product_query(user_query: str) -> Dict[str, Any]:
    """Extract category, brand, and budget from a buyer request."""
    text = (user_query or "").strip()
    lower = text.lower()
    category = None
    for alias, label in CATEGORY_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", lower):
            category = label
            break

    brand = next((name for name in BRAND_ALIASES if re.search(rf"\b{re.escape(name)}\b", lower)), None)

    max_price = None
    naira_match = re.search(r"(?:₦|ngn|naira)\s*([\d,]+)", lower)
    k_match = re.search(r"(\d+)\s*k\b", lower)
    usd_match = re.search(r"\$\s*([\d,]+)", lower)
    under_match = re.search(r"(?:under|below|less than|max(?:imum)?)\s*\$?\s*([\d,]+)", lower)
    if naira_match:
        max_price = int(naira_match.group(1).replace(",", ""))
    elif k_match and any(token in lower for token in ("naira", "₦", "ngn", "budget")):
        max_price = int(k_match.group(1)) * 1000
    elif usd_match:
        max_price = int(usd_match.group(1).replace(",", "")) * NGN_PER_USD
    elif under_match:
        amount = int(under_match.group(1).replace(",", ""))
        max_price = amount * NGN_PER_USD if amount <= 5000 else amount

    in_stock_only = any(token in lower for token in ("in stock", "available", "availability", "stock"))
    if category == "Phone" and "available phones" in lower:
        in_stock_only = True

    return {
        "category": category,
        "query": text,
        "specifications": {},
        "budget": max_price,
        "max_price": max_price,
        "brand": brand.title() if brand else None,
        "quantity": 1,
        "in_stock_only": in_stock_only,
    }


def suggest_alternatives(
    unavailable_product: str,
    available_products: List[Dict],
    user_requirements: Dict[str, Any]
) -> str:
    """Generate alternative product suggestions using AI."""
    products_info = "\n".join([
        f"- {p.get('name', 'Unknown')}: ${p.get('price', 0)/100:.2f}, Specs: {p.get('specifications', {})}"
        for p in available_products[:5]
    ])
    
    prompt = f"The requested product '{unavailable_product}' is not available. Here are some alternatives:\n{products_info}\n\nPlease suggest the best alternatives based on the user's requirements: {user_requirements}"
    
    try:
        # Try to use AI
        response_text = ""
        for chunk in generate_ai_response(prompt, None, available_products):
            response_text += chunk
        
        if response_text:
            return response_text
    except Exception as e:
        logger.warning(f"AI alternative suggestion failed: {e}")
    
    # Fallback
    return f"Here are some alternatives: {', '.join([p.get('name', 'Unknown') for p in available_products[:3]])}"
