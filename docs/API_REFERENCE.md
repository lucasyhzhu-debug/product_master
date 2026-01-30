# API Reference

> **Purpose:** Complete API endpoint documentation for Malo Recipe Master.
> **When to read:** Before implementing or modifying API endpoints.

## Table of Contents
- [Overview](#overview)
- [Endpoints (55 total)](#endpoints-55-total)
- [Response Format](#response-format)
- [Error Handling](#error-handling)

---

## Overview

The API is built with FastAPI and follows RESTful conventions. All endpoints are prefixed with `/api/`.

**Base URL:**
- Development: `http://localhost:8000/api`
- Production: `https://your-app.vercel.app/api`

---

## Endpoints (55 total)

### Dashboard
```
GET    /api/dashboard/stats              # Dashboard statistics
```

### Ingredients
```
GET    /api/ingredients                  # List all with costs
GET    /api/ingredients/{id}             # Get single
POST   /api/ingredients                  # Create
PATCH  /api/ingredients/{id}             # Update
DELETE /api/ingredients/{id}             # Delete
```

### Packaging Materials
```
GET    /api/packaging-materials          # List all with costs
GET    /api/packaging-materials/{id}     # Get single
POST   /api/packaging-materials          # Create
PATCH  /api/packaging-materials/{id}     # Update
DELETE /api/packaging-materials/{id}     # Delete
```

### Tags
```
GET    /api/tags                         # List all
POST   /api/tags                         # Create
DELETE /api/tags/{id}                    # Delete
```

### Recipes
```
GET    /api/recipes                      # List summaries
GET    /api/recipes/reusable             # List reusable components
GET    /api/recipes/{id}                 # Get with all versions
GET    /api/recipes/{id}/versions/{v}    # Get specific version
POST   /api/recipes                      # Create + first version
POST   /api/recipes/{id}/versions        # Create new version
POST   /api/recipes/{id}/versions/copy   # Copy from existing version
PUT    /api/recipes/{id}/tags            # Update tags
DELETE /api/recipes/{id}                 # Delete (blocked if used)
```

### Packaging
```
GET    /api/packaging                    # List summaries
GET    /api/packaging/{id}               # Get with all versions
GET    /api/packaging/{id}/versions/{v}  # Get specific version
POST   /api/packaging                    # Create + first version
POST   /api/packaging/{id}/versions      # Create new version
POST   /api/packaging/{id}/versions/copy # Copy from existing version
PUT    /api/packaging/{id}/tags          # Update tags
DELETE /api/packaging/{id}               # Delete (blocked if used)
```

### Products
```
GET    /api/products                     # List with COGS summaries
GET    /api/products/{id}                # Get with all versions
GET    /api/products/{id}/versions/{v}   # Get version with COGS breakdown
POST   /api/products                     # Create + first version
POST   /api/products/{id}/versions       # Create new version
POST   /api/products/{id}/versions/copy  # Copy from existing version
DELETE /api/products/{id}                # Delete
```

### Customers (Order Management)
```
GET    /api/customers                    # List with ?q= search
GET    /api/customers/{id}               # Get customer
POST   /api/customers                    # Create customer
PATCH  /api/customers/{id}               # Update customer
```

### Orders (Order Management)
```
GET    /api/orders                       # List with filters (status, channel, due_date)
GET    /api/orders/{id}                  # Get detail with WhatsApp text
GET    /api/orders/kitchen               # Kitchen view orders (production statuses only)
GET    /api/orders/production/report     # Production report grouped by date
POST   /api/orders                       # Create order with line items
PATCH  /api/orders/{id}/status           # Update status
PATCH  /api/orders/{id}/payment          # Update payment status/method
PATCH  /api/orders/{id}/shipping         # Update shipping info
DELETE /api/orders/{id}                  # Delete (Draft only)
```

### Order Autocomplete Suggestions
```
GET    /api/orders/products/suggestions  # Distinct products from order history
GET    /api/orders/sellers/suggestions   # Distinct sold_by from order history
```

### CSV Export (Order Management)
```
GET    /api/orders/export/orders         # Export all orders as CSV
GET    /api/orders/export/order-items    # Export all order items as CSV
```

---

## Response Format

### List Endpoints (Summaries)
```python
class RecipeSummary(BaseModel):
    id: int
    name: str
    tags: list[str]
    latest_version: int
    latest_version_name: str
    total_cost: float | None
    cost_per_gram: float | None
    created_at: datetime
```

### Detail Endpoints (Full Objects)
```python
class RecipeVersionDetail(BaseModel):
    id: int
    recipe_id: int
    version_number: int
    version_name: str
    description: str | None
    estimated_yield_grams: float | None
    is_single_component: bool
    is_reusable_component: bool
    components: list[RecipeComponentDetail]
    total_cost: float | None
    cost_per_gram: float | None
```

### Order Detail Response
```python
class OrderDetail(BaseModel):
    id: int
    order_number: str
    customer: CustomerResponse
    status: str
    awaiting_payment_since: datetime | None
    payment_status: str
    payment_method: str | None
    order_date: datetime
    due_date: datetime | None
    total_amount: float
    total_cost: float
    total_margin: float
    channel: str | None
    sold_by: str | None
    delivery_type: str
    items: list[OrderItemResponse]
    whatsapp_text: str              # Pre-formatted receipt
    payment_request_text: str       # Payment reminder template
    production_started_text: str    # Production notification template
    delivery_complete_text: str     # Delivery confirmation template
```

---

## Error Handling

```python
from fastapi import HTTPException

# 404 - Not Found
if not recipe:
    raise HTTPException(status_code=404, detail="Recipe not found")

# 400 - Bad Request (business logic violation)
if recipe_in_use:
    raise HTTPException(
        status_code=400,
        detail=f"Cannot delete recipe. Used in products: {product_names}"
    )

# 422 - Validation Error (automatic from Pydantic)
# Returned when request body doesn't match schema
```

### Common Error Responses

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Bad Request | Business rule violation, invalid state transition |
| 404 | Not Found | Entity doesn't exist |
| 422 | Validation Error | Request body fails Pydantic validation |
| 500 | Server Error | Unexpected exception |
