"""Order API endpoints with CSV export."""

from datetime import datetime, date
from io import StringIO
import csv

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.order import Order
from app.schemas.order import (
    OrderCreate,
    OrderResponse,
    OrderDetail,
    OrderSummary,
    OrderStatusUpdate,
    OrderPaymentUpdate,
    OrderShippingUpdate,
    ProductSuggestion,
    SellerSuggestion,
)
from app.crud import orders as crud
from app.services.whatsapp_formatter import (
    format_whatsapp_receipt,
    format_whatsapp_shipping,
    format_whatsapp_pickup,
    format_payment_request,
    format_production_started,
    format_delivery_complete,
)

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _build_order_detail(order: Order) -> OrderDetail:
    """Build detailed order response with WhatsApp text."""
    margin_pct = None
    if order.total_amount > 0:
        margin_pct = (order.total_margin / order.total_amount) * 100

    return OrderDetail(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=order.customer.name,
        customer_phone=order.customer.phone,
        status=order.status,
        awaiting_payment_since=order.awaiting_payment_since,
        payment_status=order.payment_status,
        payment_method=order.payment_method,
        order_date=order.order_date,
        due_date=order.due_date,
        total_amount=order.total_amount,
        total_cost=order.total_cost,
        total_margin=order.total_margin,
        margin_pct=margin_pct,
        channel=order.channel,
        sold_by=order.sold_by,
        notes=order.notes,
        
        # New fields
        delivery_type=order.delivery_type,
        pickup_location=order.pickup_location,
        delivery_address=order.delivery_address,
        contact_wa=order.contact_wa,
        contact_ig=order.contact_ig,
        shipping_agency=order.shipping_agency,
        shipping_number=order.shipping_number,
        cancellation_reason=order.cancellation_reason,

        created_at=order.created_at,
        created_by=order.created_by,
        items=order.items,
        # WhatsApp templates for different stages
        whatsapp_text=format_whatsapp_receipt(order),
        payment_request_text=format_payment_request(order),
        production_started_text=format_production_started(order),
        delivery_complete_text=format_delivery_complete(order),
        shipping_text=format_whatsapp_shipping(order),
        pickup_text=format_whatsapp_pickup(order),
    )


