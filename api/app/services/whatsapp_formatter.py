"""WhatsApp receipt text generator for orders.

Provides contextual WhatsApp templates for different order stages:
- Payment request (Draft → Confirmed transition)
- Order receipt (general order summary)
- Production started notification
- Delivery complete confirmation
- Shipping confirmation
- Pickup ready notification
"""

from app.models.order import Order


def format_payment_request(order: Order) -> str:
    """
    Generate WhatsApp payment request for Draft → Confirmed transition.

    Used when order manager sends the initial order confirmation to customer
    requesting payment before production starts.
    """
    # Items summary
    items_lines = []
    for item in order.items:
        price_k = item.unit_price / 1000
        desc = item.product_name
        if item.product_variant:
            desc += f" ({item.product_variant})"
        line = f"• {item.quantity}x {desc} @ {price_k:.0f}k"
        items_lines.append(line)
    items_text = "\n".join(items_lines)

    # Total
    total_formatted = f"IDR {order.total_amount:,.0f}".replace(",", ".")

    # Due date
    due_date_str = ""
    if order.due_date:
        due_date_str = order.due_date.strftime("%d %b %Y")

    # Delivery info
    delivery_info = ""
    if order.delivery_type == "Pickup":
        location = order.pickup_location or "Goldfinch Legato"
        delivery_info = f"📍 Pickup at: {location}"
    elif order.delivery_type == "Delivery" and order.delivery_address:
        delivery_info = f"📍 Delivery to: {order.delivery_address}"

    return f"""Halo {order.customer.name}! 👋

Terima kasih sudah order di Malo! 🙏

*Order #{order.order_number}*
{items_text}
────────────
*Total: {total_formatted}*

{delivery_info}
📅 Target: {due_date_str}

Silakan transfer ke:
*BCA*
*PT Malo Group Bahagia*
*6044830994*

Setelah transfer, mohon kirim bukti pembayaran ya.

Terima kasih! 🙏"""


def format_production_started(order: Order) -> str:
    """
    Generate WhatsApp notification when production starts.

    Used after Confirmed status, when kitchen begins working on the order.
    """
    return f"""Halo {order.customer.name}! 👋

Order kamu #{order.order_number} sudah mulai diproses! 🍳

Kami akan kabari lagi kalau sudah siap ya.

Terima kasih sudah sabar menunggu! 🙏"""


def format_delivery_complete(order: Order) -> str:
    """
    Generate WhatsApp notification when delivery is complete.

    Used when order status changes to CompleteShipped.
    """
    return f"""Halo {order.customer.name}! 👋

Order #{order.order_number} sudah sampai ya! 📦✅

Semoga suka dengan pesanannya! 😊

Jangan lupa kasih review atau feedback ya, sangat membantu kami untuk terus berkembang.

Terima kasih sudah order di Malo! 🙏
Sampai jumpa di order berikutnya! 👋"""


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
        "Draft": "[Draft]",
        "Confirmed": "[Confirmed]",
        "Processing": "[Cooking]",
        "Ready for Pickup": "[Ready]",
        "Waiting for Courier": "[Box]",
        "In Transit": "[Transit]",
        "Shipped": "[Shipped]",
        "Completed": "[Done]",
        "Cancelled": "[Cancelled]"
    }.get(order.status, "[Order]")

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
        line = f"- {item.quantity}x {desc}"
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
        notes_section = f"\n\nNotes:\n{order.notes}"

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
{footer}"""


def format_whatsapp_shipping(order: Order) -> str:
    """Format shipping confirmation message."""
    return f"""Halo {order.customer.name}!

Your order {order.order_number} is on the way!

Tracking: {order.shipping_number or "-"}
Via: {order.shipping_agency or "-"}

{order.delivery_address or ""}

Thank you for ordering!"""


def format_whatsapp_pickup(order: Order) -> str:
    """Format pickup ready message."""
    location = order.pickup_location or "Goldfinch Legato"
    return f"""Halo {order.customer.name}!

Your order {order.order_number} is ready for pickup!

Location: {location}

See you soon!"""
