// Tag types
export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface TagCreate {
  name: string;
}

// Ingredient types
export interface Ingredient {
  id: number;
  name: string;
  brand: string | null;
  procurement_source: string | null;
  unit_type: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
  volume_purchased: number;
  price_excl_shipping: number;
  shipping_cost: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface IngredientWithCost extends Ingredient {
  cost_per_base_unit: number;
  base_unit: string;
}

export interface IngredientCreate {
  name: string;
  brand?: string | null;
  procurement_source?: string | null;
  unit_type: string;
  volume_purchased: number;
  price_excl_shipping: number;
  shipping_cost?: number;
}

// Packaging Material types
export interface PackagingMaterial {
  id: number;
  name: string;
  brand: string | null;
  procurement_source: string | null;
  unit_type: 'pcs' | 'm' | 'cm' | 'sheets';
  volume_purchased: number;
  price_excl_shipping: number;
  shipping_cost: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface PackagingMaterialWithCost extends PackagingMaterial {
  cost_per_base_unit: number;
  base_unit: string;
}

export interface PackagingMaterialCreate {
  name: string;
  brand?: string | null;
  procurement_source?: string | null;
  unit_type: string;
  volume_purchased: number;
  price_excl_shipping: number;
  shipping_cost?: number;
}

// Recipe types
export interface ComponentIngredient {
  id: number;
  ingredient_id: number;
  sort_order: number;
  unit: string;
  quantity: number;
  ingredient: Ingredient;
  cost: number | null;
}

export interface ComponentIngredientCreate {
  ingredient_id: number;
  sort_order?: number;
  unit: string;
  quantity: number;
}

export interface RecipeComponent {
  id: number;
  sort_order: number;
  component_name: string;
  linked_recipe_version_id: number | null;
  ingredients: ComponentIngredient[];
  subtotal_cost: number | null;
}

export interface RecipeComponentCreate {
  sort_order?: number;
  component_name: string;
  linked_recipe_version_id?: number | null;
  ingredients: ComponentIngredientCreate[];
}

export interface RecipeVersion {
  id: number;
  recipe_id: number;
  version_number: number;
  version_name: string;
  description: string | null;
  estimated_yield_grams: number | null;
  is_single_component: boolean;
  is_reusable_component: boolean;
  copied_from_version_id: number | null;
  created_at: string;
  created_by: string;
}

export interface RecipeVersionDetail extends RecipeVersion {
  components: RecipeComponent[];
  total_cost: number | null;
  cost_per_gram: number | null;
}

export interface RecipeVersionCreate {
  version_name: string;
  description: string;
  estimated_yield_grams?: number | null;
  is_reusable_component?: boolean;
  components: RecipeComponentCreate[];
}

export interface RecipeVersionCopyCreate {
  copy_from_version_id: number;
  version_name: string;
  description: string;
}

export interface Recipe {
  id: number;
  name: string;
  created_at: string;
  created_by: string;
  tags: Tag[];
  versions: RecipeVersion[];
}

export interface RecipeCreate {
  name: string;
  tag_ids?: number[];
  first_version: RecipeVersionCreate;
}

export interface RecipeSummary {
  id: number;
  name: string;
  tags: string[];
  latest_version: number;
  latest_version_name: string;
  total_cost: number | null;
  cost_per_gram: number | null;
  created_at: string;
}

// Packaging types
export interface PackagingComponentMaterial {
  id: number;
  packaging_material_id: number;
  sort_order: number;
  unit: string;
  quantity: number;
  material: PackagingMaterial;
  cost: number | null;
}

export interface PackagingComponentMaterialCreate {
  packaging_material_id: number;
  sort_order?: number;
  unit: string;
  quantity: number;
}

export interface PackagingComponent {
  id: number;
  sort_order: number;
  component_name: string;
  materials: PackagingComponentMaterial[];
  subtotal_cost: number | null;
}

export interface PackagingComponentCreate {
  sort_order?: number;
  component_name: string;
  materials: PackagingComponentMaterialCreate[];
}

export interface PackagingVersion {
  id: number;
  packaging_recipe_id: number;
  version_number: number;
  version_name: string;
  description: string | null;
  copied_from_version_id: number | null;
  created_at: string;
  created_by: string;
}

export interface PackagingVersionDetail extends PackagingVersion {
  components: PackagingComponent[];
  total_cost: number | null;
}

export interface PackagingVersionCreate {
  version_name: string;
  description: string;
  components: PackagingComponentCreate[];
}

export interface PackagingVersionCopyCreate {
  copy_from_version_id: number;
  version_name: string;
  description: string;
}

export interface PackagingRecipe {
  id: number;
  name: string;
  created_at: string;
  created_by: string;
  tags: Tag[];
  versions: PackagingVersion[];
}

export interface PackagingRecipeCreate {
  name: string;
  tag_ids?: number[];
  first_version: PackagingVersionCreate;
}

export interface PackagingRecipeSummary {
  id: number;
  name: string;
  tags: string[];
  latest_version: number;
  latest_version_name: string;
  total_cost: number | null;
  created_at: string;
}

// Menu Product types
export interface MenuProduct {
  id: number;
  code: string;
  name: string;
  grams: number;
  default_price: number;
  production_type: 'original' | 'bite_sized';
  production_units: number;
  is_active: boolean;
  created_at: string;
}

export interface MenuProductSummary extends MenuProduct { }

// Product types
export interface ProductCOGS {
  total_grams: number;
  recipe_cogs: number | null;
  packaging_cogs: number | null;
  total_cogs: number | null;
  retail_price_idr: number;
  contribution_margin: number | null;
  contribution_margin_pct: number | null;
}

export interface ProductVersion {
  id: number;
  product_id: number;
  version_number: number;
  version_name: string;
  description: string | null;
  recipe_version_id: number;
  packaging_version_id: number;
  retail_price_idr: number;
  num_pieces: number;
  grams_per_piece: number;
  copied_from_version_id: number | null;
  created_at: string;
  created_by: string;
}

export interface ProductVersionDetail extends ProductVersion {
  recipe_name: string;
  recipe_version_name: string;
  packaging_name: string;
  packaging_version_name: string;
  cogs: ProductCOGS | null;
}

export interface ProductVersionCreate {
  version_name: string;
  description: string;
  recipe_version_id: number;
  packaging_version_id: number;
  retail_price_idr: number;
  num_pieces?: number;
  grams_per_piece: number;
}

export interface ProductVersionCopyCreate {
  copy_from_version_id: number;
  version_name: string;
  description: string;
}

export interface Product {
  id: number;
  name: string;
  created_at: string;
  created_by: string;
  versions: ProductVersion[];
  tags: Tag[];
}

export interface ProductCreate {
  name: string;
  first_version: ProductVersionCreate;
  tag_ids?: number[];
}

export interface ProductSummary {
  id: number;
  name: string;
  latest_version: number;
  latest_version_name: string;
  recipe_name: string;
  packaging_name: string;
  total_cogs: number | null;
  retail_price_idr: number;
  contribution_margin_pct: number | null;
  created_at: string;
  tags: Tag[];
}

// Dashboard types
export interface DashboardStats {
  total_recipes: number;
  total_packaging: number;
  total_products: number;
  total_ingredients: number;
  total_materials: number;
}

// Customer types
export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CustomerCreate {
  name: string;
  phone?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface CustomerSummary {
  id: number;
  name: string;
  phone: string | null;
  source: string | null;
  order_count: number;
}

// Order types
export type OrderStatus = 'Draft' | 'AwaitingPayment' | 'Confirmed' | 'ProductionComplete' | 'Packaging' | 'WaitingShipment' | 'CompleteShipped' | 'WaitingPickup' | 'PickedUp' | 'Cancelled';
export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type SalesChannel = 'IG' | 'WA' | 'Shopee' | 'Tokopedia' | 'Offline' | 'Other';

export interface OrderItemCreate {
  product_name: string;
  product_variant?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost?: number;
  discount_amount?: number;
}

export interface OrderItem {
  id: number;
  product_name: string;
  product_variant: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  line_total: number;
  line_cost: number;
  line_margin: number;
  created_at: string;
}

export interface OrderCreate {
  customer_id?: number | null;
  new_customer?: CustomerCreate | null;
  channel?: string | null;
  sold_by?: string | null;
  due_date?: string | null;
  notes?: string | null;
  delivery_type?: 'Pickup' | 'Delivery';
  pickup_location?: string | null;
  delivery_address?: string | null;
  contact_wa?: string | null;
  contact_ig?: string | null;
  shipping_agency?: string | null;
  shipping_number?: string | null;
  items: OrderItemCreate[];
}

export interface OrderSummary {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  status: OrderStatus;
  awaiting_payment_since?: string | null;  // For AwaitingPayment status
  payment_status: PaymentStatus;
  channel: string | null;
  sold_by: string | null;
  due_date: string | null;
  total_amount: number;
  total_cost: number;
  total_margin: number;
  item_count: number;
  delivery_type?: string | null;
  shipping_agency?: string | null;
  created_at: string;
}

export interface OrderDetail {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  status: OrderStatus;
  awaiting_payment_since?: string | null;  // For AwaitingPayment status
  payment_status: PaymentStatus;
  payment_method: string | null;
  order_date: string;
  due_date: string | null;
  total_amount: number;
  total_cost: number;
  total_margin: number;
  margin_pct: number | null;
  channel: string | null;
  sold_by: string | null;
  notes: string | null;
  delivery_type: string;
  pickup_location: string | null;
  delivery_address: string | null;
  contact_wa: string | null;
  contact_ig: string | null;
  shipping_agency: string | null;
  shipping_number: string | null;
  cancellation_reason: string | null;
  created_at: string;
  created_by: string;
  items: OrderItem[];
  // WhatsApp templates for different stages
  whatsapp_text: string;
  payment_request_text?: string;  // Draft → Confirmed
  production_started_text?: string;  // Confirmed → ProductionComplete
  delivery_complete_text?: string;  // WaitingShipment → CompleteShipped
  shipping_text?: string;
  pickup_text?: string;
}

export interface ProductSuggestion {
  product_name: string;
  product_variant: string | null;
  last_unit_price: number;
  last_unit_cost: number;
  usage_count: number;
}

export interface SellerSuggestion {
  sold_by: string;
  order_count: number;
}

export interface ProductionReportItem {
  product_name: string;
  quantity: number;
  production_type: 'original' | 'bite_sized';
  units: number;
}

export interface ProductionReportOrder {
  order_number: string;
  customer_name: string;
  status: OrderStatus;
  items: ProductionReportItem[];
}

export interface ProductionReportDate {
  date: string;
  summary: {
    original: number;
    bite_sized: number;
  };
  orders: ProductionReportOrder[];
}

export interface ProductionReport {
  summary: {
    original: number;
    bite_sized: number;
  };
  dates: ProductionReportDate[];
}
