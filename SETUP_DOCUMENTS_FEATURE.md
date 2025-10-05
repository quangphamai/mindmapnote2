# 🚀 Setup Chức năng Upload Tài liệu - Quick Start

## ✅ Checklist

- [ ] Backend: Install multer
- [ ] Database: Run migration
- [ ] Storage: Verify bucket created
- [ ] Backend: Restart server
- [ ] Frontend: Test upload

## 📦 Bước 1: Backend Setup

### 1.1. Install Dependencies

```bash
cd backend
npm install
```

Package `multer` đã được thêm vào `package.json`, chạy `npm install` để cài.

### 1.2. Verify .env

Đảm bảo file `.env` có đủ:

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

### 1.3. Restart Backend

```bash
npm run dev
```

Backend sẽ chạy với document routes tại `/api/documents/*`

## 💾 Bước 2: Database Migration

### Option A: Supabase Local (nếu dùng local dev)

```bash
cd mindmap-notion-interface
supabase migration up
```

### Option B: Supabase Cloud (recommended)

1. Vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project của bạn
3. Vào **SQL Editor**
4. Mở file `mindmap-notion-interface/supabase/migrations/20251001000000_create_documents_table.sql`
5. Copy toàn bộ nội dung
6. Paste vào SQL Editor
7. Click **Run**

**Kết quả mong đợi:**
```
✅ Table documents created
✅ RLS policies created
✅ Storage bucket 'documents' created
✅ Storage policies created
```

## 🗄️ Bước 3: Verify Storage Bucket

1. Vào Supabase Dashboard > **Storage**
2. Kiểm tra bucket `documents` đã được tạo
3. Click vào bucket, kiểm tra **Policies** tab
4. Phải có 4 policies:
   - Users can upload documents
   - Users can view own documents
   - Users can update own documents
   - Users can delete own documents

Nếu chưa có, chạy lại migration.

## 🎨 Bước 4: Frontend (Không cần setup gì thêm)

Frontend đã sẵn sàng:
- ✅ `src/services/documentService.ts` - API service
- ✅ `src/services/api.ts` - Updated với uploadFile method
- ✅ `src/components/UploadDocument.tsx` - Upload dialog
- ✅ `src/pages/Documents.tsx` - Full page với List & Graph view

Chỉ cần restart frontend nếu đang chạy:

```bash
cd mindmap-notion-interface
npm run dev
```

## 🧪 Bước 5: Test

### 1. Test Backend API (Optional)

Sử dụng file `backend/test-api.http` hoặc Postman:

```http
### Upload Document
POST http://localhost:3000/api/documents/upload
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data

# Body:
# - file: <select file>
# - title: "Test Document"
# - category_id: "optional-uuid"
```

### 2. Test Frontend UI

1. **Đăng nhập** vào ứng dụng
2. Vào trang **Documents** từ sidebar
3. Click button **"Upload Document"**
4. Test các chức năng:

#### ✅ Upload Test
- Drag & drop một file PDF/Image
- Hoặc click "Browse Files"
- Điền title, description (optional)
- Chọn category (optional)
- Click "Upload"

**Kết quả mong đợi:**
- ✅ File upload thành công
- ✅ Toast notification "Document uploaded successfully"
- ✅ Document hiển thị trong list

#### ✅ List View Test
- Document hiển thị dạng card
- Có file icon, title, size, type
- Có category badge (nếu đã chọn)
- Button Download và Delete hoạt động

#### ✅ Graph View Test
- Click icon "Network" để switch sang Graph View
- Categories hiển thị dạng nodes tròn ở giữa
- Documents xung quanh category
- Màu sắc theo category

#### ✅ Filter Test
- Search by title
- Filter by category
- Filter by document type (PDF, Image, etc.)

#### ✅ Download Test
- Click icon Download trên document card
- File tải về thành công

#### ✅ Delete Test
- Click icon Delete (trash)
- Confirm dialog xuất hiện
- Document bị xóa khỏi list và storage

## 🐛 Common Issues

### Issue 1: "Failed to upload to storage"

**Nguyên nhân:** Storage bucket chưa được tạo hoặc RLS policies sai

**Giải pháp:**
```bash
# Check trong Supabase Dashboard > Storage
# Nếu không có bucket 'documents', chạy lại migration
```

### Issue 2: "File type not allowed"

**Nguyên nhân:** File type không nằm trong whitelist

**Giải pháp:**
Thêm MIME type vào `backend/src/controllers/documentController.js`:

```javascript
const allowedTypes = [
    'application/pdf',
    // ... add your type here
];
```

### Issue 3: Backend error "Cannot find module 'multer'"

**Nguyên nhân:** Multer chưa được install

**Giải pháp:**
```bash
cd backend
npm install multer
```

### Issue 4: 401 Unauthorized

**Nguyên nhân:** Chưa đăng nhập hoặc token hết hạn

**Giải pháp:**
- Đăng nhập lại vào ứng dụng
- Check console logs

### Issue 5: Graph View trống

**Nguyên nhân:** Chưa có categories hoặc documents

**Giải pháp:**
1. Tạo categories trước (trang Categories)
2. Upload documents với category
3. Refresh trang Documents

## 📊 File Structure Overview

```
E:\doanchuyennganh\mindmapnote2\
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── categoryController.js
│   │   │   └── documentController.js      ✨ NEW
│   │   ├── routes/
│   │   │   ├── categoryRoutes.js
│   │   │   └── documentRoutes.js          ✨ NEW
│   │   └── server.js                       ✏️ MODIFIED
│   └── package.json                        ✏️ MODIFIED (+ multer)
│
├── mindmap-notion-interface/
│   ├── supabase/
│   │   └── migrations/
│   │       └── 20251001000000_create_documents_table.sql  ✨ NEW
│   └── src/
│       ├── components/
│       │   └── UploadDocument.tsx        ✨ NEW
│       ├── services/
│       │   ├── api.ts                     ✏️ MODIFIED (+ uploadFile)
│       │   ├── categoryService.ts
│       │   └── documentService.ts         ✨ NEW
│       └── pages/
│           ├── Categories.tsx
│           └── Documents.tsx               ✏️ MODIFIED (Full rewrite)
│
└── Documentation/
    ├── DOCUMENTS_FEATURE.md               ✨ NEW - Full docs
    └── SETUP_DOCUMENTS_FEATURE.md         ✨ NEW - This file
```

## 🎯 Next Steps

Sau khi setup xong, bạn có thể:

1. **Customize UI:** Thay đổi colors, layout trong `Documents.tsx`
2. **Add Features:** Preview, sharing, collaborative editing
3. **Optimize:** Add pagination, lazy loading, thumbnails
4. **Integrate:** Link documents với mindmaps

## 📚 Documentation

- **Full Documentation:** `DOCUMENTS_FEATURE.md`
- **API Integration Guide:** `BACKEND_INTEGRATION.md`
- **Quick Setup:** This file

## ✨ Summary

Bạn đã setup thành công chức năng:
- ✅ Upload tài liệu với drag & drop
- ✅ Hỗ trợ nhiều file types (PDF, DOC, Images, Videos...)
- ✅ Phân loại theo categories
- ✅ Lưu trữ an toàn trên Supabase Storage
- ✅ Hiển thị dạng List và Graph View
- ✅ Search, filter, download, delete

**Chúc mừng! 🎉**

---

Nếu gặp vấn đề, check:
1. Console logs (Browser DevTools)
2. Backend logs (Terminal)
3. Supabase Dashboard > Logs
4. Documentation: `DOCUMENTS_FEATURE.md`

