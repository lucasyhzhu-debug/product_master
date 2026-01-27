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
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
    const { data } = await api.patch(`/ingredients/${id}`, ingredient);
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
    const { data } = await api.patch(`/packaging-materials/${id}`, material);
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

export default api;
