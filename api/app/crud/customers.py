"""Customer CRUD operations."""

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.customer import Customer
from app.models.order import Order
from app.schemas.customer import CustomerCreate, CustomerUpdate


def get_customers(
    db: Session, query: str | None = None, skip: int = 0, limit: int = 100
) -> list[tuple[Customer, int]]:
    """
    List customers with order count.
    Optionally filter by name or phone search query.
    """
    base_query = (
        db.query(Customer, func.count(Order.id).label("order_count"))
        .outerjoin(Order, Customer.id == Order.customer_id)
        .group_by(Customer.id)
    )

    if query:
        search = f"%{query}%"
        base_query = base_query.filter(
            (Customer.name.ilike(search)) | (Customer.phone.ilike(search))
        )

    return (
        base_query.order_by(Customer.name.asc()).offset(skip).limit(limit).all()
    )


def get_customer(db: Session, customer_id: int) -> Customer | None:
    """Get a single customer by ID."""
    return db.query(Customer).filter(Customer.id == customer_id).first()


def get_customer_by_phone(db: Session, phone: str) -> Customer | None:
    """Get a customer by phone number."""
    return db.query(Customer).filter(Customer.phone == phone).first()


def create_customer(db: Session, customer: CustomerCreate) -> Customer:
    """Create a new customer."""
    db_customer = Customer(
        name=customer.name,
        phone=customer.phone,
        source=customer.source,
        notes=customer.notes,
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer


def update_customer(
    db: Session, customer_id: int, customer: CustomerUpdate
) -> Customer | None:
    """Update an existing customer."""
    db_customer = get_customer(db, customer_id)
    if not db_customer:
        return None

    update_data = customer.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_customer, field, value)

    db.commit()
    db.refresh(db_customer)
    return db_customer


def delete_customer(db: Session, customer_id: int) -> bool:
    """Delete a customer. Returns False if not found or has orders."""
    db_customer = get_customer(db, customer_id)
    if not db_customer:
        return False

    # Check if customer has orders
    order_count = db.query(Order).filter(Order.customer_id == customer_id).count()
    if order_count > 0:
        return False

    db.delete(db_customer)
    db.commit()
    return True
