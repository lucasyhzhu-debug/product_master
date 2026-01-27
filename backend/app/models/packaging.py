from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Index, UniqueConstraint, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from typing import TYPE_CHECKING, List, Optional

from app.database import Base

if TYPE_CHECKING:
    from app.models.packaging_material import PackagingMaterial


# Junction table for packaging tags
PackagingTag = Table(
    "packaging_tag",
    Base.metadata,
    Column("packaging_recipe_id", Integer, ForeignKey("packaging_recipe.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True),
)


class PackagingRecipe(Base):
    __tablename__ = "packaging_recipe"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    versions: Mapped[List["PackagingVersion"]] = relationship(
        "PackagingVersion",
        back_populates="packaging_recipe",
        cascade="all, delete-orphan",
        order_by="PackagingVersion.version_number"
    )
    tags: Mapped[List["Tag"]] = relationship(
        "Tag",
        secondary=PackagingTag,
        lazy="joined"
    )

    __table_args__ = (
        Index("idx_packaging_recipe_name", "name"),
    )

    def __repr__(self) -> str:
        return f"<PackagingRecipe(id={self.id}, name='{self.name}')>"


class PackagingVersion(Base):
    __tablename__ = "packaging_version"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    packaging_recipe_id: Mapped[int] = mapped_column(ForeignKey("packaging_recipe.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    version_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    copied_from_version_id: Mapped[int | None] = mapped_column(ForeignKey("packaging_version.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    packaging_recipe: Mapped["PackagingRecipe"] = relationship("PackagingRecipe", back_populates="versions")
    components: Mapped[List["PackagingComponent"]] = relationship(
        "PackagingComponent",
        back_populates="packaging_version",
        cascade="all, delete-orphan",
        order_by="PackagingComponent.sort_order"
    )
    copied_from: Mapped[Optional["PackagingVersion"]] = relationship(
        "PackagingVersion",
        remote_side=[id],
        foreign_keys=[copied_from_version_id]
    )

    __table_args__ = (
        UniqueConstraint("packaging_recipe_id", "version_number", name="uq_packaging_version"),
        Index("idx_packaging_version_recipe", "packaging_recipe_id"),
    )

    def __repr__(self) -> str:
        return f"<PackagingVersion(id={self.id}, packaging_recipe_id={self.packaging_recipe_id}, version={self.version_number})>"


class PackagingComponent(Base):
    __tablename__ = "packaging_component"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    packaging_version_id: Mapped[int] = mapped_column(ForeignKey("packaging_version.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    component_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    packaging_version: Mapped["PackagingVersion"] = relationship(
        "PackagingVersion",
        back_populates="components"
    )
    materials: Mapped[List["PackagingComponentMaterial"]] = relationship(
        "PackagingComponentMaterial",
        back_populates="packaging_component",
        cascade="all, delete-orphan",
        order_by="PackagingComponentMaterial.sort_order"
    )

    __table_args__ = (
        Index("idx_packaging_component_version", "packaging_version_id"),
    )

    def __repr__(self) -> str:
        return f"<PackagingComponent(id={self.id}, name='{self.component_name}')>"


class PackagingComponentMaterial(Base):
    __tablename__ = "packaging_component_material"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    packaging_component_id: Mapped[int] = mapped_column(ForeignKey("packaging_component.id", ondelete="CASCADE"), nullable=False)
    packaging_material_id: Mapped[int] = mapped_column(ForeignKey("packaging_material.id"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(10), nullable=False, default="pcs")  # pcs, m, cm, sheets
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    packaging_component: Mapped["PackagingComponent"] = relationship(
        "PackagingComponent",
        back_populates="materials"
    )
    material: Mapped["PackagingMaterial"] = relationship("PackagingMaterial", lazy="joined")

    __table_args__ = (
        Index("idx_pcm_component", "packaging_component_id"),
    )

    def __repr__(self) -> str:
        return f"<PackagingComponentMaterial(id={self.id}, material_id={self.packaging_material_id}, qty={self.quantity})>"


# Import Tag for relationship
from app.models.tag import Tag
