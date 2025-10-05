# Hướng dẫn Setup Backend

## 🎯 Mục tiêu
Backend này cung cấp RESTful API để quản lý Categories cho từng user trong hệ thống Mindmap Notion Interface.

## ✅ Đã hoàn thành

✅ Cấu trúc thư mục backend với Express.js  
✅ Kết nối với Supabase  
✅ Authentication middleware sử dụng JWT  
✅ CRUD API cho Categories  
✅ Row-level security (RLS) để bảo vệ dữ liệu user  
✅ Activity logging cho streak tracking  
✅ Error handling và validation  

## 🚀 Cách chạy

### 1. Cài đặt dependencies (đã hoàn thành)
```bash
cd backend
npm install
```

### 2. Chạy server
```bash
# Development mode với nodemon (tự động restart khi có thay đổi)
npm run dev

# Hoặc production mode
npm start
```

Server sẽ chạy tại: **http://localhost:3000**

### 3. Test API

#### Sử dụng REST Client (VS Code Extension)
1. Cài đặt extension "REST Client" trong VS Code
2. Mở file `test-api.http`
3. Click vào "Send Request" phía trên mỗi request

#### Sử dụng Postman/Thunder Client
Import các endpoint từ file `test-api.http`

#### Sử dụng cURL
```bash
# Health check
curl http://localhost:3000/health

# Get categories (cần token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/categories

# Create category
curl -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"New Category","color":"#3b82f6"}'
```

## 🔑 Lấy JWT Token

Để test API, bạn cần JWT token từ Supabase. Có 2 cách:

### Cách 1: Từ Frontend
1. Đăng nhập vào frontend app
2. Mở DevTools Console
3. Chạy lệnh:
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log(session.access_token);
```
4. Copy token và sử dụng trong API requests

### Cách 2: Từ Supabase Dashboard
1. Vào Supabase Dashboard
2. Chọn project của bạn
3. Vào Authentication > Users
4. Tạo user mới nếu chưa có
5. Copy user ID để test

## 📋 API Endpoints

| Method | Endpoint | Mô tả | Auth Required |
|--------|----------|-------|---------------|
| GET | `/health` | Kiểm tra server status | ❌ |
| GET | `/api/categories` | Lấy tất cả categories của user | ✅ |
| GET | `/api/categories/:id` | Lấy category theo ID | ✅ |
| POST | `/api/categories` | Tạo category mới | ✅ |
| PUT | `/api/categories/:id` | Cập nhật category | ✅ |
| DELETE | `/api/categories/:id` | Xóa category | ✅ |
| GET | `/api/categories/group/:groupId` | Lấy categories theo group | ✅ |

## 🔒 Security Features

1. **JWT Authentication**: Tất cả routes (trừ health check) đều yêu cầu JWT token hợp lệ
2. **Row Level Security (RLS)**: Supabase RLS đảm bảo users chỉ truy cập dữ liệu của họ
3. **Helmet.js**: Bảo vệ app với security headers
4. **CORS**: Chỉ cho phép requests từ frontend
5. **Input Validation**: Validate và sanitize input data

## 📊 Database Schema

```sql
categories
├── id (UUID, Primary Key)
├── name (TEXT, Required)
├── description (TEXT)
├── color (TEXT, Default: #3b82f6)
├── group_id (UUID, FK to groups)
├── created_by (UUID, FK to auth.users, Required)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

## 🔄 Kết nối với Frontend

### Cấu hình CORS
Backend đã enable CORS cho tất cả origins. Trong production, nên giới hạn:

```javascript
// src/server.js
app.use(cors({
  origin: 'http://localhost:5173' // Frontend URL
}));
```

### Frontend Integration Example

```typescript
// Frontend: src/services/categoryService.ts
const API_URL = 'http://localhost:3000/api';

const getCategoriesFromBackend = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${API_URL}/categories`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  return response.json();
};
```

## 🐛 Troubleshooting

### Port đã được sử dụng
```bash
# Windows: Tìm và kill process sử dụng port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Hoặc đổi port trong .env
PORT=3001
```

### Token không hợp lệ
- Đảm bảo token chưa hết hạn
- Kiểm tra format: `Bearer <token>`
- Verify token trên jwt.io

### Lỗi kết nối Supabase
- Kiểm tra SUPABASE_URL và SUPABASE_ANON_KEY trong .env
- Verify network connection
- Kiểm tra Supabase project status

### CORS errors
- Đảm bảo backend server đang chạy
- Kiểm tra CORS configuration trong server.js
- Verify frontend URL

## 📝 Next Steps

### Các chức năng có thể mở rộng:
- [ ] CRUD API cho Documents
- [ ] CRUD API cho Groups
- [ ] CRUD API cho Group Members
- [ ] Statistics API
- [ ] Search API
- [ ] File upload API (cho documents)
- [ ] Real-time notifications
- [ ] Rate limiting
- [ ] Caching với Redis
- [ ] API documentation với Swagger

### Improvements:
- [ ] Input validation với Joi hoặc Yup
- [ ] Request rate limiting
- [ ] API versioning
- [ ] Automated testing
- [ ] Docker containerization
- [ ] CI/CD pipeline

## 🤝 Contributing

Khi thêm features mới:
1. Tạo controller trong `src/controllers/`
2. Tạo routes trong `src/routes/`
3. Register routes trong `src/server.js`
4. Update README và SETUP docs
5. Test thoroughly

## 📞 Support

Nếu gặp vấn đề, check:
1. Server logs trong terminal
2. Supabase dashboard logs
3. Network tab trong DevTools
4. `.env` configuration
