"""Order and OrderItem Pydantic schemas for API validation."""

from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.customer import CustomerCreate


# Order Item schemas
class OrderItemCreate(BaseModel):
    """Schema for creating an order line item."""

    product_name: str = Field(..., min_length=1, max_length=255)
    product_variant: str | None = Field(None, max_length=255)
    quantity: int = Field(1, ge=1)
    unit_price: float = Field(..., gt=0)
    unit_cost: float = Field(0, ge=0)
    discount_amount: float = Field(0, ge=0)


class OrderItemResponse(BaseModel):
    """Schema for order item response."""

    id: int
    product_name: str
    product_variant: str | None
    quantity: int
    unit_price: float
    unit_cost: float
    discount_amount: float
    line_total: float
    line_cost: float
    line_margin: float
    created_at: datetime

    class Config:
        from_attributes = True


# Order schemas
class OrderCreate(BaseModel):
    """Schema for creating a new order."""

    customer_id: int | None = None
    new_customer: CustomerCreate | None = None
    channel: str | None = Field(None, max_length=50)
    sold_by: str | None = Field(None, max_length=100)
    due_date: datetime | None = None
    notes: str | None = Field(None, max_length=1000)
    items: list[OrderItemCreate] = Field(..., min_length=1)


class OrderStatusUpdate(BaseModel):
    """Schema for updating order status."""

    status: str = Field(..., pattern="^(Draft|Confirmed|Completed|Cancelled)$")


class OrderPaymentUpdate(BaseModel):
    """Schema for updating payment status."""

    payment_status: str = Field(..., pattern="^(Unpaid|Partial|Paid)$")
    payment_method: str | None = Field(None, max_length=50)


class OrderResponse(BaseModel):
    """Schema for order response (list view)."""

    id: int
    order_number: str
    customer_id: int
    status: str
    payment_status: str
    payment_method: str | None
    order_date: datetime
    due_date: datetime | None
    total_amount: float
    total_cost: float
    total_margin: float
    channel: str | None
    sold_by: str | None
    notes: str | None
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class OrderSummary(BaseModel):
    """Schema for order list with customer name."""

    id: int
    order_number: str
    customer_name: str
    customer_phone: str | None
    status: str
    payment_status: str
    channel: str | None
    sold_by: str | None
    due_date: datetime | None
    total_amount: float
    total_cost: float
    total_margin: float
    item_count: int
    created_at: datetime


class OrderDetail(BaseModel):
    """Schema for full order detail with items and WhatsApp text."""

    id: int
    order_number: str
    customer_id: int
    customer_name: str
    customer_phone: str | None
    status: str
    payment_status: str
    payment_method: str | None
    order_date: datetime
    due_date: datetime | None
    total_amount: float
    total_cost: float
    total_margin: float
    margin_pct: float | None
    channel: str | None
    sold_by: str | None
    notes: str | None
    created_at: datetime
    created_by: str
    items: list[OrderItemResponse]
    whatsapp_text: str


# Suggestion schemas for combobox autocomplete
class ProductSuggestion(BaseModel):
    """Schema for product name suggestion from order history."""

    product_name: str
    product_variant: str | None
    last_unit_price: float
    last_unit_cost: float
    usage_count: int


class SellerSuggestion(BaseModel):
    """Schema for seller suggestion from order history."""

    sold_by: str
    order_count: int
