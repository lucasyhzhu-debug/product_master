"""Customer model for order management."""

from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import String, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order


class Customer(Base):
    """Customer entity for tracking order buyers."""

    __tablename__ = "customer"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="customer")

    __table_args__ = (
        Index("idx_customer_name", "name"),
        Index("idx_customer_phone", "phone"),
    )
