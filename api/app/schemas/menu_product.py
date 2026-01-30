from pydantic import BaseModel, ConfigDict
from datetime import datetime

class MenuProductBase(BaseModel):
    code: str
    name: str
    grams: int
    default_price: float
    production_type: str
    production_units: int
    is_active: bool = True

class MenuProductCreate(BaseModel):
    """For creating custom products from order form"""
    name: str
    default_price: float
    grams: int = 0
    production_type: str = "custom"
    production_units: int = 1

class MenuProduct(MenuProductBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MenuProductResponse(MenuProduct):
    pass
