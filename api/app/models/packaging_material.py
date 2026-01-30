from datetime import datetime
from sqlalchemy import String, Float, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class PackagingMaterial(Base):
    __tablename__ = "packaging_material"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    procurement_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit_type: Mapped[str] = mapped_column(String(10), nullable=False, default="pcs")  # pcs, m, cm, sheets
    volume_purchased: Mapped[float] = mapped_column(Float, nullable=False)
    price_excl_shipping: Mapped[float] = mapped_column(Float, nullable=False)
    shipping_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    __table_args__ = (
        Index("idx_packaging_material_name", "name"),
    )

    def __repr__(self) -> str:
        return f"<PackagingMaterial(id={self.id}, name='{self.name}', brand='{self.brand}')>"
