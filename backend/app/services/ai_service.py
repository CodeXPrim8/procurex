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


SYSTEM_PROMPT = """You are ProcureX, an intelligent AI assistant with a warm, engaging personality. Think of yourself as a knowledgeable friend who happens to be an expert in IT procurement, but you're much more than that.

**Your Personality:**
- You're curious, friendly, and genuinely interested in the user
- You have a sense of humor and can be playful when appropriate
- You're empathetic and understand context beyond just the words
- You remember details from previous conversations and reference them naturally
- You can discuss ANY topic - technology, life, hobbies, work, or just have a casual chat
- You're proactive and offer insights, not just answers
- You learn from each conversation and adapt your style to match the user's preferences

**Your Core Function:**
While you excel at helping with IT procurement (finding products, comparing prices, checking availability, generating quotations), you're NOT limited to that. You're a full conversational AI that can:
- Have meaningful conversations about any topic
- Share insights, opinions, and perspectives
- Ask follow-up questions to understand the user better
- Remember preferences, past discussions, and context
- Be helpful in general life situations, not just procurement

**When Helping with Procurement:**
- Extract product requirements naturally from conversation
- Understand context (work needs, personal use, budget constraints)
- Suggest alternatives thoughtfully, explaining trade-offs
- Remember user preferences and past purchases
- Be honest about limitations and help find the best fit

**Conversation Style:**
- Be natural, conversational, and engaging - like ChatGPT
- Use the user's name if you know it
- Reference previous parts of the conversation
- Ask clarifying questions when helpful
- Show personality - be a bit witty, thoughtful, or curious
- Don't be robotic or overly formal unless the situation calls for it
- Adapt your tone to match the user's (casual, professional, technical, etc.)

**Learning & Memory:**
- Remember important details the user shares (preferences, constraints, past experiences)
- Reference previous conversations naturally
- Build on what you've learned about the user
- Notice patterns in their needs or interests

You're here to be helpful, engaging, and genuinely useful - whether that's finding the perfect laptop or just having an interesting conversation. Be yourself, be curious, and be genuinely helpful."""


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
        if product_results:
            products_info = "\n".join([
                f"- {p.get('name', 'Unknown')}: ${p.get('price', 0)/100:.2f} (Stock: {p.get('stock', 0)})"
                for p in product_results[:5]
            ])
            system_context += f"\n\nAvailable products:\n{products_info}"
        
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
        
        # Generate response with streaming
        try:
            # Create model instance (recreate if needed to ensure it's fresh)
            model_name = settings.GEMINI_MODEL
            try:
                model = genai.GenerativeModel(model_name)
            except Exception as model_error:
                logger.warning(f"Failed to create model {model_name}, trying gemini-pro: {model_error}")
                # Fallback to a known working model
                model = genai.GenerativeModel("gemini-pro")
            
            # Generate with proper config format
            generation_config = {
                "temperature": 0.9,  # Increased for more creative, engaging responses
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 2048,  # Increased for longer, more detailed responses
            }
            
            response = model.generate_content(
                full_prompt,
                stream=True,
                generation_config=generation_config
            )
            
            # Stream the response
            for chunk in response:
                try:
                    # Try different ways to access the text
                    if hasattr(chunk, 'text') and chunk.text:
                        yield chunk.text
                    elif hasattr(chunk, 'parts'):
                        for part in chunk.parts:
                            if hasattr(part, 'text') and part.text:
                                yield part.text
                    elif hasattr(chunk, 'candidates') and chunk.candidates:
                        for candidate in chunk.candidates:
                            if hasattr(candidate, 'content') and candidate.content:
                                if hasattr(candidate.content, 'parts'):
                                    for part in candidate.content.parts:
                                        if hasattr(part, 'text') and part.text:
                                            yield part.text
                except Exception as chunk_error:
                    logger.warning(f"Error processing chunk: {chunk_error}")
                    continue
        except Exception as api_error:
            error_msg = str(api_error)
            logger.error(f"Gemini API streaming call failed: {error_msg}")
            logger.exception("Full API error traceback:")
            
            # Try a simpler non-streaming approach as fallback
            try:
                logger.info("Attempting non-streaming fallback...")
                # Create fresh model instance for fallback
                try:
                    fallback_model = genai.GenerativeModel(settings.GEMINI_MODEL)
                except:
                    fallback_model = genai.GenerativeModel("gemini-pro")
                
                simple_response = fallback_model.generate_content(full_prompt)
                
                # Extract text from response
                if hasattr(simple_response, 'text') and simple_response.text:
                    yield simple_response.text
                elif hasattr(simple_response, 'candidates') and simple_response.candidates:
                    # Extract text from candidates
                    for candidate in simple_response.candidates:
                        if hasattr(candidate, 'content') and candidate.content:
                            if hasattr(candidate.content, 'parts'):
                                for part in candidate.content.parts:
                                    if hasattr(part, 'text') and part.text:
                                        yield part.text
                else:
                    raise Exception(f"Could not extract text from response: {type(simple_response)}")
            except Exception as fallback_error:
                logger.error(f"Fallback also failed: {fallback_error}")
                # Re-raise with more context
                raise Exception(f"Gemini API failed: {error_msg}. Fallback also failed: {str(fallback_error)}")
                
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
            products_info = "\n".join([
                f"- {p.get('name', 'Unknown')}: ${p.get('price', 0)/100:.2f} (Stock: {p.get('stock', 0)})"
                for p in product_results[:5]
            ])
            messages.append({
                "role": "system",
                "content": f"Available products:\n{products_info}"
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
    """Generate intelligent fallback response when no AI provider is configured."""
    lower_message = user_message.lower().strip()
    
    # Greeting responses
    if (re.match(r'^(hello|hi|hey|good morning|good afternoon|good evening|greetings|howdy)$', lower_message) or 
        lower_message.startswith('hello ') or lower_message.startswith('hi ') or lower_message.startswith('hey ')):
        response = "Hey there! 👋 I'm ProcureX, your AI assistant. I'm here to help with IT procurement when you need it, but I'm also just happy to chat about anything - technology, work, life, or whatever's on your mind. What's up?"
    
    # How are you
    elif 'how are you' in lower_message or "how's it going" in lower_message or 'how do you do' in lower_message:
        response = "I'm doing fantastic, thanks for asking! 😊 I love chatting with people and helping out however I can. How are you doing today? Anything interesting happening, or just looking to get some work done?"
    
    # Thank you
    elif re.match(r'^(thanks?|thank you|appreciate it)$', lower_message) or lower_message.startswith('thank'):
        response = "You're very welcome! I'm happy to help. Is there anything else you'd like to know about our products or services?"
    
    # Product-related queries
    elif any(word in lower_message for word in ['product', 'laptop', 'phone', 'tablet', 'monitor', 'keyboard', 'mouse', 'printer', 'server']):
        if product_results and len(product_results) > 0:
            products_list = "\n".join([
                f"• {p.get('name', 'Unknown Product')}: ${p.get('price', 0)/100:.2f} (In Stock: {p.get('stock', 0)} units)"
                for p in product_results[:5]
            ])
            response = f"I found {len(product_results)} product(s) matching your query:\n\n{products_list}\n\nWould you like more details about any of these products, or help creating a quotation?"
        else:
            response = "I can help you find IT products! Could you provide more specific details about what you're looking for? For example:\n\n• Product type (laptop, phone, tablet, etc.)\n• Specifications (RAM, storage, screen size, etc.)\n• Budget range\n• Quantity needed\n\nOnce you provide these details, I'll search our catalog and show you matching products with pricing and vendor information."
    
    # Price/cost queries
    elif any(word in lower_message for word in ['price', 'cost', 'how much', 'pricing', 'quote']):
        response = "I can help you get pricing information! To provide accurate prices for IT products, I need to know:\n\n• What product are you interested in?\n• Any specific specifications or brand preferences?\n• Quantity needed?\n\nOnce you provide these details, I'll search our database and show you current prices from verified vendors along with availability."
    
    # Vendor queries
    elif any(word in lower_message for word in ['vendor', 'supplier', 'seller', 'who sells']):
        response = "ProcureX connects you with verified vendors for IT products. I can help you:\n\n• Find vendors for specific products\n• View vendor profiles and contact information\n• Check vendor ratings and verification status\n• See product catalogs from different vendors\n\nWhat product are you looking for? I'll show you verified vendors who have it available."
    
    # Availability/stock queries
    elif any(word in lower_message for word in ['available', 'stock', 'in stock', 'availability', 'inventory']):
        if product_results and len(product_results) > 0:
            stock_info = "\n".join([
                f"• {p.get('name', 'Unknown')}: {p.get('stock', 0)} units available"
                for p in product_results if p.get('stock', 0) > 0
            ])
            if stock_info:
                response = f"Here's the current availability:\n\n{stock_info}\n\nWould you like to create a quotation for any of these products?"
            else:
                response = "I found some products, but they're currently out of stock. Would you like me to suggest similar alternatives that are available?"
        else:
            response = "I can check availability for any product you're interested in. Just let me know:\n\n• Product name or type\n• Specifications (if needed)\n\nAnd I'll show you current stock levels from our verified vendors."
    
    # Quotation queries
    elif any(word in lower_message for word in ['quotation', 'quote', 'quote me', 'create quote', 'generate quote']):
        response = "I can help you create a professional quotation! To generate a quote, I'll need:\n\n• Product(s) you want to include\n• Quantities for each product\n• Any special requirements or notes\n\nOnce you provide these details, I'll create a detailed quotation with pricing, specifications, vendor information, and delivery estimates. Would you like to start building a quote?"
    
    # Specification queries
    elif any(word in lower_message for word in ['spec', 'specification', 'specs', 'features', 'what does it have']):
        response = "I can provide detailed specifications for IT products! To help you better, please specify:\n\n• Product name or type\n• Specific features you're interested in (RAM, storage, processor, screen size, etc.)\n\nI'll show you detailed specifications, compare options, and help you find the best match for your needs."
    
    # Help/general queries
    elif any(word in lower_message for word in ['help', 'what can you do', 'capabilities', 'how can you help']):
        response = """I'm ProcureX, your AI procurement assistant! Here's what I can help you with:

🔍 **Product Discovery**: Find IT products matching your requirements
💰 **Pricing Information**: Get current prices from verified vendors
📊 **Availability Checks**: Check stock levels in real-time
🏢 **Vendor Connections**: Connect with verified suppliers
📄 **Quotation Generation**: Create professional procurement quotes
📋 **Product Comparison**: Compare specifications and prices
✨ **Smart Recommendations**: Get AI-powered product suggestions

Just tell me what you're looking for, and I'll help you find it quickly and efficiently!"""
    
    # Default response
    else:
        response = "That's interesting! I'd love to chat about that, though I should mention that for detailed product searches, pricing, and vendor information, you'll get the best results when you're logged in.\n\nBut hey, I'm also here for general conversation! Feel free to ask me about anything - technology, work, life, or just chat. What's on your mind?"
    
    return response


def generate_ai_response(
    user_message: str,
    context: Optional[List[Dict[str, str]]] = None,
    product_results: Optional[List[Dict]] = None
) -> Generator[str, None, None]:
    """
    Generate AI response using the configured provider.
    Supports: Google Gemini (free), OpenAI GPT-3.5-turbo, Hugging Face (free), or fallback.
    """
    provider = settings.AI_PROVIDER.lower()
    
    # Try the configured provider first
    try:
        if provider == "gemini" and _gemini_client:
            logger.info("Using Google Gemini for AI response")
            for chunk in _generate_gemini_response(user_message, context, product_results):
                yield chunk
            return
        elif provider == "openai" and _openai_client:
            logger.info("Using OpenAI for AI response")
            for chunk in _generate_openai_response(user_message, context, product_results):
                yield chunk
            return
        elif provider == "huggingface" and _huggingface_available:
            logger.info("Using Hugging Face for AI response")
            for chunk in _generate_huggingface_response(user_message, context, product_results):
                yield chunk
            return
        else:
            # Provider configured but client not initialized
            if provider == "gemini" and not _gemini_client:
                logger.warning("Gemini configured but client not initialized - check GEMINI_API_KEY")
            elif provider == "openai" and not _openai_client:
                logger.warning("OpenAI configured but client not initialized - check OPENAI_API_KEY")
            elif provider == "huggingface" and not _huggingface_available:
                logger.warning("Hugging Face configured but not available - check HUGGINGFACE_API_KEY")
    except Exception as e:
        logger.error(f"Provider {provider} failed with error: {e}")
        logger.exception("Full error traceback:")
        # Don't return here - fall through to fallback providers
    
    # Fallback: Try other available providers
    if provider != "gemini" and _gemini_client:
        try:
            logger.info("Falling back to Google Gemini")
            for chunk in _generate_gemini_response(user_message, context, product_results):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"Gemini fallback failed: {e}")
    
    if provider != "openai" and _openai_client:
        try:
            logger.info("Falling back to OpenAI")
            for chunk in _generate_openai_response(user_message, context, product_results):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"OpenAI fallback failed: {e}")
    
    if provider != "huggingface" and _huggingface_available:
        try:
            logger.info("Falling back to Hugging Face")
            for chunk in _generate_huggingface_response(user_message, context, product_results):
                yield chunk
            return
        except Exception as e:
            logger.warning(f"Hugging Face fallback failed: {e}")
    
    # Final fallback: Use intelligent rule-based response
    logger.info("Using fallback response system (no AI provider configured or all failed)")
    try:
        fallback_response = _generate_fallback_response(user_message, product_results)
        if not fallback_response:
            fallback_response = "Hello! I'm here to help. What can I assist you with today?"
        # Stream response in larger chunks for faster display (no artificial delay)
        chunk_size = 10
        for i in range(0, len(fallback_response), chunk_size):
            yield fallback_response[i:i + chunk_size]
    except Exception as fallback_error:
        logger.error(f"Even fallback response failed: {fallback_error}")
        logger.exception("Fallback error traceback:")
        # Ultimate fallback - simple response
        yield "Hello! I'm here to help. It looks like there might be a configuration issue with the AI service. Please check the backend logs for more details."


