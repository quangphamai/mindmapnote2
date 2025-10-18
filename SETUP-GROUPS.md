# 🚀 HƯỚNG DẪN THIẾT LẬP CHỨC NĂNG GROUPS

## 📋 Bước 1: Chạy Database Migration

### 1.1 Mở Supabase Dashboard
- Truy cập: https://supabase.com/dashboard/project/cysokmjkkmitxzagoqjh
- Click **"SQL Editor"**
- Click **"New Query"**

### 1.2 Copy và chạy SQL này:

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

### 1.3 Click "Run" và đợi hoàn thành

## 📋 Bước 2: Thiết lập Backend Environment

### 2.1 Tạo file `.env` trong thư mục `backend/`:

```env
# Supabase Configuration
SUPABASE_URL=https://cysokmjkkmitxzagoqjh.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5c29rbWpra21pdHh6YWdvcWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5OTAwMTIsImV4cCI6MjA3NDU2NjAxMn0.ZwXun6HYJ8HtjF-r0JBv5lCZoTPwMGAyZv01jZzP8Gs

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:5173
```

### 2.2 Lấy Service Key từ Supabase:
1. Vào Supabase Dashboard
2. Click **"Settings"** → **"API"**
3. Copy **"service_role"** key
4. Thay thế `your_service_key_here` trong file .env

## 📋 Bước 3: Khởi động Backend

```bash
cd backend
npm install
npm start
```

Backend sẽ chạy trên: http://localhost:3001

## 📋 Bước 4: Khởi động Frontend

```bash
cd mindmap-notion-interface
npm install
npm run dev
```

Frontend sẽ chạy trên: http://localhost:5173

## 📋 Bước 5: Truy cập chức năng Groups

1. Mở trình duyệt: http://localhost:5173
2. Đăng nhập vào ứng dụng
3. Click **"Groups"** trong sidebar
4. Bạn sẽ thấy giao diện Groups với:
   - ✅ Danh sách groups
   - ✅ Nút "Create Group"
   - ✅ Tìm kiếm groups
   - ✅ Quản lý members
   - ✅ Phân quyền roles

## 🎯 Các tính năng Groups có sẵn:

### **👥 Quản lý Groups:**
- Tạo group mới
- Chỉnh sửa thông tin group
- Xóa group (chỉ owner)
- Đổi màu group

### **👤 Quản lý Members:**
- Thêm thành viên bằng email
- Phân quyền: Owner, Admin, Member, Viewer
- Xóa thành viên
- Rời khỏi group

### **🔐 Phân quyền:**
- **Owner**: Toàn quyền
- **Admin**: Quản lý members, chỉnh sửa group
- **Member**: Tạo/chỉnh sửa documents
- **Viewer**: Chỉ xem

### **📊 Thống kê:**
- Số lượng members
- Số lượng documents
- Lịch sử hoạt động

## 🚨 Troubleshooting:

### Nếu Groups không hiển thị:
1. Kiểm tra backend đang chạy: http://localhost:3001
2. Kiểm tra frontend đang chạy: http://localhost:5173
3. Kiểm tra Network tab trong DevTools
4. Đảm bảo đã chạy SQL migration trong Supabase

### Nếu có lỗi API:
1. Kiểm tra file .env trong backend
2. Kiểm tra Service Key trong Supabase
3. Restart backend server

## ✅ Kết quả mong đợi:
- ✅ Giao diện Groups đẹp và responsive
- ✅ Tất cả chức năng hoạt động
- ✅ Phân quyền đúng
- ✅ Tích hợp với database
- ✅ UI/UX thân thiện

---
**Chúc bạn sử dụng chức năng Groups thành công!** 🎉
