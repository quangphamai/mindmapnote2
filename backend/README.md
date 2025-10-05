# Mindmap Backend API

Backend API cho ứng dụng Mindmap Notion Interface sử dụng Express.js và Supabase.

## 📋 Yêu cầu

- Node.js >= 14.x
- npm hoặc yarn
- Supabase account

## 🚀 Cài đặt

1. Di chuyển vào thư mục backend:
```bash
cd backend
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Tạo file `.env` từ `.env.template`:
```bash
cp .env.template .env
# Hoặc tạo file .env thủ công
```

4. Cập nhật các biến môi trường trong file `.env`:
```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

**Lưu ý quan trọng:**
- Backend sử dụng `SUPABASE_SERVICE_KEY` (không phải Anon Key)
- Service Key có quyền bypass RLS và verify auth tokens
- Lấy Service Key từ: Supabase Dashboard > Settings > API > Service Role (secret)

## 🏃 Chạy ứng dụng

### Development mode (với nodemon):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

Server sẽ chạy tại: `http://localhost:3000`

## 📚 API Endpoints

### Health Check
- `GET /health` - Kiểm tra trạng thái server

### Categories API

Tất cả các endpoints cần có Authentication header:
```
Authorization: Bearer <your_supabase_jwt_token>
```

#### Lấy tất cả categories
```http
GET /api/categories
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Project Name",
      "description": "Description",
      "color": "#3b82f6",
      "group_id": null,
      "created_by": "user_uuid",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

#### Lấy category theo ID
```http
GET /api/categories/:id
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Project Name",
    "description": "Description",
    "color": "#3b82f6",
    "group_id": null,
    "created_by": "user_uuid",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
}
```

#### Tạo category mới
```http
POST /api/categories
Content-Type: application/json

{
  "name": "New Project",
  "description": "Project description",
  "color": "#ff6b6b",
  "group_id": null
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "New Project",
    "description": "Project description",
    "color": "#ff6b6b",
    "group_id": null,
    "created_by": "user_uuid",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  },
  "message": "Category created successfully"
}
```

#### Cập nhật category
```http
PUT /api/categories/:id
Content-Type: application/json

{
  "name": "Updated Project Name",
  "description": "Updated description",
  "color": "#4ecdc4"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Project Name",
    "description": "Updated description",
    "color": "#4ecdc4",
    "group_id": null,
    "created_by": "user_uuid",
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  },
  "message": "Category updated successfully"
}
```

#### Xóa category
```http
DELETE /api/categories/:id
```
**Response:**
```json
{
  "success": true,
  "message": "Category deleted successfully"
}
```

#### Lấy categories theo group
```http
GET /api/categories/group/:groupId
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Group Project",
      "description": "Description",
      "color": "#3b82f6",
      "group_id": "group_uuid",
      "created_by": "user_uuid",
      "created_at": "2025-01-01T00:00:00.000Z",
      "updated_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

## 🔐 Authentication

Backend sử dụng JWT tokens từ Supabase để xác thực người dùng. Token cần được gửi trong header của mỗi request:

```
Authorization: Bearer <your_jwt_token>
```

Để lấy JWT token, sử dụng Supabase client trong frontend:
```javascript
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

## 🛠️ Cấu trúc thư mục

```
backend/
├── src/
│   ├── config/
│   │   └── supabase.js          # Cấu hình Supabase client
│   ├── controllers/
│   │   └── categoryController.js # Controllers cho categories
│   ├── middleware/
│   │   └── auth.js               # Authentication middleware
│   ├── routes/
│   │   └── categoryRoutes.js     # Routes cho categories
│   └── server.js                 # Entry point
├── .env                          # Environment variables
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore file
├── package.json                  # Dependencies
└── README.md                     # Documentation
```

## 🔒 Security

- Sử dụng Helmet để bảo vệ Express app với các security headers
- CORS được enable cho phép frontend gọi API
- Tất cả routes categories đều yêu cầu authentication
- Row Level Security (RLS) được enable trên Supabase để đảm bảo users chỉ có thể truy cập dữ liệu của họ

## 📝 Notes

- Categories có thể thuộc về một user (personal) hoặc một group (collaborative)
- Khi tạo category mới, một activity log sẽ được tạo để tracking streak
- Categories sử dụng UUID cho ID
- Màu mặc định cho category là `#3b82f6` (blue)

## 🐛 Debugging

Để xem logs chi tiết, server sử dụng Morgan middleware ở chế độ 'dev'. Tất cả requests sẽ được log ra console.

## 📄 License

ISC
