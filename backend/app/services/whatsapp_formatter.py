"""WhatsApp receipt text generator for orders."""

from app.models.order import Order


def format_whatsapp_receipt(order: Order) -> str:
    """
    Generate WhatsApp-ready receipt text for an order.
    
    Format includes:
    - Order Number & Status
    - Customer Info
    - Items & Totals
    - Payment & Delivery Details
    """
    # Header
    status_emoji = {
        "Draft": "📝",
        "Confirmed": "✅",
        "Processing": "👨‍🍳",
        "Ready for Pickup": "🥡",
        "Shipped": "🚚",
        "Completed": "🎉",
        "Cancelled": "❌"
    }.get(order.status, "📋")

    header = f"{status_emoji} *Order {order.order_number}* {status_emoji}"
    if order.status == "Draft":
        header += " (Draft)"
    
    # Customer Line
    customer_line = f"Customer: {order.customer.name}"
    if order.channel:
        customer_line += f" ({order.channel})"

    # Items
    items_lines = []
    for item in order.items:
        # 35000 -> 35k
        price_k = item.unit_price / 1000
        total_k = item.line_total / 1000
        
        desc = item.product_name
        if item.product_variant:
            desc += f" ({item.product_variant})"
            
        # Format: 2x Product Name @ 35k = 70k
        line = f"▪️ {item.quantity}x {desc}"
        if item.quantity > 1:
            line += f" @ {price_k:.0f}k"
        items_lines.append(line)
        
    items_text = "\n".join(items_lines)

    # Financials
    total_formatted = f"IDR {order.total_amount:,.0f}".replace(",", ".")
    
    payment_info = f"Payment: {order.payment_status}"
    if order.payment_method:
        payment_info += f" ({order.payment_method})"

    # Delivery / Pickup
    delivery_line = f"Type: {order.delivery_type}"
    if order.delivery_type == "Pickup" and order.pickup_location:
         delivery_line += f" @ {order.pickup_location}"
    elif order.delivery_type == "Delivery" and order.delivery_address:
        delivery_line += f"\nAddress: {order.delivery_address}"
        
    if order.shipping_agency:
        delivery_line += f"\nShipping: {order.shipping_agency}"
        if order.shipping_number:
            delivery_line += f" ({order.shipping_number})"

    # Due Date
    due_date_line = ""
    if order.due_date:
        due_date_str = order.due_date.strftime("%d %b %Y, %H:%M")
        due_date_line = f"\nDue: {due_date_str}"
        
    # Notes
    notes_section = ""
    if order.notes:
        notes_section = f"\n\n📝 Notes:\n{order.notes}"

    # Footer
    footer = """
Please transfer to:
BCA
PT Malo Group Bahagia
6044830994"""

    return f"""{header}

{customer_line}
{items_text}
----------------
*Total: {total_formatted}*

{payment_info}
{delivery_line}{due_date_line}{notes_section}
{footer}

Thank you! 🍪"""
