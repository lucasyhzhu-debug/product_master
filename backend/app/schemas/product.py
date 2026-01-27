from pydantic import BaseModel, Field
from datetime import datetime


# Product Version schemas
class ProductVersionCreate(BaseModel):
    version_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=1000)
    recipe_version_id: int
    packaging_version_id: int
    retail_price_idr: float = Field(..., gt=0)
    num_pieces: int = Field(1, ge=1)
    grams_per_piece: float = Field(..., gt=0)


class ProductVersionCopyCreate(BaseModel):
    copy_from_version_id: int
    version_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=1000)


class ProductVersionResponse(BaseModel):
    id: int
    product_id: int
    version_number: int
    version_name: str
    description: str | None
    recipe_version_id: int
    packaging_version_id: int
    retail_price_idr: float
    num_pieces: int
    grams_per_piece: float
    copied_from_version_id: int | None
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class ProductCOGS(BaseModel):
    total_grams: float
    recipe_cogs: float | None
    packaging_cogs: float | None
    total_cogs: float | None
    retail_price_idr: float
    contribution_margin: float | None
    contribution_margin_pct: float | None


class ProductVersionDetail(ProductVersionResponse):
    recipe_name: str
    recipe_version_name: str
    packaging_name: str
    packaging_version_name: str
    cogs: ProductCOGS | None = None


# Product schemas
class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    first_version: ProductVersionCreate


class ProductResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    created_by: str
    versions: list[ProductVersionResponse]

    class Config:
        from_attributes = True


class ProductSummary(BaseModel):
    id: int
    name: str
    latest_version: int
    latest_version_name: str
    recipe_name: str
    packaging_name: str
    total_cogs: float | None
    retail_price_idr: float
    contribution_margin_pct: float | None
    created_at: datetime
