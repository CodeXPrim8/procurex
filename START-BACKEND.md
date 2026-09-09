# How to Start the Backend Server

## Quick Start

1. **Open a new terminal/PowerShell window**

2. **Navigate to backend directory:**
   ```powershell
   cd C:\Users\clemx\PROCUREMENT\backend
   ```

3. **Activate virtual environment:**
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

4. **Start the server:**
   ```powershell
   uvicorn app.main:app --reload
   ```

5. **You should see:**
   ```
   INFO:     Uvicorn running on http://127.0.0.1:8000
   INFO:     Application startup complete.
   INFO:     Google Gemini client initialized with model: gemini-pro
   ```

## Verify It's Working

- Open: http://localhost:8000/health
- Should show: `{"status":"healthy"}`

## Common Issues

### "Port already in use"
- Another server might be running on port 8000
- Change port: `uvicorn app.main:app --reload --port 8001`

### "Module not found"
- Make sure virtual environment is activated
- Install dependencies: `pip install -r requirements.txt`

### "Supabase credentials not configured"
- Check your `.env` file has `SUPABASE_URL` and `SUPABASE_ANON_KEY`

## Keep This Terminal Open

**Important:** Keep the terminal window open while using the app. Closing it will stop the server.









