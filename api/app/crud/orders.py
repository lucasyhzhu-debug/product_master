"""Order CRUD operations."""

from datetime import date, datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, distinct

from app.models.order import Order, OrderItem
from app.models.customer import Customer
from app.schemas.order import OrderCreate, OrderItemCreate
from app.schemas.customer import CustomerCreate
from app.crud.customers import create_customer


def generate_order_number(db: Session) -> str:
    """
    Generate order number in format MMDD-NNN.
    Example: 0129-001 for January 29th, order #1
    """
    today = date.today()
    date_prefix = today.strftime("%m%d")
    prefix = f"{date_prefix}-"

    # Count today's orders
    count = (
        db.query(Order)
        .filter(Order.order_number.like(f"{prefix}%"))
        .count()
    )

    return f"{prefix}{(count + 1):03d}"


def create_order(db: Session, order_data: OrderCreate) -> Order:
    """Create a new order with line items."""
    # Handle customer (existing or new)
    if order_data.customer_id:
        customer_id = order_data.customer_id
    elif order_data.new_customer:
        customer = create_customer(db, order_data.new_customer)
        customer_id = customer.id
    else:
        raise ValueError("Either customer_id or new_customer is required")

    # Create order
    order = Order(
        order_number=generate_order_number(db),
        customer_id=customer_id,
        channel=order_data.channel,
        sold_by=order_data.sold_by,
        due_date=order_data.due_date,
        notes=order_data.notes,
        status="Draft",
        payment_status="Unpaid",
        
        # New fields
        delivery_type=order_data.delivery_type,
        pickup_location=order_data.pickup_location,
        delivery_address=order_data.delivery_address,
        contact_wa=order_data.contact_wa,
        contact_ig=order_data.contact_ig,
        shipping_agency=order_data.shipping_agency,
        shipping_number=order_data.shipping_number,
    )
    db.add(order)
    db.flush()

    # Create line items and calculate totals
    total_amount = 0.0
    total_cost = 0.0

    for item_data in order_data.items:
        # Line total = Qty × (Unit Price - Discount per Unit)
        discounted_unit_price = item_data.unit_price - item_data.discount_amount
        line_total = item_data.quantity * discounted_unit_price
        line_cost = item_data.quantity * item_data.unit_cost
        line_margin = line_total - line_cost

        order_item = OrderItem(
            order_id=order.id,
            product_name=item_data.product_name,
            product_variant=item_data.product_variant,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            unit_cost=item_data.unit_cost,
            discount_amount=item_data.discount_amount,
            line_total=line_total,
            line_cost=line_cost,
            line_margin=line_margin,
            menu_product_id=item_data.menu_product_id,
        )
        db.add(order_item)

        total_amount += line_total
        total_cost += line_cost

    # Update order totals
    order.total_amount = total_amount
    order.total_cost = total_cost
    order.total_margin = total_amount - total_cost

    db.commit()
    db.refresh(order)
    return order


def get_orders(
    db: Session,
    status: str | None = None,
    channel: str | None = None,
    due_date_from: datetime | None = None,
    due_date_to: datetime | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Order]:
    """List orders with optional filters."""
    query = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items),
    )

    if status:
        query = query.filter(Order.status == status)
    if channel:
        query = query.filter(Order.channel == channel)
    if due_date_from:
        query = query.filter(Order.due_date >= due_date_from)
    if due_date_to:
        query = query.filter(Order.due_date <= due_date_to)

    return (
        query.order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_order(db: Session, order_id: int) -> Order | None:
    """Get a single order with all relationships."""
    return (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items),
        )
        .filter(Order.id == order_id)
        .first()
    )


def get_order_by_number(db: Session, order_number: str) -> Order | None:
    """Get an order by its order number."""
    return (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items),
        )
        .filter(Order.order_number == order_number)
        .first()
    )


def update_order_status(
    db: Session, order_id: int, status: str, cancellation_reason: str | None = None
) -> Order | None:
    """Update order status."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return None

    order.status = status

    # Set awaiting_payment_since when entering AwaitingPayment status
    if status == "AwaitingPayment":
        order.awaiting_payment_since = datetime.now()
    elif status != "AwaitingPayment":
        # Clear timestamp when leaving AwaitingPayment
        order.awaiting_payment_since = None

    if status == "Cancelled" and cancellation_reason:
        order.cancellation_reason = cancellation_reason

    db.commit()
    db.refresh(order)
    return order


def update_order_payment(
    db: Session, order_id: int, payment_status: str, payment_method: str | None = None
) -> Order | None:
    """Update order payment status and method."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return None

    order.payment_status = payment_status
    if payment_method is not None:
        order.payment_method = payment_method
    db.commit()
    db.refresh(order)
    return order


