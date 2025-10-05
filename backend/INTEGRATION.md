# Hướng dẫn Tích hợp Backend với Frontend

## ✅ Hoàn thành

Backend đã được thiết lập thành công với:
- ✅ ExpressJS server chạy tại port 3000
- ✅ CRUD API cho Categories
- ✅ Authentication với Supabase JWT
- ✅ Row Level Security (RLS)
- ✅ Activity logging
- ✅ Error handling

## 🔧 Tích hợp với Frontend

### 1. Tạo Service Layer trong Frontend

Tạo file `mindmap-notion-interface/src/services/categoryService.ts`:

```typescript
import { supabase } from '@/integrations/supabase/client';

const API_URL = 'http://localhost:3000/api';

interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  group_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CreateCategoryData {
  name: string;
  description?: string;
  color?: string;
  group_id?: string | null;
}

interface UpdateCategoryData {
  name?: string;
  description?: string;
  color?: string;
  group_id?: string | null;
}

// Helper function để lấy JWT token
const getAuthToken = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

// Helper function để tạo headers
const createHeaders = async () => {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Lấy tất cả categories
export const getAllCategories = async (): Promise<Category[]> => {
  const headers = await createHeaders();
  const response = await fetch(`${API_URL}/categories`, { headers });
  
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  
  const data = await response.json();
  return data.data;
};

// Lấy một category theo ID
export const getCategoryById = async (id: string): Promise<Category> => {
  const headers = await createHeaders();
  const response = await fetch(`${API_URL}/categories/${id}`, { headers });
  
  if (!response.ok) {
    throw new Error('Failed to fetch category');
  }
  
  const data = await response.json();
  return data.data;
};

// Tạo category mới
export const createCategory = async (categoryData: CreateCategoryData): Promise<Category> => {
  const headers = await createHeaders();
  const response = await fetch(`${API_URL}/categories`, {
    method: 'POST',
    headers,
    body: JSON.stringify(categoryData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create category');
  }
  
  const data = await response.json();
  return data.data;
};

// Cập nhật category
export const updateCategory = async (
  id: string,
  categoryData: UpdateCategoryData
): Promise<Category> => {
  const headers = await createHeaders();
  const response = await fetch(`${API_URL}/categories/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(categoryData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update category');
  }
  
  const data = await response.json();
  return data.data;
};

// Xóa category
export const deleteCategory = async (id: string): Promise<void> => {
  const headers = await createHeaders();
  const response = await fetch(`${API_URL}/categories/${id}`, {
    method: 'DELETE',
    headers
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete category');
  }
};

// Lấy categories theo group
export const getCategoriesByGroup = async (groupId: string): Promise<Category[]> => {
  const headers = await createHeaders();
  const response = await fetch(`${API_URL}/categories/group/${groupId}`, { headers });
  
  if (!response.ok) {
    throw new Error('Failed to fetch categories by group');
  }
  
  const data = await response.json();
  return data.data;
};
```

### 2. Sử dụng trong React Component

Ví dụ trong `Categories.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { 
  getAllCategories, 
  createCategory, 
  updateCategory, 
  deleteCategory 
} from '@/services/categoryService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Load categories
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await getAllCategories();
      setCategories(data);
    } catch (error) {
      toast.error('Failed to load categories');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Tạo category mới
  const handleCreate = async () => {
    try {
      const newCategory = await createCategory({
        name: 'New Project',
        description: 'Project description',
        color: '#3b82f6'
      });
      setCategories([newCategory, ...categories]);
      toast.success('Category created successfully!');
    } catch (error) {
      toast.error('Failed to create category');
      console.error(error);
    }
  };

  // Cập nhật category
  const handleUpdate = async (id: string) => {
    try {
      const updated = await updateCategory(id, {
        name: 'Updated Project Name'
      });
      setCategories(categories.map(cat => 
        cat.id === id ? updated : cat
      ));
      toast.success('Category updated successfully!');
    } catch (error) {
      toast.error('Failed to update category');
      console.error(error);
    }
  };

  // Xóa category
  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      setCategories(categories.filter(cat => cat.id !== id));
      toast.success('Category deleted successfully!');
    } catch (error) {
      toast.error('Failed to delete category');
      console.error(error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={handleCreate}>Create Category</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <Card key={category.id} className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div 
                className="w-4 h-4 rounded-full" 
                style={{ backgroundColor: category.color }}
              />
              <h3 className="font-semibold">{category.name}</h3>
            </div>
            {category.description && (
              <p className="text-sm text-gray-600 mb-4">
                {category.description}
              </p>
            )}
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleUpdate(category.id)}
              >
                Edit
              </Button>
              <Button 
                size="sm" 
                variant="destructive"
                onClick={() => handleDelete(category.id)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### 3. Sử dụng với React Query (Optional, recommended)

Cài đặt React Query:
```bash
npm install @tanstack/react-query
```

Tạo custom hooks trong `src/hooks/useCategories.tsx`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getAllCategories, 
  createCategory, 
  updateCategory, 
  deleteCategory 
} from '@/services/categoryService';
import { toast } from 'sonner';

// Hook để lấy tất cả categories
export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getAllCategories,
  });
};

