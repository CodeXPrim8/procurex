# 🔧 Update Backend .env File

## ✅ You Need to Manually Update `backend/.env`

The file is protected, so please open it in your editor and update these 3 lines:

### **Replace these lines in `backend/.env`:**

```env
SUPABASE_URL=https://aoszzmfazqperudswhxa.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvc3p6bWZhenFwZXJ1ZHN3aHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTIxNzEsImV4cCI6MjA4NDA4ODE3MX0.BVmRFLWzKK6bZ2jQFS_Ey9lmemnYt3KNI8wg-whM7Cs
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvc3p6bWZhenFwZXJ1ZHN3aHhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODUxMjE3MSwiZXhwIjoyMDg0MDg4MTcxfQ.iT9tIrjXXsmPDSCi7diSIEuJNkSXJixxaj8lT7EXldg
```

### **After Updating:**

1. **Save the file**
2. **Restart the backend server:**
   - Find the backend terminal window
   - Press `Ctrl+C` to stop it
   - Run: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
   - Or use: `.\start-backend.ps1`

### **Then Test:**

1. Open: http://localhost:3000
2. Open browser console (F12)
3. Look for: `✅ Supabase connection successful`
4. Go to: http://localhost:3000/register
5. Try creating an account!

---

## 📋 Current Status:

- ✅ Frontend `.env.local`: Updated with new Supabase credentials
- ⏳ Backend `.env`: **Needs manual update** (see above)
- ✅ Both servers: Running (backend will need restart after update)
