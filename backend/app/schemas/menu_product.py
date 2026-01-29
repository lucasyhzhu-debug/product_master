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

class MenuProduct(MenuProductBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class MenuProductResponse(MenuProduct):
    pass
