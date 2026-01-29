"""Order and OrderItem models for order management."""

from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.customer import Customer


class Order(Base):
    """Order entity - header for customer orders."""

    __tablename__ = "order"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customer.id"), nullable=False
    )

    # Status workflow: Draft -> Confirmed -> Completed -> Cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Draft")

    # Payment: Unpaid -> Partial -> Paid
    payment_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="Unpaid"
    )
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)

    order_date: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Totals (denormalized for performance)
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    total_cost: Mapped[float] = mapped_column(Float, default=0)
    total_margin: Mapped[float] = mapped_column(Float, default=0)

    # Sales tracking
    channel: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sold_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Delivery Info
    delivery_type: Mapped[str] = mapped_column(String(20), default="Pickup")  # Pickup, Delivery
    pickup_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Contact Info (Snapshot)
    contact_wa: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact_ig: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Shipping Info
    shipping_agency: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shipping_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Cancellation
    cancellation_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    created_by: Mapped[str] = mapped_column(String(100), default="admin")

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.id",
    )

    __table_args__ = (
        Index("idx_order_number", "order_number"),
        Index("idx_order_customer", "customer_id"),
        Index("idx_order_due_date", "due_date"),
        Index("idx_order_status", "status"),
        Index("idx_order_channel", "channel"),
    )


class OrderItem(Base):
    """Order line item - individual products in an order."""

    __tablename__ = "order_item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("order.id", ondelete="CASCADE"), nullable=False
    )

    # Product info as text (standalone mode - no FK to product)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_variant: Mapped[str | None] = mapped_column(String(255), nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, default=0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0)

    # Calculated totals (stored for reporting)
    line_total: Mapped[float] = mapped_column(Float, nullable=False)
    line_cost: Mapped[float] = mapped_column(Float, nullable=False)
    line_margin: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    order: Mapped["Order"] = relationship("Order", back_populates="items")
    menu_product_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_product.id"), nullable=True
    )
    menu_product = relationship("app.models.menu_product.MenuProduct")

    __table_args__ = (
        Index("idx_order_item_order", "order_id"),
        Index("idx_order_item_product", "product_name"),
    )
