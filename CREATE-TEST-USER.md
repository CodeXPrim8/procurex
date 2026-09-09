# Login Information

## First Time Setup

**There are no users created yet!** You need to create an account first.

## Option 1: Register via Web Interface (Recommended)

1. **Open your browser:** http://localhost:3000
2. **Click "Register" or go to:** http://localhost:3000/register
3. **Fill in the form:**
   - Email: `test@example.com` (or any email)
   - Password: `password123` (or any password, min 6 characters)
   - Full Name: `Test User`
   - Account Type: Choose `Buyer` or `Vendor`
4. **Click "Register"**
5. **You'll be automatically logged in**

## Option 2: Create User via API

You can also create a user using the API directly:

**Using PowerShell:**
```powershell
$body = @{
    email = "admin@test.com"
    password = "admin123"
    full_name = "Admin User"
    role = "buyer"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json"
```

**Using curl (if installed):**
```bash
curl -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123","full_name":"Admin User","role":"buyer"}'
```

## Test Credentials (After Registration)

Once you've registered, you can use:

- **Email:** The email you registered with
- **Password:** The password you set

## Default Test Account

If you want, I can create a default test account for you. Just let me know!

## Login Page

- **URL:** http://localhost:3000/login
- **Or click "Login" from the home page**

## Need Help?

- **Can't register?** Check that backend is running on port 8000
- **Registration fails?** Check the backend terminal for error messages
- **Want to create admin user?** Use the API method above with `"role": "admin"`

