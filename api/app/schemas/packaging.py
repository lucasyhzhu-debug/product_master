from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.tag import TagResponse
from app.schemas.packaging_material import PackagingMaterialResponse


# Packaging Component Material schemas
class PackagingComponentMaterialCreate(BaseModel):
    packaging_material_id: int
    sort_order: int = 0
    unit: str = Field("pcs", pattern="^(pcs|m|cm|sheets)$")
    quantity: float = Field(..., gt=0)


class PackagingComponentMaterialResponse(BaseModel):
    id: int
    packaging_material_id: int
    sort_order: int
    unit: str
    quantity: float
    material: PackagingMaterialResponse
    cost: float | None = None  # Calculated field

    class Config:
        from_attributes = True


# Packaging Component schemas
class PackagingComponentCreate(BaseModel):
    sort_order: int = 0
    component_name: str = Field(..., min_length=1, max_length=255)
    materials: list[PackagingComponentMaterialCreate] = []


class PackagingComponentResponse(BaseModel):
    id: int
    sort_order: int
    component_name: str
    materials: list[PackagingComponentMaterialResponse]
    subtotal_cost: float | None = None  # Calculated field

    class Config:
        from_attributes = True


# Packaging Version schemas
class PackagingVersionCreate(BaseModel):
    version_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=1000)
    components: list[PackagingComponentCreate] = []


class PackagingVersionCopyCreate(BaseModel):
    copy_from_version_id: int
    version_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=1000)


class PackagingVersionResponse(BaseModel):
    id: int
    packaging_recipe_id: int
    version_number: int
    version_name: str
    description: str | None
    copied_from_version_id: int | None
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class PackagingVersionDetail(PackagingVersionResponse):
    components: list[PackagingComponentResponse]
    total_cost: float | None = None


# Packaging Recipe schemas
class PackagingRecipeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    tag_ids: list[int] = []
    first_version: PackagingVersionCreate


class PackagingRecipeResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    created_by: str
    tags: list[TagResponse]
    versions: list[PackagingVersionResponse]

    class Config:
        from_attributes = True


class PackagingRecipeSummary(BaseModel):
    id: int
    name: str
    tags: list[str]
    latest_version: int
    latest_version_name: str
    total_cost: float | None
    created_at: datetime
