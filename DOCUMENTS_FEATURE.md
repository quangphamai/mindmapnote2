# Chức năng Upload và Quản lý Tài liệu

## 📋 Tổng quan

Hệ thống upload và quản lý tài liệu cho phép người dùng:
- ✅ Upload tài liệu với nhiều định dạng khác nhau
- ✅ Phân loại theo categories
- ✅ Lưu trữ an toàn trên Supabase Storage
- ✅ Xem dạng danh sách (List View)
- ✅ Xem dạng đồ thị (Graph View) - categories ở giữa, documents xung quanh

## 🎯 Tính năng

### 1. **Upload Tài liệu**
- Drag & Drop upload
- Browse files
- Hỗ trợ nhiều định dạng:
  - **Documents:** PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MD
  - **Images:** JPG, PNG, GIF, WEBP, SVG
  - **Videos:** MP4, WEBM, OGG
  - **Archives:** ZIP, RAR
- Giới hạn kích thước: 50MB
- Tự động phân loại file type
- Thêm title, description, category, tags

### 2. **List View**
- Hiển thị tài liệu dạng grid cards
- Thông tin chi tiết: title, file name, size, type, category
- Filters:
  - Search by title
  - Filter by category
  - Filter by document type
- Actions:
  - Download
  - Delete
  - (Future: Edit, Share)

### 3. **Graph View**
- Visual representation của documents và categories
- Categories hiển thị dạng nodes tròn ở giữa
- Documents xung quanh category như một mindmap
- Color-coded theo category
- Hover để xem details
- Click để interact (future enhancement)

## 🗂️ Cấu trúc Files

```
backend/
├── src/
│   ├── controllers/
│   │   └── documentController.js      ✨ NEW - CRUD operations
│   ├── routes/
│   │   └── documentRoutes.js          ✨ NEW - API endpoints
│   └── server.js                       ✏️ MODIFIED - add routes
└── package.json                        ✏️ MODIFIED - add multer

mindmap-notion-interface/
├── supabase/
│   └── migrations/
│       └── 20251001000000_create_documents_table.sql  ✨ NEW
├── src/
│   ├── components/
│   │   └── UploadDocument.tsx        ✨ NEW - Upload dialog
│   ├── services/
│   │   └── documentService.ts         ✨ NEW - API service
│   └── pages/
│       └── Documents.tsx               ✏️ MODIFIED - Full rewrite
```

## 🚀 Setup

### 1. Backend Setup

#### Install Dependencies
```bash
cd backend
npm install multer
```

#### Run Migration
Migration sẽ được apply khi restart Supabase local hoặc qua Supabase Dashboard.

Nếu dùng Supabase local:
```bash
cd mindmap-notion-interface
supabase migration up
```

Nếu dùng Supabase Cloud:
- Copy nội dung file `20251001000000_create_documents_table.sql`
- Vào Supabase Dashboard > SQL Editor
- Paste và run

### 2. Verify Storage Bucket

Vào Supabase Dashboard > Storage:
- Bucket `documents` đã được tạo
- RLS policies đã được set

### 3. Restart Backend

```bash
cd backend
npm run dev
```

## 📡 API Endpoints

### Upload Document
```http
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "file": <File>,
  "title": "Document Title",
  "description": "Optional description",
  "category_id": "uuid",
  "tags": ["tag1", "tag2"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Document Title",
    "file_name": "document.pdf",
    "file_path": "userId/categoryId/timestamp_document.pdf",
    "file_size": 1024000,
    "file_type": "pdf",
    "mime_type": "application/pdf",
    "category_id": "uuid",
    "document_type": "pdf",
    "created_at": "2025-10-01T00:00:00.000Z",
    ...
  },
  "message": "Document uploaded successfully"
}
```

### Get All Documents
```http
GET /api/documents?category_id=uuid&document_type=pdf&search=query
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Document Title",
      ...
      "categories": {
        "id": "uuid",
        "name": "Category Name",
        "color": "#3b82f6"
      }
    }
  ],
  "count": 10
}
```

### Get Document by ID
```http
GET /api/documents/:id
Authorization: Bearer <token>
```

### Get Download URL
```http
GET /api/documents/:id/download
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://supabase.storage.../signed-url",
    "expiresIn": 3600
  }
}
```

### Update Document
```http
PUT /api/documents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description",
  "category_id": "uuid",
  "tags": ["new-tag"]
}
```

### Delete Document
```http
DELETE /api/documents/:id
Authorization: Bearer <token>
```

### Get Documents by Category (Graph View)
```http
GET /api/documents/by-category
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "categorized": [
      {
        "category": {
          "id": "uuid",
          "name": "Category Name",
          "color": "#3b82f6",
          "description": "Description"
        },
        "documents": [...]
      }
    ],
    "uncategorized": [...]
  }
}
```

## 💻 Frontend Usage

### Upload Document

```typescript
import { documentService } from '@/services/documentService';

// Upload
const file = ... // File object from input
await documentService.uploadDocument({
  file,
  title: 'My Document',
  description: 'Description',
  category_id: 'category-uuid',
  tags: ['tag1', 'tag2']
});
```

### Get Documents

```typescript
// Get all
const docs = await documentService.getAllDocuments();

// Filter by category
const categoryDocs = await documentService.getAllDocuments({
  category_id: 'uuid'
});

// Search
const results = await documentService.getAllDocuments({
  search: 'query'
});
```

### Download Document

```typescript
await documentService.downloadDocument(docId, fileName);
```

### Delete Document

```typescript
await documentService.deleteDocument(docId);
```

## 🎨 UI Components

### UploadDocument Component

