# Vendors Page - Server Connection Status

## ✅ Connection Status

**The vendors page is already connected to the backend server!**

### Connection Details:
- **Frontend API Client**: `web/lib/api.ts`
- **Vendors API**: Uses `vendorsAPI` object from `@/lib/api`
- **Backend URL**: `http://localhost:8000` (configurable via `NEXT_PUBLIC_API_URL`)
- **API Base Path**: `http://localhost:8000/api/v1`

### How It Works:

1. **API Configuration** (`web/lib/api.ts`):
   ```typescript
   const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
   const api = axios.create({
     baseURL: `${API_URL}/api/v1`,
   })
   ```

2. **Vendors API Methods** (`web/lib/api.ts`):
   ```typescript
   export const vendorsAPI = {
     register: async (vendorData) => api.post('/vendors', vendorData),
     getMyVendor: async () => api.get('/vendors/me'),
     updateVendor: async (vendorData) => api.put('/vendors/me', vendorData),
     addProduct: async (productData) => api.post('/vendors/me/products', productData),
     createProduct: async (productData) => api.post('/vendors/me/products/create', productData),
     updateProduct: async (id, data) => api.put(`/vendors/me/products/${id}`, data),
     updateStock: async (id, stock) => api.put(`/vendors/me/products/${id}/stock`, { stock_quantity: stock }),
     deleteProduct: async (id) => api.delete(`/vendors/me/products/${id}`),
     getMyProducts: async () => api.get('/vendors/me/products'),
   }
   ```

3. **Vendors Page Usage** (`web/app/vendor/page.tsx`):
   ```typescript
   import { vendorsAPI, productAPI } from '@/lib/api'
   
   // Uses vendorsAPI methods:
   - vendorsAPI.getMyVendor()      // Load vendor info
   - vendorsAPI.getMyProducts()    // Load products
   - vendorsAPI.register()        // Register as vendor
   - vendorsAPI.updateVendor()    // Update vendor info
   - vendorsAPI.createProduct()    // Create new product
   - vendorsAPI.addProduct()       // Add existing product
   - vendorsAPI.updateProduct()    // Update product
   - vendorsAPI.deleteProduct()    // Delete product
   - vendorsAPI.updateStock()      // Update stock
   ```

## 🔧 Backend Port Configuration

### Current Setup:
- **Backend Port**: `8000` (default)
- **Backend URL**: `http://localhost:8000`
- **Frontend Config**: Uses `NEXT_PUBLIC_API_URL` from `web/.env.local` or defaults to `http://localhost:8000`

### Alternative Ports:

**Yes, you can run the backend on a different port!** Here are your options:

#### Option 1: Change via Environment Variable (Recommended)

**Frontend** (`web/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

**Backend** (`backend-watchdog.ps1`):
Change line 46 from:
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
To:
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

**Don't forget to:**
1. Update CORS origins in `backend/app/core/config.py`:
   ```python
   CORS_ORIGINS: List[str] = [
       "http://localhost:3000",  # Frontend
       "http://localhost:8080",  # New backend port
   ]
   ```
2. Restart both backend and frontend

#### Option 2: Common Alternative Ports

| Port | Use Case |
|------|----------|
| 8000 | Default (current) |
| 8080 | Common alternative |
| 3001 | If frontend uses 3000 |
| 5000 | Flask-style |
| 9000 | Custom |

#### Option 3: Use Different Host

You can also use:
- `http://127.0.0.1:8000` (same as localhost)
- `http://0.0.0.0:8000` (accessible from network)
- `http://192.168.x.x:8000` (your local IP address)

## ✅ Current Status

- ✅ Backend is running on `http://localhost:8000`
- ✅ Vendors page is connected via `vendorsAPI`
- ✅ API endpoints are accessible
- ✅ CORS is configured correctly
- ✅ Authentication is integrated (Supabase tokens)

## 🧪 Testing the Connection

To verify the vendors page is connected:

1. **Open browser console** (F12)
2. **Navigate to** `/vendor` page
3. **Check Network tab** - you should see requests to:
   - `http://localhost:8000/api/v1/vendors/me` (GET)
   - `http://localhost:8000/api/v1/vendors` (POST for registration)
   - `http://localhost:8000/api/v1/vendors/me/products` (GET/POST)

4. **Try registering as vendor** - check console for API calls

## 📝 Summary

**The vendors page is fully connected to the backend server!**

- All API calls go through `vendorsAPI` from `@/lib/api`
- Backend URL is configurable via `NEXT_PUBLIC_API_URL`
- Default backend port is `8000`, but can be changed
- Connection includes authentication, error handling, and CORS

If you want to change the backend port, just update:
1. `backend-watchdog.ps1` (port in uvicorn command)
2. `web/.env.local` (NEXT_PUBLIC_API_URL)
3. `backend/app/core/config.py` (CORS_ORIGINS)
4. Restart both servers
