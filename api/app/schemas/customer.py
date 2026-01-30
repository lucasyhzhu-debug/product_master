"""Customer Pydantic schemas for API validation."""

from datetime import datetime
from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    """Schema for creating a new customer."""

    name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=50)
    source: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=1000)


class CustomerUpdate(BaseModel):
    """Schema for updating an existing customer."""

    name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=50)
    source: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=1000)


class CustomerResponse(BaseModel):
    """Schema for customer response with all fields."""

    id: int
    name: str
    phone: str | None
    source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class CustomerSummary(BaseModel):
    """Schema for customer list with order count."""

    id: int
    name: str
    phone: str | None
    source: str | None
    order_count: int = 0

    class Config:
        from_attributes = True
