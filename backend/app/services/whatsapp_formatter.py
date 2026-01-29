"""WhatsApp receipt text generator for orders."""

from app.models.order import Order


def format_whatsapp_receipt(order: Order) -> str:
    """
    Generate WhatsApp-ready receipt text for an order.

    Format includes:
    - Greeting with customer name
    - Order items with quantities and prices
    - Total amount
    - Bank transfer details with reference
    - Due date if set
    """
    # Format line items
    items_lines = []
    for item in order.items:
        # Convert price to "k" format (e.g., 35000 -> 35k)
        price_k = item.unit_price / 1000

        # Build product description
        product_desc = item.product_name
        if item.product_variant:
            product_desc += f" ({item.product_variant})"

        items_lines.append(f"* {item.quantity}x {product_desc} @ {price_k:.0f}k")

    items_text = "\n".join(items_lines)

    # Format total with thousands separator
    total_formatted = f"{order.total_amount:,.0f}".replace(",", ".")

    # Format due date
    due_date_line = ""
    if order.due_date:
        due_date_str = order.due_date.strftime("%a, %d %b")
        due_date_line = f"\nReady by: {due_date_str}"

    # Build the complete message
    message = f"""Halo {order.customer.name}! 👋
Thank you for ordering with Frollie Labs.

Here is your order summary:
{items_text}

Total: IDR {total_formatted}

Please transfer to:
BCA
PT Malo Group Bahagia
6044830994

Reference: {order.order_number} - {order.customer.name}{due_date_line}
Thank you! 🍪"""

    return message
