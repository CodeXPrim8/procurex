"""Generate short, ChatGPT-style names for chat sessions."""
import logging
import re
from typing import Iterable, List, Optional

logger = logging.getLogger(__name__)

PLACEHOLDER_TITLES = {"new chat", "newchat", "chat", "greeting", "untitled"}
GENERIC_LABELS = {
    "quotation",
    "vendors",
    "product availability",
    "pricing",
    "laptops",
    "phones",
    "tablets",
    "monitors",
    "printers",
    "accessories",
    "software",
    "services",
}
SMALLTALK = {
    "hello",
    "hi",
    "hey",
    "hiya",
    "yo",
    "sup",
    "howdy",
    "hola",
    "thanks",
    "thank you",
    "thx",
    "ok",
    "okay",
    "k",
    "yes",
    "no",
    "please",
    "cool",
    "great",
    "nice",
    "sure",
    "yeah",
    "yep",
    "good",
    "morning",
    "afternoon",
    "evening",
    "good morning",
    "good afternoon",
    "good evening",
    "good night",
    "how are you",
    "how's it going",
    "hows it going",
    "what's up",
    "whats up",
    "how do you do",
}
FILLER_PATTERNS = (
    re.compile(r"^(please\s+)?(can you|could you|would you|will you)\s+", re.I),
    re.compile(r"^(i(?:'m| am)?\s+)?(need|want|looking for|gonna need|wanna)\s+", re.I),
    re.compile(r"^(show me|find me|find|get me|give me|help me(?: find| with)?|search(?: for)?)\s+", re.I),
    re.compile(r"^(what(?:'s| is| are)|whats)\s+", re.I),
    re.compile(r"^(how much(?: is| are)?|how many)\s+", re.I),
    re.compile(r"^(tell me about|recommend|suggest)\s+", re.I),
    re.compile(r"^(yes|yeah|yep|ok|okay)[,.\s]+", re.I),
    re.compile(r"^(please\s+)?(generate|create|make)\s+(a |an |me )?", re.I),
)
SPEC_TAIL = re.compile(
    r"\s+(?:with|that has|that have|which has|which have)\b.*$",
    re.I,
)
TOPIC_RULES = (
    (re.compile(r"\bquot(?:e|es|ation|ations)\b", re.I), "Quotation"),
    (re.compile(r"\b(?:vendor|vendors|supplier|suppliers)\b", re.I), "Vendors"),
    (re.compile(r"\b(?:stock|availability|in stock|available)\b", re.I), "Product availability"),
    (re.compile(r"\b(?:price|prices|pricing|cost|budget)\b", re.I), "Pricing"),
    (re.compile(r"\b(?:laptops?|notebooks?|computers?)\b", re.I), "Laptops"),
    (re.compile(r"\b(?:phones?|smartphones?|mobiles?)\b", re.I), "Phones"),
    (re.compile(r"\b(?:tablets?|ipads?)\b", re.I), "Tablets"),
    (re.compile(r"\b(?:monitors?|screens?)\b", re.I), "Monitors"),
    (re.compile(r"\bprinters?\b", re.I), "Printers"),
    (re.compile(r"\b(?:mouse|keyboard|headset|accessories)\b", re.I), "Accessories"),
    (re.compile(r"\b(?:software|saas|crm|erp|app|apps)\b", re.I), "Software"),
    (re.compile(r"\b(?:website|web design|web development|app development|service|services)\b", re.I), "Services"),
)
BRANDS = (
    "dell",
    "hp",
    "lenovo",
    "apple",
    "macbook",
    "samsung",
    "asus",
    "acer",
    "microsoft",
    "surface",
    "toshiba",
    "cisco",
    "logitech",
    "huawei",
    "xiaomi",
    "infinix",
    "tecno",
    "itel",
    "hp",
)
PRODUCT_WORDS = {
    "laptop",
    "laptops",
    "notebook",
    "notebooks",
    "computer",
    "computers",
    "phone",
    "phones",
    "smartphone",
    "smartphones",
    "tablet",
    "tablets",
    "monitor",
    "monitors",
    "printer",
    "printers",
    "server",
    "servers",
    "quotation",
    "quote",
    "quotes",
    "software",
    "saas",
    "website",
    "service",
    "services",
}
SMALL_WORDS = {"a", "an", "the", "and", "or", "for", "of", "in", "on", "to", "with", "under"}
ACRONYMS = {"hp", "ibm", "ram", "ssd", "hdd", "it", "rfq", "po", "gpu", "cpu", "usb", "wifi"}
STOP_WORDS = {
    "a",
    "an",
    "the",
    "me",
    "my",
    "some",
    "any",
    "please",
    "just",
    "this",
    "that",
    "those",
    "these",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\n", " ")).strip()


def _plain(text: str) -> str:
    return re.sub(r"[^\w\s$]", "", _normalize(text).lower()).strip()


def is_placeholder_title(title: Optional[str]) -> bool:
    if not title or not title.strip():
        return True
    cleaned = _plain(title)
    if cleaned in PLACEHOLDER_TITLES or cleaned.startswith("chat "):
        return True
    if re.fullmatch(r"greeting(?:\s+\d+)?", cleaned):
        return True
    return False


def is_weak_title(title: Optional[str]) -> bool:
    if is_placeholder_title(title):
        return True
    return is_smalltalk(title or "")


def unique_chat_title(base: str, existing: Iterable[str]) -> str:
    wanted = (base or "New chat").strip()[:80] or "New chat"
    taken = {(item or "").strip().lower() for item in existing if (item or "").strip()}
    if wanted.lower() not in taken:
        return wanted
    for number in range(2, 100):
        candidate = f"{wanted} {number}"[:80]
        if candidate.lower() not in taken:
            return candidate
    return f"{wanted} {int(__import__('time').time()) % 1000}"[:80]


def is_smalltalk(text: str) -> bool:
    cleaned = _plain(text)
    if not cleaned:
        return True
    if cleaned in SMALLTALK:
        return True
    words = cleaned.split()
    if len(words) <= 4 and words[0] in SMALLTALK:
        return True
    return False


def _pretty_word(word: str, index: int) -> str:
    spec = re.match(r"^(\d+)(gb|tb|mb|ghz)$", word, re.I)
    if spec:
        return spec.group(1) + spec.group(2).upper()
    lower = word.lower()
    if lower in ACRONYMS:
        return lower.upper()
    if lower in SMALL_WORDS and index > 0:
        return lower
    if word.isupper() and len(word) <= 4:
        return word
    return word[:1].upper() + word[1:]


def _title_case(text: str) -> str:
    words = [part for part in text.split(" ") if part]
    return " ".join(_pretty_word(word, index) for index, word in enumerate(words))


def _strip_fillers(text: str) -> str:
    cleaned = _normalize(text)
    cleaned = SPEC_TAIL.sub("", cleaned)
    changed = True
    while changed:
        changed = False
        for pattern in FILLER_PATTERNS:
            updated = pattern.sub("", cleaned).strip()
            if updated != cleaned:
                cleaned = updated
                changed = True
    cleaned = re.sub(r"[?!.]+$", "", cleaned).strip(" -:,")
    return cleaned


def _meaningful_messages(messages: Iterable[str]) -> List[str]:
    return [text for text in messages if text and not is_smalltalk(text)]


def _compact_phrase(text: str) -> str:
    words = []
    for raw in text.split(" "):
        token = re.sub(r"[^\w$%.-]", "", raw)
        if not token:
            continue
        if token.lower() in STOP_WORDS and len(words) > 0:
            continue
        words.append(token)
        if len(words) >= 6:
            break
    phrase = " ".join(words).strip(" -")
    if len(phrase) > 42:
        phrase = phrase[:42].rsplit(" ", 1)[0]
    return phrase


def _brand_product_title(text: str) -> Optional[str]:
    lower = text.lower()
    brand = next((name for name in BRANDS if re.search(rf"\b{re.escape(name)}\b", lower)), None)
    product_tokens = [
        word
        for word in text.split(" ")
        if re.sub(r"[^\w]", "", word).lower() in PRODUCT_WORDS
    ]
    concrete = next(
        (
            word
            for word in product_tokens
            if re.sub(r"[^\w]", "", word).lower() not in {"quotation", "quote", "quotes"}
        ),
        None,
    )
    product = concrete or (product_tokens[0] if product_tokens else None)
    qty = re.search(r"\b(\d+)\s+(?!gb|tb|mb|ghz\b)", text, re.I)
    parts: List[str] = []
    if qty:
        count = int(qty.group(1))
        if 1 < count <= 200:
            parts.append(qty.group(1))
    if brand:
        parts.append(brand)
    if product:
        parts.append(product)
    if brand and product:
        return _title_case(" ".join(parts))
    return None


def _named_product_title(text: str) -> Optional[str]:
    match = re.search(
        r"\b([a-z0-9][\w-]*\.(?:ng|com|io|app|ai|co|net|org|dev))\b",
        text,
        re.I,
    )
    return match.group(1) if match else None


def _title_from_source(source: str) -> Optional[str]:
    stripped = _strip_fillers(source)
    named = _named_product_title(stripped or source)
    if named:
        return named
    branded = _brand_product_title(stripped or source)
    if branded:
        return branded

    compact = _compact_phrase(stripped or source)
    compact = re.sub(r"^(a|an)\s+", "", compact, flags=re.I).strip()
    if compact and not is_smalltalk(compact) and len(compact.split()) >= 2:
        return _title_case(compact)

    for pattern, label in TOPIC_RULES:
        if pattern.search(source):
            return label

    if compact and not is_smalltalk(compact) and len(compact) >= 3:
        return _title_case(compact)
    return None


def _title_specificity(title: str, source: str) -> int:
    score = 0
    if "." in source:
        score += 8
    if _plain(title) not in GENERIC_LABELS:
        score += 5
    score += min(len(title.split()), 6)
    return score


def heuristic_chat_title(messages: Iterable[str]) -> Optional[str]:
    meaningful = _meaningful_messages(messages)
    if not meaningful:
        if any(_normalize(text) for text in messages):
            return "Greeting"
        return None

    best: Optional[str] = None
    best_score = -1
    for source in meaningful:
        title = _title_from_source(source)
        if not title:
            continue
        score = _title_specificity(title, source)
        if score >= best_score:
            best = title
            best_score = score
    return best


def should_replace_title(current: Optional[str], messages: Iterable[str]) -> bool:
    if is_weak_title(current):
        return True
    texts = [text for text in messages if text]
    if not texts:
        return False
    first = _normalize(texts[0])
    current_clean = _normalize(current or "")
    if first and current_clean.lower() == first[: len(current_clean)].lower():
        return True
    if re.match(r"^\d{3,}\b", current_clean):
        return True
    if len(current_clean) > 42:
        return True
    proposed = heuristic_chat_title(texts)
    if (
        proposed
        and _plain(current or "") in GENERIC_LABELS
        and _plain(proposed) not in GENERIC_LABELS
    ):
        return True
    return False


def natural_chat_title(messages: Iterable[str], current: Optional[str] = None) -> Optional[str]:
    title = heuristic_chat_title(messages)
    if not title:
        return None
    if current and not should_replace_title(current, messages):
        return current
    return title
