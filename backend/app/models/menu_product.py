from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, Boolean, Float, DateTime, func
from ..database import Base

class MenuProduct(Base):
    __tablename__ = "menu_product"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    grams: Mapped[int] = mapped_column(Integer, nullable=False)
    default_price: Mapped[float] = mapped_column(Float, nullable=False)
    production_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "original" or "bite_sized"
    production_units: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
