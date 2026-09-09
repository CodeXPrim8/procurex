// Shared TypeScript types for web and mobile apps

export interface User {
  id: number
  email: string
  full_name?: string
  role: 'buyer' | 'vendor' | 'admin'
  is_active: boolean
  created_at: string
}

export interface Product {
  id: number
  name: string
  sku: string
  category: string
  description?: string
  specifications?: Record<string, any>
  base_price?: number
  image_url?: string
  image_urls?: string[]
  created_at: string
  updated_at: string
}

export interface VendorProduct {
  id: number
  vendor_id: number
  product_id: number
  stock_quantity: number
  price: number
  last_verified: string
  is_active: boolean
  product?: Product
}

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: string
  created_at?: string
}

export interface ChatSession {
  id: number
  user_id: number
  title?: string
  messages?: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface Quotation {
  id: number
  user_id: number
  quotation_number: string
  customer_name: string
  customer_email: string
  customer_phone?: string
  customer_address?: string
  total_amount: number
  status: string
  notes?: string
  pdf_url?: string
  items: QuotationItem[]
  created_at: string
  updated_at: string
}

export interface QuotationItem {
  id: number
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
  specifications?: Record<string, any>
}

export interface Vendor {
  id: number
  user_id: number
  company_name: string
  business_registration_number?: string
  domain?: string
  phone?: string
  address?: string
  verification_status: 'pending' | 'verified' | 'rejected'
  verification_notes?: string
  created_at: string
  updated_at: string
}


