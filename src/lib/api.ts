import axios from 'axios';
import type {
  Tag,
  TagCreate,
  Ingredient,
  IngredientWithCost,
  IngredientCreate,
  PackagingMaterial,
  PackagingMaterialWithCost,
  PackagingMaterialCreate,
  Recipe,
  RecipeCreate,
  RecipeSummary,
  RecipeVersionDetail,
  RecipeVersionCreate,
  RecipeVersionCopyCreate,
  PackagingRecipe,
  PackagingRecipeCreate,
  PackagingRecipeSummary,
  PackagingVersionDetail,
  PackagingVersionCreate,
  PackagingVersionCopyCreate,
  Product,
  ProductCreate,
  ProductSummary,
  ProductVersionDetail,
  ProductVersionCreate,
  ProductVersionCopyCreate,
  DashboardStats,
  Customer,
  CustomerCreate,
  CustomerSummary,
  OrderCreate,
  OrderSummary,
  OrderDetail,
  ProductSuggestion,
  SellerSuggestion,
  MenuProduct,
  ProductionReport,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tags
export const tagApi = {
  list: async (): Promise<Tag[]> => {
    const { data } = await api.get('/tags');
    return data;
  },
  create: async (tag: TagCreate): Promise<Tag> => {
    const { data } = await api.post('/tags', tag);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/tags/${id}`);
  },
};

// Ingredients
export const ingredientApi = {
  list: async (): Promise<IngredientWithCost[]> => {
    const { data } = await api.get('/ingredients');
    return data;
  },
  get: async (id: number): Promise<Ingredient> => {
    const { data } = await api.get(`/ingredients/${id}`);
    return data;
  },
  create: async (ingredient: IngredientCreate): Promise<Ingredient> => {
    const { data } = await api.post('/ingredients', ingredient);
    return data;
  },
  update: async (id: number, ingredient: Partial<IngredientCreate>): Promise<Ingredient> => {
    const { data } = await api.put(`/ingredients/${id}`, ingredient);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/ingredients/${id}`);
  },
};

// Packaging Materials
export const packagingMaterialApi = {
  list: async (): Promise<PackagingMaterialWithCost[]> => {
    const { data } = await api.get('/packaging-materials');
    return data;
  },
  get: async (id: number): Promise<PackagingMaterial> => {
    const { data } = await api.get(`/packaging-materials/${id}`);
    return data;
  },
  create: async (material: PackagingMaterialCreate): Promise<PackagingMaterial> => {
    const { data } = await api.post('/packaging-materials', material);
    return data;
  },
  update: async (id: number, material: Partial<PackagingMaterialCreate>): Promise<PackagingMaterial> => {
    const { data } = await api.put(`/packaging-materials/${id}`, material);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/packaging-materials/${id}`);
  },
};

// Recipes
export const recipeApi = {
  list: async (): Promise<RecipeSummary[]> => {
    const { data } = await api.get('/recipes');
    return data;
  },
  get: async (id: number): Promise<Recipe> => {
    const { data } = await api.get(`/recipes/${id}`);
    return data;
  },
  getVersion: async (recipeId: number, versionNumber: number): Promise<RecipeVersionDetail> => {
    const { data } = await api.get(`/recipes/${recipeId}/versions/${versionNumber}`);
    return data;
  },
  create: async (recipe: RecipeCreate): Promise<Recipe> => {
    const { data } = await api.post('/recipes', recipe);
    return data;
  },
  createVersion: async (recipeId: number, version: RecipeVersionCreate): Promise<RecipeVersionDetail> => {
    const { data } = await api.post(`/recipes/${recipeId}/versions`, version);
    return data;
  },
  copyVersion: async (recipeId: number, copy: RecipeVersionCopyCreate): Promise<RecipeVersionDetail> => {
    const { data } = await api.post(`/recipes/${recipeId}/versions/copy`, copy);
    return data;
  },
  updateTags: async (id: number, tagIds: number[]): Promise<Recipe> => {
    const { data } = await api.put(`/recipes/${id}/tags`, { tag_ids: tagIds });
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/recipes/${id}`);
  },
  listReusable: async (): Promise<RecipeSummary[]> => {
    const { data } = await api.get('/recipes/reusable');
    return data;
  },
};

