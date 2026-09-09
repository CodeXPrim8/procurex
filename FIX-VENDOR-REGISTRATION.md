# 🔧 Fix Vendor Registration Issues

## Common Issues and Solutions

### Issue 1: CORS Error (Most Common)

**Symptoms:**
- "Cannot connect to server" error
- Browser console shows CORS policy error
- Backend is running but request blocked

**Solution:**
1. **Restart backend** to apply CORS fixes:
   ```powershell
   .\RESTART-BACKEND-NOW.ps1
   ```

2. **Hard refresh browser**: `Ctrl+Shift+R`

3. **Clear browser cache** if still not working

### Issue 2: Authentication Error

**Symptoms:**
- 401 Unauthorized error
- "Authentication failed" message

**Solution:**
1. **Check if you're logged in** - Open browser console (F12)
2. **Log out and log back in** - This refreshes your session token
3. **Check Supabase session** - Verify session exists in browser storage

### Issue 3: Already Registered

**Symptoms:**
- "User already has a vendor account" error

**Solution:**
- You're already registered! The system will show your vendor dashboard
- If you want to update info, use the "Edit Information" button

### Issue 4: Validation Error

**Symptoms:**
- "Company name is required" or field validation errors

**Solution:**
- Make sure **Company Name** field is filled in
- All other fields are optional

### Issue 5: Server Error (500)

**Symptoms:**
- "Server error" message
- Backend logs show Python errors

**Solution:**
1. **Check backend logs** - Look at the backend PowerShell window
2. **Check database connection** - Verify database is running
3. **Restart backend** - May resolve temporary issues

## Debugging Steps

### Step 1: Check Browser Console

1. Open browser console (F12)
2. Go to **Console** tab
3. Try registering again
4. Look for error messages

### Step 2: Check Network Tab

1. Open browser console (F12)
2. Go to **Network** tab
3. Try registering again
4. Look for the POST request to `/api/v1/vendors`
5. Check:
   - **Status code** (200 = success, 400/401/500 = error)
   - **Request payload** (what data was sent)
   - **Response** (error message from backend)

### Step 3: Check Backend Logs

1. Look at the **backend PowerShell window**
2. Check for Python errors or exceptions
3. Look for any error messages related to vendor registration

### Step 4: Test Backend Directly

Run this in PowerShell to test the endpoint:
```powershell
# Replace YOUR_TOKEN with actual Supabase token
$token = "YOUR_SUPABASE_TOKEN"
$body = @{
    company_name = "Test Company"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/api/v1/vendors" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{"Authorization"="Bearer $token"} `
    -Body $body `
    -UseBasicParsing
```

## Quick Fix Checklist

- [ ] Backend is running (`http://localhost:8000/health` returns healthy)
- [ ] You're logged in (check browser console for session)
- [ ] Company Name field is filled in
- [ ] Backend was restarted after CORS changes
- [ ] Browser cache cleared (hard refresh: Ctrl+Shift+R)
- [ ] Check browser console for specific error messages
- [ ] Check Network tab for request/response details

## Still Not Working?

Share the **exact error message** from:
1. Browser console (F12 → Console tab)
2. Network tab (F12 → Network tab → Click on failed request)
3. Backend PowerShell window (any Python errors)

This will help identify the exact issue!
