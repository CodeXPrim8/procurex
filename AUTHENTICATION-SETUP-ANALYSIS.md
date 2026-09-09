# Authentication & Database Setup Analysis

## ✅ Current Authentication Flow

### **Registration Flow (Users & Vendors)**

1. **Frontend (Supabase Auth)**
   - User fills registration form at `/register`
   - Frontend calls `authAPI.register()` which uses `supabase.auth.signUp()`
   - Supabase creates user account with email/password
   - User metadata includes: `full_name` and `role` ('buyer' or 'vendor')
   - If email confirmation is required, user gets confirmation email

2. **Backend (Local User Creation)**
   - When user first accesses backend API, `get_current_user()` dependency runs
   - Backend validates Supabase JWT token
   - Backend calls `_get_or_create_local_user()` which:
     - Checks if user exists in local database by email
     - If not exists, creates new `User` record with:
       - Email from Supabase
       - Role from Supabase user_metadata
       - Full name from Supabase user_metadata
       - `hashed_password` set to "supabase" (not used, Supabase handles auth)
       - `is_active = True`
     - Returns local User object

3. **Vendor Registration**
   - After user registration/login, if role is 'vendor':
     - Frontend calls `vendorsAPI.register()` with company info
     - Backend creates `Vendor` record linked to `User`
     - User role is updated to `UserRole.VENDOR`

### **Login Flow**

1. **Frontend (Supabase Auth)**
   - User enters email/password at `/login`
   - Frontend calls `authAPI.login()` which uses `supabase.auth.signInWithPassword()`
   - Supabase validates credentials and returns session token

2. **Backend (Token Validation)**
   - All API requests include `Authorization: Bearer <token>` header
   - Backend validates token with Supabase API
   - Backend maps Supabase user to local User record (creates if needed)
   - Returns local User object for authorization

## 📋 Required Environment Variables

### **Frontend (.env.local)**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### **Backend (.env)**
```env
# Database (SQLite or PostgreSQL)
DATABASE_URL=sqlite:///./procurement.db
# OR
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/procurement_db

# Supabase (Required for authentication)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Other settings
SECRET_KEY=your-secret-key
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
```

## 🔍 Database Schema

### **Users Table**
- `id` (Primary Key)
- `email` (Unique, Indexed)
- `hashed_password` (Set to "supabase", not used for auth)
- `full_name` (From Supabase metadata)
- `role` (Enum: buyer, vendor, admin)
- `is_active` (Boolean, default True)
- `created_at`, `updated_at`

### **Vendors Table**
- `id` (Primary Key)
- `user_id` (Foreign Key to users, Unique)
- `company_name` (Required)
- `business_registration_number` (Optional)
- `domain`, `phone`, `address` (Optional)
- `verification_status` (Enum: pending, verified, rejected)
- `created_at`, `updated_at`

## ✅ Verification Checklist

### **1. Supabase Configuration**
- [ ] Supabase project created at https://supabase.com
- [ ] Project is active (not paused)
- [ ] Email authentication enabled in Supabase Dashboard
- [ ] Email confirmation can be disabled for testing (Settings > Auth > Email Auth)

### **2. Environment Variables**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set in `web/.env.local`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in `web/.env.local`
- [ ] `SUPABASE_URL` set in `backend/.env`
- [ ] `SUPABASE_ANON_KEY` set in `backend/.env`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in `backend/.env` (optional, for admin operations)

### **3. Database Setup**
- [ ] Database tables created (run `Base.metadata.create_all()` on startup)
- [ ] SQLite file exists OR PostgreSQL database accessible
- [ ] Database connection working (check `/health` endpoint)

### **4. Testing Registration**
- [ ] Can access `/register` page
- [ ] Can create buyer account
- [ ] Can create vendor account
- [ ] User appears in Supabase Dashboard > Authentication > Users
- [ ] Local user record created in database after first API call

### **5. Testing Login**
- [ ] Can access `/login` page
- [ ] Can login with registered credentials
- [ ] Session token received from Supabase
- [ ] Backend API calls work with token
- [ ] User role correctly retrieved

## 🚨 Common Issues & Solutions

### **Issue: "Supabase environment variables are not set"**
**Solution:**
1. Create `web/.env.local` file
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Restart Next.js dev server

### **Issue: "Invalid Supabase token"**
**Solution:**
1. Check Supabase project is active
2. Verify API keys are correct
3. Check token expiration (default 1 hour)
4. Try logging out and back in

### **Issue: "User account not provisioned"**
**Solution:**
1. This happens when Supabase user exists but local User record doesn't
2. Make any API call after login - backend will auto-create local user
3. Check database connection is working

### **Issue: "Email confirmation required"**
**Solution:**
1. Check Supabase Dashboard > Settings > Auth
2. Disable "Confirm email" for testing
3. OR check email inbox for confirmation link

## 🔧 How to Test

### **Test User Registration:**
1. Go to `http://localhost:3000/register`
2. Fill form with:
   - Email: `test@example.com`
   - Password: `password123`
   - Full Name: `Test User`
   - Role: `Buyer`
3. Submit form
4. Check Supabase Dashboard > Authentication > Users (should see new user)
5. Try to login

### **Test Vendor Registration:**
1. Go to `http://localhost:3000/register`
2. Fill form with:
   - Email: `vendor@example.com`
   - Password: `password123`
   - Full Name: `Vendor User`
   - Role: `Vendor`
   - Company Name: `Test Company`
3. Submit form
4. After login, go to `/products` or `/vendor`
5. Complete vendor registration with company details
6. Check database for Vendor record

### **Test Login:**
1. Go to `http://localhost:3000/login`
2. Enter registered email and password
3. Should redirect to dashboard
4. Check browser console for any errors
5. Try accessing protected routes

## 📊 Current Status

✅ **Working:**
- Supabase authentication integration
- User registration (buyer/vendor)
- User login
- Token validation
- Local user auto-creation
- Vendor registration flow

⚠️ **Needs Configuration:**
- Supabase project setup (if not done)
- Environment variables (if missing)
- Email confirmation settings (can disable for testing)

❌ **Potential Issues:**
- If Supabase credentials missing → Auth won't work
- If database not accessible → User creation fails
- If email confirmation enabled → Users must confirm before login

## 🎯 Next Steps

1. **Verify Supabase Setup:**
   - Check if `.env.local` and `.env` files exist
   - Verify Supabase credentials are correct
   - Test Supabase connection

2. **Test Registration:**
   - Try creating a buyer account
   - Try creating a vendor account
   - Check if users appear in Supabase Dashboard

3. **Test Login:**
   - Login with created accounts
   - Verify session works
   - Check if backend API calls succeed

4. **Check Database:**
   - Verify local User records are created
   - Check Vendor records for vendor accounts
   - Ensure relationships work correctly