def update_order_shipping(
    db: Session, order_id: int, shipping_agency: str | None, shipping_number: str | None
) -> Order | None:
    """Update order shipping info."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return None

    order.shipping_agency = shipping_agency
    order.shipping_number = shipping_number
    db.commit()
    db.refresh(order)
    return order


def delete_order(db: Session, order_id: int) -> bool:
    """Delete an order. Only Draft orders can be deleted."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return False

    if order.status != "Draft":
        return False

    db.delete(order)
    db.commit()
    return True


def get_product_suggestions(db: Session, query: str | None = None) -> list[dict]:
    """
    Get distinct product names from order history for autocomplete.
    Returns product with last used price/cost and usage count.
    """
    # Subquery to get latest order item for each product
    subquery = (
        db.query(
            OrderItem.product_name,
            OrderItem.product_variant,
            func.max(OrderItem.id).label("latest_id"),
            func.count(OrderItem.id).label("usage_count"),
        )
        .group_by(OrderItem.product_name, OrderItem.product_variant)
    )

    if query:
        search = f"%{query}%"
        subquery = subquery.filter(OrderItem.product_name.ilike(search))

    subquery = subquery.subquery()

    # Join to get the actual price/cost from latest item
    results = (
        db.query(
            OrderItem.product_name,
            OrderItem.product_variant,
            OrderItem.unit_price,
            OrderItem.unit_cost,
            subquery.c.usage_count,
        )
        .join(subquery, OrderItem.id == subquery.c.latest_id)
        .order_by(subquery.c.usage_count.desc())
        .limit(20)
        .all()
    )

    return [
        {
            "product_name": r.product_name,
            "product_variant": r.product_variant,
            "last_unit_price": r.unit_price,
            "last_unit_cost": r.unit_cost,
            "usage_count": r.usage_count,
        }
        for r in results
    ]


def get_seller_suggestions(db: Session, query: str | None = None) -> list[dict]:
    """Get distinct sold_by values from order history for autocomplete."""
    base_query = (
        db.query(
            Order.sold_by,
            func.count(Order.id).label("order_count"),
        )
        .filter(Order.sold_by.isnot(None))
        .filter(Order.sold_by != "")
        .group_by(Order.sold_by)
    )

    if query:
        search = f"%{query}%"
        base_query = base_query.filter(Order.sold_by.ilike(search))

    results = (
        base_query.order_by(func.count(Order.id).desc())
        .limit(20)
        .all()
    )

    return [
        {
            "sold_by": r.sold_by,
            "order_count": r.order_count,
        }
        for r in results
    ]


def get_all_orders_for_export(db: Session) -> list[Order]:
    """Get all orders for CSV export."""
    return (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items),
        )
        .order_by(Order.created_at.desc())
        .all()
    )


def get_all_order_items_for_export(db: Session) -> list[tuple]:
    """Get all order items with order info for CSV export."""
    return (
        db.query(
            Order.order_number,
            Customer.name.label("customer_name"),
            OrderItem.product_name,
            OrderItem.product_variant,
            OrderItem.quantity,
            OrderItem.unit_price,
            OrderItem.unit_cost,
            OrderItem.discount_amount,
            OrderItem.line_total,
            OrderItem.line_cost,
            OrderItem.line_margin,
            OrderItem.created_at,
        )
        .join(Customer, Order.customer_id == Customer.id)
        .order_by(Order.created_at.desc(), OrderItem.id.asc())
        .all()
    )


def get_kitchen_orders(
    db: Session,
    target_date: date | None = None,
) -> list[Order]:
    """
    Get orders for Kitchen View.

    Only shows orders in production-relevant statuses:
    - Confirmed (ready to produce)
    - ProductionComplete (done, ready for packaging)
    - Packaging (actively being packaged)
    - WaitingShipment (ready for courier)
    - WaitingPickup (ready for customer pickup)

    Filters by due_date (includes overdue orders if target_date is today).
    """
    kitchen_statuses = [
        "Confirmed",
        "ProductionComplete",
        "Packaging",
        "WaitingShipment",
        "WaitingPickup",
    ]

    query = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items),
        )
        .filter(Order.status.in_(kitchen_statuses))
    )

    if target_date:
        # Include orders due on target_date OR overdue (due before target_date)
        query = query.filter(Order.due_date <= datetime.combine(target_date, datetime.max.time()))

    return query.order_by(Order.due_date.asc(), Order.created_at.asc()).all()