```tsx
import { UploadDocument } from '@/components/UploadDocument';

<UploadDocument
  open={isOpen}
  onOpenChange={setIsOpen}
  categories={categories}
  onUploadSuccess={() => {
    // Refresh list
    fetchDocuments();
  }}
/>
```

**Features:**
- Drag & Drop area
- File validation
- Progress indication
- Auto-fill title from filename
- Category selection
- Tags input
- Description textarea

### Documents Page

**List View:**
- Grid layout responsive
- Document cards với:
  - File icon
  - Title, filename
  - File size, type
  - Category badge
  - Download/Delete actions
- Filters: search, category, type

**Graph View:**
- Center nodes = Categories (color-coded)
- Surrounding nodes = Documents
- Visual connections
- Hover interactions
- Responsive layout

## 🗄️ Database Schema

### documents table

```sql
CREATE TABLE public.documents (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,           -- Path in Storage
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,            -- Extension (pdf, jpg, etc)
  mime_type TEXT,                     -- MIME type
  category_id UUID REFERENCES categories(id),
  group_id UUID REFERENCES groups(id),
  created_by UUID REFERENCES auth.users(id),
  last_edited_by UUID REFERENCES auth.users(id),
  document_type TEXT DEFAULT 'document',  -- document, pdf, image, video
  is_public BOOLEAN DEFAULT false,
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Storage Structure

```
documents/
├── {user_id}/
│   ├── {category_id}/
│   │   ├── {timestamp}_{filename}
│   │   └── ...
│   └── uncategorized/
│       └── {timestamp}_{filename}
```

## 🔒 Security

### RLS Policies

**Database (documents table):**
- ✅ Users can view own documents
- ✅ Users can view group documents (if member)
- ✅ Users can view public documents
- ✅ Users can CRUD own documents
- ✅ Group admins can manage group documents

**Storage (documents bucket):**
- ✅ Users can upload to own folder
- ✅ Users can view/download own files
- ✅ Users can delete own files
- ❌ Cannot access other users' files

### File Validation

**Backend:**
- File type whitelist
- Max size: 50MB
- Virus scanning (future)

**Frontend:**
- Pre-upload validation
- User-friendly error messages

## 📊 File Type Support

| Category | Extensions | MIME Types |
|----------|-----------|------------|
| **Documents** | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MD | application/pdf, application/msword, etc. |
| **Images** | JPG, PNG, GIF, WEBP, SVG | image/jpeg, image/png, etc. |
| **Videos** | MP4, WEBM, OGG | video/mp4, video/webm, etc. |
| **Archives** | ZIP, RAR | application/zip, application/x-rar-compressed |

## 🎯 Features Roadmap

### ✅ Implemented
- [x] Upload với drag & drop
- [x] Multiple file types
- [x] Category organization
- [x] List view
- [x] Graph view
- [x] Download
- [x] Delete
- [x] Search & filters

### 🔜 Future Enhancements
- [ ] Edit document metadata
- [ ] Share documents
- [ ] Document preview
- [ ] Collaborative editing
- [ ] Version history
- [ ] Bulk operations
- [ ] Advanced search (tags, content)
- [ ] Document OCR/text extraction
- [ ] Thumbnail generation
- [ ] Comments & annotations

## 🐛 Troubleshooting

### Upload fails with "File type not allowed"

**Problem:** MIME type không được support

**Solution:**
1. Kiểm tra file type trong `documentController.js` allowedTypes
2. Thêm MIME type vào whitelist nếu cần

### "Failed to upload to storage"

**Problem:** Storage bucket chưa tạo hoặc RLS sai

**Solution:**
1. Check Supabase Dashboard > Storage
2. Verify bucket `documents` exists
3. Check RLS policies

### Download không hoạt động

**Problem:** Signed URL expired hoặc không generate được

**Solution:**
1. Check document exists trong database
2. Verify file path đúng
3. Check Storage RLS policies

### Graph view không hiển thị

**Problem:** Không fetch được grouped documents

**Solution:**
1. Check console logs
2. Verify categories exist
3. Check documents có category_id

## 💡 Best Practices

### 1. File Naming
- Sử dụng timestamp prefix tránh trùng tên
- Sanitize filename (remove special chars)

### 2. Categories
- Tạo categories trước khi upload
- Sử dụng màu sắc có ý nghĩa
- Đặt tên category rõ ràng

### 3. Performance
- Lazy load documents
- Pagination cho list dài
- Optimize image thumbnails
- Cache categories

### 4. Security
- Luôn validate ở cả client và server
- Never trust client input
- Scan files cho virus
- Limit upload rate

## 📝 Examples

### Full Upload Flow

```typescript
// 1. Get categories
const categories = await categoryService.getAllCategories();

// 2. User selects file và fills form
const file = fileInput.files[0];

// 3. Upload
try {
  const doc = await documentService.uploadDocument({
    file,
    title: 'Q1 Report',
    description: 'Financial report for Q1 2025',
    category_id: categories[0].id,
    tags: ['finance', 'report', '2025']
  });
  
  console.log('Uploaded:', doc);
  
  // 4. Refresh list
  const allDocs = await documentService.getAllDocuments();
  
} catch (error) {
  console.error('Upload failed:', error);
}
```

### Search và Filter

```typescript
// Search by title
const results = await documentService.getAllDocuments({
  search: 'report'
});

// Filter by category
const categoryDocs = await documentService.getAllDocuments({
  category_id: 'category-uuid'
});

// Filter by type
const pdfs = await documentService.getAllDocuments({
  document_type: 'pdf'
});

// Combined
const filtered = await documentService.getAllDocuments({
  category_id: 'category-uuid',
  document_type: 'pdf',
  search: 'financial'
});
```

---

**Chúc bạn sử dụng hiệu quả!** 🎉

Nếu có vấn đề, tham khảo phần Troubleshooting hoặc check console logs.