// Hook để tạo category
export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created successfully!');
    },
    onError: () => {
      toast.error('Failed to create category');
    },
  });
};

// Hook để update category
export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category updated successfully!');
    },
    onError: () => {
      toast.error('Failed to update category');
    },
  });
};

// Hook để xóa category
export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted successfully!');
    },
    onError: () => {
      toast.error('Failed to delete category');
    },
  });
};
```

Sử dụng trong component:

```typescript
import { useCategories, useCreateCategory, useDeleteCategory } from '@/hooks/useCategories';

export default function Categories() {
  const { data: categories, isLoading } = useCategories();
  const createMutation = useCreateCategory();
  const deleteMutation = useDeleteCategory();

  const handleCreate = () => {
    createMutation.mutate({
      name: 'New Project',
      color: '#3b82f6'
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  // ... rest of component
}
```

## 🔐 Authentication Flow

1. User đăng nhập qua frontend (Supabase Auth)
2. Frontend lưu JWT token trong session
3. Mỗi request đến backend gửi kèm token trong header: `Authorization: Bearer <token>`
4. Backend verify token với Supabase và trích xuất user info
5. RLS policies đảm bảo user chỉ truy cập dữ liệu của họ

## 🚀 Production Deployment

### Backend
1. Deploy backend lên Heroku, Railway, hoặc VPS
2. Update CORS settings trong `src/server.js`:
```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com'
}));
```
3. Set environment variables trên hosting platform

### Frontend
1. Update `API_URL` trong service file:
```typescript
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000/api';
```
2. Add to `.env.production`:
```
VITE_API_URL=https://your-backend-domain.com/api
```

## 🧪 Testing

### Test với cURL:
```bash
# Lấy token từ frontend console
# const { data: { session } } = await supabase.auth.getSession();
# console.log(session.access_token);

# Set token variable (PowerShell)
$token = "YOUR_TOKEN_HERE"

# Get all categories
curl -H "Authorization: Bearer $token" http://localhost:3000/api/categories

# Create category
curl -X POST http://localhost:3000/api/categories `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"name":"Test Category","color":"#ff6b6b"}'

# Update category
curl -X PUT http://localhost:3000/api/categories/CATEGORY_ID `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"name":"Updated Name"}'

# Delete category
curl -X DELETE http://localhost:3000/api/categories/CATEGORY_ID `
  -H "Authorization: Bearer $token"
```

## 📊 Database Schema

Categories được lưu trong Supabase với schema:
```sql
categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  group_id UUID REFERENCES groups(id),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)
```

RLS Policies đảm bảo:
- Users chỉ xem categories của họ hoặc trong groups của họ
- Users chỉ tạo categories với `created_by = their_id`
- Users chỉ update/delete categories họ đã tạo

## 🔍 Error Handling

Backend trả về error responses với format:
```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

Common errors:
- `401 Unauthorized`: Token missing hoặc invalid
- `404 Not Found`: Category không tồn tại
- `400 Bad Request`: Validation errors
- `500 Internal Server Error`: Server errors

## 📝 Next Steps

Để mở rộng hệ thống:
1. ✅ CRUD Categories - **HOÀN THÀNH**
2. ⏳ CRUD Documents
3. ⏳ CRUD Groups
4. ⏳ CRUD Group Members
5. ⏳ Search & Filter API
6. ⏳ Statistics API
7. ⏳ File Upload API

Mỗi feature sẽ follow cùng pattern:
- Controller trong `src/controllers/`
- Routes trong `src/routes/`
- Register trong `src/server.js`
- Frontend service trong `src/services/`
- React hooks trong `src/hooks/`
