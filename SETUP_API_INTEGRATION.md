# Setup API Integration - Hướng dẫn Nhanh

## Bước 1: Cấu hình Backend

### 1.1. Tạo file `.env` trong thư mục `backend/`

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

> **Lưu ý:** Lấy Supabase URL và Service Key từ Supabase Dashboard > Settings > API

### 1.2. Cài đặt dependencies và khởi chạy

```bash
cd backend
npm install
npm run dev
```

Backend sẽ chạy tại: `http://localhost:3000`

## Bước 2: Cấu hình Frontend

### 2.1. Cập nhật file `.env` trong thư mục `mindmap-notion-interface/`

Thêm dòng sau vào file `.env` (hoặc tạo mới nếu chưa có):

```env
VITE_API_BASE_URL=http://localhost:3000
```

File `.env` đầy đủ sẽ có dạng:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_BASE_URL=http://localhost:3000
```

### 2.2. Khởi chạy Frontend

```bash
cd mindmap-notion-interface
npm install
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:5173` (hoặc port khác)

## Bước 3: Kiểm tra

1. **Đăng nhập vào ứng dụng** (nếu chưa có tài khoản thì đăng ký)
2. **Vào trang Categories** từ sidebar
3. **Thử các chức năng:**
   - ✅ Tạo category mới
   - ✅ Xem danh sách categories
   - ✅ Sửa category
   - ✅ Xóa category

## Cấu trúc Files Mới

```
mindmap-notion-interface/
├── src/
│   ├── services/
│   │   ├── api.ts              # API Client với authentication
│   │   └── categoryService.ts  # Service cho Category CRUD
│   └── pages/
│       └── Categories.tsx       # Đã update để dùng API thật
├── .env                         # Config API URL
└── BACKEND_INTEGRATION.md       # Tài liệu chi tiết

backend/
├── src/
│   ├── controllers/
│   │   └── categoryController.js  # CRUD logic
│   ├── routes/
│   │   └── categoryRoutes.js      # API endpoints
│   ├── middleware/
│   │   └── auth.js                # Authentication middleware
│   └── server.js                  # Express server
└── .env                           # Backend config
```

## Endpoints API

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/categories` | Lấy tất cả categories |
| GET | `/api/categories/:id` | Lấy category theo ID |
| POST | `/api/categories` | Tạo category mới |
| PUT | `/api/categories/:id` | Cập nhật category |
| DELETE | `/api/categories/:id` | Xóa category |
| GET | `/api/categories/group/:groupId` | Lấy categories theo group |

## Lưu ý quan trọng

1. **Backend phải chạy trước** khi sử dụng frontend
2. **Phải đăng nhập** trước khi sử dụng tính năng Categories
3. Tất cả API calls đều **tự động thêm Bearer token** từ Supabase session
4. Backend sử dụng **Supabase Service Key** để verify token

## Troubleshooting

### Lỗi: "Failed to fetch categories"

**Nguyên nhân:** Backend chưa chạy hoặc URL không đúng

**Giải pháp:**
```bash
# Kiểm tra backend đang chạy
cd backend
npm run dev

# Kiểm tra file .env trong frontend có VITE_API_BASE_URL=http://localhost:3000
```

### Lỗi: "401 Unauthorized"

**Nguyên nhân:** Chưa đăng nhập hoặc token hết hạn

**Giải pháp:** Đăng nhập lại vào ứng dụng

### Lỗi: CORS

**Nguyên nhân:** Backend đã config CORS, nhưng đảm bảo đang chạy đúng port

**Giải pháp:** Kiểm tra backend logs và restart nếu cần

## Tài liệu đầy đủ

Xem chi tiết tại: [BACKEND_INTEGRATION.md](./mindmap-notion-interface/BACKEND_INTEGRATION.md)

