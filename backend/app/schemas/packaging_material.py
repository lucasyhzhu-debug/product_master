from pydantic import BaseModel, Field
from datetime import datetime


class PackagingMaterialBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    brand: str | None = Field(None, max_length=255)
    procurement_source: str | None = Field(None, max_length=255)
    unit_type: str = Field("pcs", pattern="^(pcs|m|cm|sheets)$")
    volume_purchased: float = Field(..., gt=0)
    price_excl_shipping: float = Field(..., ge=0)
    shipping_cost: float = Field(0, ge=0)


class PackagingMaterialCreate(PackagingMaterialBase):
    pass


class PackagingMaterialUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    brand: str | None = Field(None, max_length=255)
    procurement_source: str | None = Field(None, max_length=255)
    unit_type: str | None = Field(None, pattern="^(pcs|m|cm|sheets)$")
    volume_purchased: float | None = Field(None, gt=0)
    price_excl_shipping: float | None = Field(None, ge=0)
    shipping_cost: float | None = Field(None, ge=0)


class PackagingMaterialResponse(PackagingMaterialBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class PackagingMaterialWithCost(PackagingMaterialResponse):
    cost_per_base_unit: float
    base_unit: str