// Packaging Recipes
export const packagingApi = {
  list: async (): Promise<PackagingRecipeSummary[]> => {
    const { data } = await api.get('/packaging');
    return data;
  },
  get: async (id: number): Promise<PackagingRecipe> => {
    const { data } = await api.get(`/packaging/${id}`);
    return data;
  },
  getVersion: async (packagingId: number, versionNumber: number): Promise<PackagingVersionDetail> => {
    const { data } = await api.get(`/packaging/${packagingId}/versions/${versionNumber}`);
    return data;
  },
  create: async (packaging: PackagingRecipeCreate): Promise<PackagingRecipe> => {
    const { data } = await api.post('/packaging', packaging);
    return data;
  },
  createVersion: async (packagingId: number, version: PackagingVersionCreate): Promise<PackagingVersionDetail> => {
    const { data } = await api.post(`/packaging/${packagingId}/versions`, version);
    return data;
  },
  copyVersion: async (packagingId: number, copy: PackagingVersionCopyCreate): Promise<PackagingVersionDetail> => {
    const { data } = await api.post(`/packaging/${packagingId}/versions/copy`, copy);
    return data;
  },
  updateTags: async (id: number, tagIds: number[]): Promise<PackagingRecipe> => {
    const { data } = await api.put(`/packaging/${id}/tags`, { tag_ids: tagIds });
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/packaging/${id}`);
  },
};

// Menu Products
export const menuProductApi = {
  list: async (activeOnly: boolean = true): Promise<MenuProduct[]> => {
    const { data } = await api.get('/menu-products', {
      params: { active_only: activeOnly },
    });
    return data;
  },
  create: async (product: { name: string; default_price: number }): Promise<MenuProduct> => {
    const { data } = await api.post('/menu-products', product);
    return data;
  },
};

// Products
export const productApi = {
  list: async (): Promise<ProductSummary[]> => {
    const { data } = await api.get('/products');
    return data;
  },
  get: async (id: number): Promise<Product> => {
    const { data } = await api.get(`/products/${id}`);
    return data;
  },
  getVersion: async (productId: number, versionNumber: number): Promise<ProductVersionDetail> => {
    const { data } = await api.get(`/products/${productId}/versions/${versionNumber}`);
    return data;
  },
  create: async (product: ProductCreate): Promise<Product> => {
    const { data } = await api.post('/products', product);
    return data;
  },
  createVersion: async (productId: number, version: ProductVersionCreate): Promise<ProductVersionDetail> => {
    const { data } = await api.post(`/products/${productId}/versions`, version);
    return data;
  },
  copyVersion: async (productId: number, copy: ProductVersionCopyCreate): Promise<ProductVersionDetail> => {
    const { data } = await api.post(`/products/${productId}/versions/copy`, copy);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/products/${id}`);
  },
};

// Dashboard
export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const { data } = await api.get('/dashboard/stats');
    return data;
  },
};

// Customers
export const customerApi = {
  list: async (query?: string): Promise<CustomerSummary[]> => {
    const params = query ? { q: query } : undefined;
    const { data } = await api.get('/customers', { params });
    return data;
  },
  get: async (id: number): Promise<Customer> => {
    const { data } = await api.get(`/customers/${id}`);
    return data;
  },
  create: async (customer: CustomerCreate): Promise<Customer> => {
    const { data } = await api.post('/customers', customer);
    return data;
  },
  update: async (id: number, customer: Partial<CustomerCreate>): Promise<Customer> => {
    const { data } = await api.patch(`/customers/${id}`, customer);
    return data;
  },
};

// Orders
export const orderApi = {
  list: async (params?: {
    status?: string;
    channel?: string;
    due_date_from?: string;
    due_date_to?: string;
  }): Promise<OrderSummary[]> => {
    const { data } = await api.get('/orders', { params });
    return data;
  },
  get: async (id: number): Promise<OrderDetail> => {
    const { data } = await api.get(`/orders/${id}`);
    return data;
  },
  create: async (order: OrderCreate): Promise<OrderDetail> => {
    const { data } = await api.post('/orders', order);
    return data;
  },
  updateStatus: async (
    id: number,
    status: string,
    cancellation_reason?: string
  ): Promise<OrderSummary> => {
    const { data } = await api.patch(`/orders/${id}/status`, {
      status,
      cancellation_reason,
    });
    return data;
  },
  updatePayment: async (
    id: number,
    payment_status: string,
    payment_method?: string
  ): Promise<OrderSummary> => {
    const { data } = await api.patch(`/orders/${id}/payment`, {
      payment_status,
      payment_method,
    });
    return data;
  },
  updateShipping: async (
    id: number,
    shipping_agency: string | null,
    shipping_number: string | null
  ): Promise<OrderSummary> => {
    const { data } = await api.patch(`/orders/${id}/shipping`, {
      shipping_agency,
      shipping_number,
    });
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/orders/${id}`);
  },
  getProductionReport: async (startDate: string | null = null, endDate: string | null = null): Promise<ProductionReport> => {
    const params: any = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const { data } = await api.get('/orders/production/report', { params });
    return data;
  },
  getProductSuggestions: async (query?: string): Promise<ProductSuggestion[]> => {
    const params = query ? { q: query } : undefined;
    const { data } = await api.get('/orders/products/suggestions', { params });
    return data;
  },
  getSellerSuggestions: async (query?: string): Promise<SellerSuggestion[]> => {
    const params = query ? { q: query } : undefined;
    const { data } = await api.get('/orders/sellers/suggestions', { params });
    return data;
  },
  getKitchenOrders: async (targetDate?: string): Promise<OrderSummary[]> => {
    const params = targetDate ? { target_date: targetDate } : undefined;
    const { data } = await api.get('/orders/kitchen', { params });
    return data;
  },
};

// Export
export const exportApi = {
  downloadOrdersCsv: () => {
    window.open(`${API_BASE_URL}/orders/export/orders`, '_blank');
  },
  downloadOrderItemsCsv: () => {
    window.open(`${API_BASE_URL}/orders/export/order-items`, '_blank');
  },
};

export default api;