def parse_product_query(user_query: str) -> Dict[str, Any]:
    """Parse user query to extract product requirements using AI."""
    provider = settings.AI_PROVIDER.lower()
    
    # Try to use AI for parsing
    try:
        if provider == "gemini" and _gemini_client:
            import google.generativeai as genai
            prompt = f"""Extract product requirements from this query: "{user_query}"

Return JSON with: category, specifications (object), budget (number or null), brand (string or null), quantity (number or 1).

Example: {{"category": "laptop", "specifications": {{"ram": "16GB"}}, "budget": 1000, "brand": "Dell", "quantity": 1}}"""
            
            response = _gemini_client.generate_content(prompt)
            result = json.loads(response.text)
            result["query"] = user_query
            return result
        elif provider == "openai" and _openai_client:
            response = _openai_client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "Extract product requirements from user queries. Return JSON with: category, specifications (object), budget (number or null), brand (string or null), quantity (number or 1)."},
                    {"role": "user", "content": user_query}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            result = json.loads(response.choices[0].message.content)
            result["query"] = user_query
            return result
    except Exception as e:
        logger.warning(f"AI parsing failed: {e}")
    
    # Fallback parsing
    return {
        "category": "unknown",
        "query": user_query,
        "specifications": {},
        "budget": None
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