def get_order_stats(db: Session) -> dict:
    """
    Get order statistics for dashboard.

    Returns metrics for:
    - Today's revenue, order count, margin
    - Yesterday's revenue for comparison
    - Orders needing attention (overdue, awaiting payment >24h, due today)
    - Production pipeline counts by status
    - Urgent orders list (top 7 most urgent)
    """
    from datetime import timedelta

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    yesterday = today - timedelta(days=1)
    yesterday_start = datetime.combine(yesterday, datetime.min.time())
    yesterday_end = datetime.combine(yesterday, datetime.max.time())

    # Today's stats
    today_orders = (
        db.query(Order)
        .filter(Order.order_date >= today_start)
        .filter(Order.order_date <= today_end)
        .all()
    )

    today_revenue = sum(o.total_amount for o in today_orders)
    today_margin = sum(o.total_margin for o in today_orders)
    today_order_count = len(today_orders)
    today_margin_pct = (today_margin / today_revenue * 100) if today_revenue > 0 else 0
    today_avg_order = today_revenue / today_order_count if today_order_count > 0 else 0

    # Yesterday's stats for comparison
    yesterday_orders = (
        db.query(Order)
        .filter(Order.order_date >= yesterday_start)
        .filter(Order.order_date <= yesterday_end)
        .all()
    )
    yesterday_revenue = sum(o.total_amount for o in yesterday_orders)
    yesterday_order_count = len(yesterday_orders)

    # Terminal statuses (orders that are complete)
    terminal_statuses = ["CompleteShipped", "PickedUp", "Cancelled"]

    # Overdue orders (due_date < today AND not terminal)
    overdue_count = (
        db.query(func.count(Order.id))
        .filter(Order.due_date < today_start)
        .filter(Order.status.notin_(terminal_statuses))
        .scalar() or 0
    )

    # Awaiting payment > 24h
    cutoff = datetime.now() - timedelta(hours=24)

    awaiting_payment_long = (
        db.query(func.count(Order.id))
        .filter(Order.status == "AwaitingPayment")
        .filter(Order.awaiting_payment_since < cutoff)
        .scalar() or 0
    )

    # Due today (not terminal)
    due_today_count = (
        db.query(func.count(Order.id))
        .filter(Order.due_date >= today_start)
        .filter(Order.due_date <= today_end)
        .filter(Order.status.notin_(terminal_statuses))
        .scalar() or 0
    )

    # Production pipeline counts
    pipeline_statuses = ["Confirmed", "ProductionComplete", "Packaging", "WaitingShipment", "WaitingPickup"]
    pipeline_counts = {}
    for status in pipeline_statuses:
        count = (
            db.query(func.count(Order.id))
            .filter(Order.status == status)
            .scalar() or 0
        )
        pipeline_counts[status.lower()] = count

    # Urgent orders (overdue first, then due today, limited to 7)
    urgent_orders_query = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items),
        )
        .filter(Order.status.notin_(terminal_statuses))
        .filter(Order.due_date.isnot(None))
        .filter(Order.due_date <= today_end)
        .order_by(Order.due_date.asc())
        .limit(7)
    )

    urgent_orders = []
    for order in urgent_orders_query.all():
        is_overdue = order.due_date and order.due_date.date() < today if hasattr(order.due_date, 'date') else (order.due_date < today_start if order.due_date else False)
        urgent_orders.append({
            "id": order.id,
            "order_number": order.order_number,
            "customer_name": order.customer.name,
            "customer_phone": order.customer.phone,
            "item_count": len(order.items),
            "status": order.status,
            "due_date": order.due_date.isoformat() if order.due_date else None,
            "is_overdue": is_overdue,
            "total_amount": order.total_amount,
        })

    return {
        "today": {
            "revenue": today_revenue,
            "order_count": today_order_count,
            "margin": today_margin,
            "margin_pct": round(today_margin_pct, 1),
            "avg_order_value": round(today_avg_order, 0),
        },
        "yesterday": {
            "revenue": yesterday_revenue,
            "order_count": yesterday_order_count,
        },
        "needs_attention": {
            "overdue": overdue_count,
            "awaiting_payment_long": awaiting_payment_long,
            "due_today": due_today_count,
        },
        "pipeline": {
            "confirmed": pipeline_counts.get("confirmed", 0),
            "production_complete": pipeline_counts.get("productioncomplete", 0),
            "packaging": pipeline_counts.get("packaging", 0),
            "waiting_shipment": pipeline_counts.get("waitingshipment", 0),
            "waiting_pickup": pipeline_counts.get("waitingpickup", 0),
        },
        "urgent_orders": urgent_orders,
    }
