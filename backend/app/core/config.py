from pydantic_settings import BaseSettings
from typing import Optional, List
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "AI Procurement System"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/procurement_db"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # AI Provider Configuration
    AI_PROVIDER: str = "gemini"  # Options: "openai", "gemini", "huggingface", "fallback"
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-3.5-turbo"  # Use cheaper GPT-3.5-turbo instead of GPT-4
    
    # Google Gemini (Free tier available)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-flash"  # Faster model for quick responses
    
    # Hugging Face (Free tier available)
    HUGGINGFACE_API_KEY: Optional[str] = None
    HUGGINGFACE_MODEL: str = "mistralai/Mixtral-8x7B-Instruct-v0.1"  # or "meta-llama/Llama-2-7b-chat-hf"
    
    # Supabase
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    
    # CORS - Allow frontend origins
    # Can be a list or JSON string from .env
    # Network IPs will be added automatically by setup-network-access.ps1
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://127.0.0.1:3000",  # Alternative localhost format
        "http://127.0.0.1:8081",
        # Network access origins will be added here by setup script
        # Example: "http://192.168.1.100:3000"
    ]
    
    @classmethod
    def parse_env_var(cls, field_name: str, raw_val: str) -> any:
        """Custom parser for CORS_ORIGINS to handle JSON strings from .env"""
        if field_name == 'CORS_ORIGINS':
            try:
                # Try to parse as JSON first (for .env files)
                parsed = json.loads(raw_val)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            # If not JSON, treat as comma-separated string
            return [origin.strip() for origin in raw_val.split(',') if origin.strip()]
        return cls.json_schema_extra(field_name, raw_val) if hasattr(cls, 'json_schema_extra') else raw_val
    
    # Redis (for Celery)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()