@router.get("", response_model=list[OrderSummary])
def list_orders(
    status: str | None = Query(None, description="Filter by status"),
    channel: str | None = Query(None, description="Filter by channel"),
    due_date_from: datetime | None = Query(None, description="Due date from"),
    due_date_to: datetime | None = Query(None, description="Due date to"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List orders with optional filters."""
    orders = crud.get_orders(
        db,
        status=status,
        channel=channel,
        due_date_from=due_date_from,
        due_date_to=due_date_to,
        skip=skip,
        limit=limit,
    )
    return [
        OrderSummary(
            id=o.id,
            order_number=o.order_number,
            customer_name=o.customer.name,
            customer_phone=o.customer.phone,
            status=o.status,
            awaiting_payment_since=o.awaiting_payment_since,
            payment_status=o.payment_status,
            channel=o.channel,
            sold_by=o.sold_by,
            due_date=o.due_date,
            total_amount=o.total_amount,
            total_cost=o.total_cost,
            total_margin=o.total_margin,
            item_count=len(o.items),
            delivery_type=o.delivery_type,
            shipping_agency=o.shipping_agency,
            created_at=o.created_at,
        )
        for o in orders
    ]


@router.get("/kitchen", response_model=list[OrderSummary])
def get_kitchen_orders(
    target_date: date | None = Query(None, description="Target date (YYYY-MM-DD), defaults to today"),
    db: Session = Depends(get_db),
):
    """
    Get orders for Kitchen View.

    Shows only production-relevant orders:
    - Confirmed (to produce)
    - ProductionComplete (done with production)
    - Packaging (actively packaging)
    - WaitingShipment / WaitingPickup (ready)

    If no date provided, shows today + overdue.
    """
    if target_date is None:
        target_date = date.today()

    orders = crud.get_kitchen_orders(db, target_date=target_date)

    return [
        OrderSummary(
            id=o.id,
            order_number=o.order_number,
            customer_name=o.customer.name,
            customer_phone=o.customer.phone,
            status=o.status,
            awaiting_payment_since=o.awaiting_payment_since,
            payment_status=o.payment_status,
            channel=o.channel,
            sold_by=o.sold_by,
            due_date=o.due_date,
            total_amount=o.total_amount,
            total_cost=o.total_cost,
            total_margin=o.total_margin,
            item_count=len(o.items),
            delivery_type=o.delivery_type,
            shipping_agency=o.shipping_agency,
            created_at=o.created_at,
        )
        for o in orders
    ]


@router.get("/products/suggestions", response_model=list[ProductSuggestion])
def get_product_suggestions(
    q: str | None = Query(None, description="Search query"),
    db: Session = Depends(get_db),
):
    """Get product name suggestions from order history for autocomplete."""
    suggestions = crud.get_product_suggestions(db, query=q)
    return [ProductSuggestion(**s) for s in suggestions]


@router.get("/sellers/suggestions", response_model=list[SellerSuggestion])
def get_seller_suggestions(
    q: str | None = Query(None, description="Search query"),
    db: Session = Depends(get_db),
):
    """Get seller suggestions from order history for autocomplete."""
    suggestions = crud.get_seller_suggestions(db, query=q)
    return [SellerSuggestion(**s) for s in suggestions]


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """Get order details with WhatsApp text."""
    order = crud.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _build_order_detail(order)


@router.post("", response_model=OrderDetail, status_code=201)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    """Create a new order with line items."""
    try:
        new_order = crud.create_order(db, order)
        # Reload with relationships
        full_order = crud.get_order(db, new_order.id)
        return _build_order_detail(full_order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    update: OrderStatusUpdate,
    db: Session = Depends(get_db),
):
    """Update order status."""
    order = crud.update_order_status(
        db, order_id, update.status, update.cancellation_reason
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}/payment", response_model=OrderResponse)
def update_order_payment(
    order_id: int,
    update: OrderPaymentUpdate,
    db: Session = Depends(get_db),
):
    """Update payment status and method."""
    order = crud.update_order_payment(
        db, order_id, update.payment_status, update.payment_method
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}/shipping", response_model=OrderResponse)
def update_order_shipping(
    order_id: int,
    update: OrderShippingUpdate,
    db: Session = Depends(get_db),
):
    """Update shipping info."""
    order = crud.update_order_shipping(
        db, order_id, update.shipping_agency, update.shipping_number
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """Delete an order. Only Draft orders can be deleted."""
    if not crud.delete_order(db, order_id):
        raise HTTPException(
            status_code=400,
            detail="Order not found or cannot be deleted (only Draft orders can be deleted)",
        )


# CSV Export endpoints
@router.get("/export/orders")
def export_orders_csv(db: Session = Depends(get_db)):
    """Export all orders as CSV."""
    orders = crud.get_all_orders_for_export(db)

    output = StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "order_number",
        "customer_name",
        "customer_phone",
        "channel",
        "sold_by",
        "status",
        "payment_status",
        "payment_method",
        "order_date",
        "due_date",
        "total_amount",
        "total_cost",
        "total_margin",
        "notes",
        "created_at",
    ])

    # Data
    for order in orders:
        writer.writerow([
            order.order_number,
            order.customer.name,
            order.customer.phone or "",
            order.channel or "",
            order.sold_by or "",
            order.status,
            order.payment_status,
            order.payment_method or "",
            order.order_date.isoformat() if order.order_date else "",
            order.due_date.isoformat() if order.due_date else "",
            order.total_amount,
            order.total_cost,
            order.total_margin,
            order.notes or "",
            order.created_at.isoformat() if order.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@router.get("/export/order-items")
def export_order_items_csv(db: Session = Depends(get_db)):
    """Export all order items as CSV."""
    items = crud.get_all_order_items_for_export(db)

    output = StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "order_number",
        "customer_name",
        "product_name",
        "product_variant",
        "quantity",
        "unit_price",
        "unit_cost",
        "discount_amount",
        "line_total",
        "line_cost",
        "line_margin",
        "created_at",
    ])

    # Data
    for item in items:
        writer.writerow([
            item.order_number,
            item.customer_name,
            item.product_name,
            item.product_variant or "",
            item.quantity,
            item.unit_price,
            item.unit_cost,
            item.discount_amount,
            item.line_total,
            item.line_cost,
            item.line_margin,
            item.created_at.isoformat() if item.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=order-items.csv"},
    )
