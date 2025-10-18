# 🚀 HƯỚNG DẪN NHANH - THIẾT LẬP GROUPS

## ⚠️ **VẤN ĐỀ HIỆN TẠI:**
- Frontend chạy trên port 8080 (thay vì 5173)
- Backend chưa có file .env
- Database chưa được setup đúng

## 📋 **BƯỚC 1: TẠO FILE .ENV CHO BACKEND**

### 1.1 Tạo file `backend/.env` với nội dung:

```env
# Supabase Configuration
SUPABASE_URL=https://cysokmjkkmitxzagoqjh.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5c29rbWpra21pdHh6YWdvcWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5OTAwMTIsImV4cCI6MjA3NDU2NjAxMn0.ZwXun6HYJ8HtjF-r0JBv5lCZoTPwMGAyZv01jZzP8Gs

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:8080
```

### 1.2 Lấy Service Key từ Supabase:
1. Vào: https://supabase.com/dashboard/project/cysokmjkkmitxzagoqjh
2. Click **"Settings"** → **"API"**
3. Copy **"service_role"** key
4. Thay thế `your_service_key_here` trong file .env

## 📋 **BƯỚC 2: CHẠY DATABASE MIGRATION**

### 2.1 Mở Supabase SQL Editor:
- Truy cập: https://supabase.com/dashboard/project/cysokmjkkmitxzagoqjh
- Click **"SQL Editor"** → **"New Query"**

### 2.2 Copy và chạy SQL này:

```sql
-- FINAL FIX - Correct syntax for PostgreSQL
-- Run this in Supabase SQL Editor

-- Step 1: Add created_by column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Add is_active column to groups table  
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Step 3: Add updated_at column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 4: Add description column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description TEXT;

-- Step 5: Add color column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';

-- Step 6: Create search_history table
CREATE TABLE IF NOT EXISTS public.search_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    search_type TEXT DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    result_count INTEGER DEFAULT 0
);

-- Step 7: Enable RLS
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Step 8: Drop existing policies first, then create new ones
DROP POLICY IF EXISTS "Users can view their own search history" ON public.search_history;
CREATE POLICY "Users can view their own search history" ON public.search_history
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own search history" ON public.search_history;
CREATE POLICY "Users can insert their own search history" ON public.search_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Step 9: Refresh schema
NOTIFY pgrst, 'reload schema';
```

### 2.3 Click "Run" và đợi hoàn thành

## 📋 **BƯỚC 3: KHỞI ĐỘNG BACKEND**

```bash
cd backend
npm start
```

Backend sẽ chạy trên: http://localhost:3001

## 📋 **BƯỚC 4: KIỂM TRA FRONTEND**

Frontend của bạn đang chạy trên: http://localhost:8080

### 4.1 Truy cập Groups:
- Mở: http://localhost:8080/groups
- Hoặc click **"Groups"** trong sidebar

## 🎯 **CÁC TÍNH NĂNG GROUPS CÓ SẴN:**

### **👥 Quản lý Groups:**
- ✅ Tạo group mới
- ✅ Chỉnh sửa thông tin group  
- ✅ Xóa group (chỉ owner)
- ✅ Đổi màu group

### **👤 Quản lý Members:**
- ✅ Thêm thành viên bằng email
- ✅ Phân quyền: Owner, Admin, Member, Viewer
- ✅ Xóa thành viên
- ✅ Rời khỏi group

### **🔐 Phân quyền:**
- **Owner**: Toàn quyền
- **Admin**: Quản lý members, chỉnh sửa group
- **Member**: Tạo/chỉnh sửa documents
- **Viewer**: Chỉ xem

### **📊 Thống kê:**
- ✅ Số lượng members
- ✅ Số lượng documents
- ✅ Lịch sử hoạt động

## 🚨 **TROUBLESHOOTING:**

### **Nếu Groups không hiển thị:**
1. ✅ Kiểm tra backend: http://localhost:3001
2. ✅ Kiểm tra frontend: http://localhost:8080
3. ✅ Kiểm tra Network tab trong DevTools
4. ✅ Đảm bảo đã chạy SQL migration

### **Nếu có lỗi API:**
1. ✅ Kiểm tra file .env trong backend
2. ✅ Kiểm tra Service Key trong Supabase
3. ✅ Restart backend server

## ✅ **KẾT QUẢ MONG ĐỢI:**
- ✅ Giao diện Groups đẹp và responsive
- ✅ Tất cả chức năng hoạt động
- ✅ Phân quyền đúng
- ✅ Tích hợp với database
- ✅ UI/UX thân thiện

---
**Sau khi hoàn thành các bước trên, chức năng Groups sẽ hiển thị đầy đủ!** 🎉
