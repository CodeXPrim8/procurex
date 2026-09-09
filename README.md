# AI-Powered IT Procurement & Vendor Verification System

An intelligent platform that simplifies and automates the entire IT procurement process. The system allows users to request prices for IT devices, receive real-time availability, and get verified vendor details through a ChatGPT-like interface.

## Features

- **AI-Powered Chat Interface**: Natural language queries for product searches
- **Real-time Product Search**: Find IT products with pricing and availability
- **Vendor Verification**: Automated vendor verification system
- **Stock Management**: Real-time stock level checking and updates
- **Alternative Suggestions**: AI suggests alternatives when products are unavailable
- **Quotation Generation**: Professional PDF quotations
- **Vendor Dashboard**: Portal for vendors to manage products and stock
- **Cross-Platform**: Web (Next.js) and Mobile (React Native/Expo) apps

## Tech Stack

### Backend
- **FastAPI** - Python web framework
- **PostgreSQL** - Database
- **SQLAlchemy** - ORM
- **Multi-Provider AI** - Supports Google Gemini (free), OpenAI GPT-3.5-turbo, Hugging Face (free), with intelligent fallback
- **WebSockets** - Real-time communication
- **ReportLab** - PDF generation

### Web Frontend
- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management

### Mobile App
- **React Native** - Mobile framework
- **Expo** - Development platform
- **Expo Router** - Navigation

## Project Structure

```
PROCUREMENT/
├── backend/          # FastAPI backend
├── web/              # Next.js web app
├── mobile/           # React Native/Expo mobile app
└── shared/           # Shared types/utilities
```

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up PostgreSQL database:
```bash
createdb procurement_db
```

5. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your settings (database URL, OpenAI API key, etc.)
```

6. Run the server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at `http://localhost:8000`
API Documentation: `http://localhost:8000/docs`

### Web App Setup

1. Navigate to web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Run development server:
```bash
npm run dev
```

Web app will be available at `http://localhost:3000`

### Mobile App Setup

1. Navigate to mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Start Expo:
```bash
npm start
```

4. Use Expo Go app on your phone or run on simulator:
```bash
npm run ios    # iOS simulator
npm run android # Android emulator
```

## Environment Variables

### Backend (.env)
- `DATABASE_URL` - PostgreSQL connection string
- `SECRET_KEY` - JWT secret key
- `AI_PROVIDER` - AI provider to use: "gemini" (recommended, free), "openai", "huggingface", or "fallback"
- `GEMINI_API_KEY` - Google Gemini API key (free tier available) - [Get it here](https://makersuite.google.com/app/apikey)
- `OPENAI_API_KEY` - OpenAI API key (optional, for GPT-3.5-turbo)
- `HUGGINGFACE_API_KEY` - Hugging Face API key (optional, free tier available)
- `CORS_ORIGINS` - Allowed CORS origins
- `REDIS_URL` - Redis connection (for background jobs)

**See [AI-SETUP.md](backend/AI-SETUP.md) for detailed AI provider setup instructions.**

### Web (.env.local)
- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:8000)

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user

### Products
- `GET /api/v1/products/search` - Search products
- `GET /api/v1/products/{id}` - Get product details
- `GET /api/v1/products/{id}/alternatives` - Get alternative products

### Chat
- `POST /api/v1/chat/sessions` - Create chat session
- `GET /api/v1/chat/sessions` - List chat sessions
- `GET /api/v1/chat/sessions/{id}` - Get chat session
- `POST /api/v1/chat/sessions/{id}/messages` - Send message
- `WS /api/v1/chat/ws/{session_id}` - WebSocket for streaming

### Vendors
- `POST /api/v1/vendors` - Register as vendor
- `GET /api/v1/vendors/me` - Get my vendor account
- `PUT /api/v1/vendors/me` - Update vendor info
- `POST /api/v1/vendors/me/products` - Add product
- `PUT /api/v1/vendors/me/products/{id}/stock` - Update stock

### Quotations
- `POST /api/v1/quotations` - Create quotation
- `GET /api/v1/quotations` - List quotations
- `GET /api/v1/quotations/{id}` - Get quotation
- `GET /api/v1/quotations/{id}/pdf` - Download PDF

## Usage

1. **Register/Login**: Create an account or login
2. **Search Products**: Use the chat interface to ask about IT products
3. **Get Pricing**: AI will search and provide pricing information
4. **Generate Quotations**: Create professional quotations from search results
5. **Vendor Portal**: Vendors can register, list products, and manage stock

## Development

### Running Background Tasks

Background tasks for vendor verification and stock checking can be run separately:

```bash
python backend/app/services/background_tasks.py
```

### Database Migrations

When using Alembic (optional):

```bash
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

## License

MIT


