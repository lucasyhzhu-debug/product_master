from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Index, Boolean, UniqueConstraint, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from typing import TYPE_CHECKING, List, Optional

from app.database import Base

if TYPE_CHECKING:
    from app.models.ingredient import Ingredient


# Junction table for recipe tags
RecipeTag = Table(
    "recipe_tag",
    Base.metadata,
    Column("recipe_id", Integer, ForeignKey("recipe.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True),
)


class Recipe(Base):
    __tablename__ = "recipe"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    versions: Mapped[List["RecipeVersion"]] = relationship(
        "RecipeVersion",
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeVersion.version_number"
    )
    tags: Mapped[List["Tag"]] = relationship(
        "Tag",
        secondary=RecipeTag,
        lazy="joined"
    )

    __table_args__ = (
        Index("idx_recipe_name", "name"),
    )

    def __repr__(self) -> str:
        return f"<Recipe(id={self.id}, name='{self.name}')>"


class RecipeVersion(Base):
    __tablename__ = "recipe_version"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    version_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    estimated_yield_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_single_component: Mapped[bool] = mapped_column(Boolean, default=False)
    is_reusable_component: Mapped[bool] = mapped_column(Boolean, default=False)
    copied_from_version_id: Mapped[int | None] = mapped_column(ForeignKey("recipe_version.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="versions")
    components: Mapped[List["RecipeComponent"]] = relationship(
        "RecipeComponent",
        back_populates="recipe_version",
        cascade="all, delete-orphan",
        order_by="RecipeComponent.sort_order",
        foreign_keys="[RecipeComponent.recipe_version_id]"
    )
    copied_from: Mapped[Optional["RecipeVersion"]] = relationship(
        "RecipeVersion",
        remote_side=[id],
        foreign_keys=[copied_from_version_id]
    )

    __table_args__ = (
        UniqueConstraint("recipe_id", "version_number", name="uq_recipe_version"),
        Index("idx_recipe_version_recipe", "recipe_id"),
    )

    def __repr__(self) -> str:
        return f"<RecipeVersion(id={self.id}, recipe_id={self.recipe_id}, version={self.version_number})>"


class RecipeComponent(Base):
    __tablename__ = "recipe_component"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipe_version_id: Mapped[int] = mapped_column(ForeignKey("recipe_version.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    component_name: Mapped[str] = mapped_column(String(255), nullable=False)
    linked_recipe_version_id: Mapped[int | None] = mapped_column(ForeignKey("recipe_version.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships - must explicitly specify which FK to use for the back_populates relationship
    recipe_version: Mapped["RecipeVersion"] = relationship(
        "RecipeVersion",
        back_populates="components",
        foreign_keys=[recipe_version_id]
    )
    linked_recipe_version: Mapped[Optional["RecipeVersion"]] = relationship(
        "RecipeVersion",
        foreign_keys=[linked_recipe_version_id]
    )
    ingredients: Mapped[List["ComponentIngredient"]] = relationship(
        "ComponentIngredient",
        back_populates="recipe_component",
        cascade="all, delete-orphan",
        order_by="ComponentIngredient.sort_order"
    )

    __table_args__ = (
        Index("idx_recipe_component_version", "recipe_version_id"),
        Index("idx_recipe_component_linked", "linked_recipe_version_id"),
    )

    def __repr__(self) -> str:
        return f"<RecipeComponent(id={self.id}, name='{self.component_name}')>"


class ComponentIngredient(Base):
    __tablename__ = "component_ingredient"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipe_component_id: Mapped[int] = mapped_column(ForeignKey("recipe_component.id", ondelete="CASCADE"), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredient.id"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(10), nullable=False, default="g")  # g, kg, ml, l, pcs
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    recipe_component: Mapped["RecipeComponent"] = relationship(
        "RecipeComponent",
        back_populates="ingredients"
    )
    ingredient: Mapped["Ingredient"] = relationship("Ingredient", lazy="joined")

    __table_args__ = (
        Index("idx_component_ingredient_component", "recipe_component_id"),
    )

    def __repr__(self) -> str:
        return f"<ComponentIngredient(id={self.id}, ingredient_id={self.ingredient_id}, qty={self.quantity})>"


# Import Tag for relationship
from app.models.tag import Tag
