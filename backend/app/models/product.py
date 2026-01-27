from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from typing import TYPE_CHECKING, List, Optional

from app.database import Base

if TYPE_CHECKING:
    from app.models.recipe import RecipeVersion
    from app.models.packaging import PackagingVersion


class Product(Base):
    __tablename__ = "product"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    versions: Mapped[List["ProductVersion"]] = relationship(
        "ProductVersion",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVersion.version_number"
    )

    __table_args__ = (
        Index("idx_product_name", "name"),
    )

    def __repr__(self) -> str:
        return f"<Product(id={self.id}, name='{self.name}')>"


class ProductVersion(Base):
    __tablename__ = "product_version"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    version_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    recipe_version_id: Mapped[int] = mapped_column(ForeignKey("recipe_version.id"), nullable=False)
    packaging_version_id: Mapped[int] = mapped_column(ForeignKey("packaging_version.id"), nullable=False)
    retail_price_idr: Mapped[float] = mapped_column(Float, nullable=False)
    num_pieces: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    grams_per_piece: Mapped[float] = mapped_column(Float, nullable=False)
    copied_from_version_id: Mapped[int | None] = mapped_column(ForeignKey("product_version.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    product: Mapped["Product"] = relationship("Product", back_populates="versions")
    recipe_version: Mapped["RecipeVersion"] = relationship("RecipeVersion", lazy="joined")
    packaging_version: Mapped["PackagingVersion"] = relationship("PackagingVersion", lazy="joined")
    copied_from: Mapped[Optional["ProductVersion"]] = relationship(
        "ProductVersion",
        remote_side=[id],
        foreign_keys=[copied_from_version_id]
    )

    __table_args__ = (
        UniqueConstraint("product_id", "version_number", name="uq_product_version"),
        Index("idx_product_version_product", "product_id"),
        Index("idx_product_version_recipe", "recipe_version_id"),
        Index("idx_product_version_packaging", "packaging_version_id"),
    )

    def __repr__(self) -> str:
        return f"<ProductVersion(id={self.id}, product_id={self.product_id}, version={self.version_number})>"


# Import for relationships
from app.models.recipe import RecipeVersion
from app.models.packaging import PackagingVersion
