"""Customer API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerSummary,
)
from app.crud import customers as crud

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("", response_model=list[CustomerSummary])
def list_customers(
    q: str | None = Query(None, description="Search by name or phone"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List customers with order counts. Optionally search by name or phone."""
    results = crud.get_customers(db, query=q, skip=skip, limit=limit)
    return [
        CustomerSummary(
            id=customer.id,
            name=customer.name,
            phone=customer.phone,
            source=customer.source,
            order_count=order_count,
        )
        for customer, order_count in results
    ]


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get a single customer by ID."""
    customer = crud.get_customer(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    """Create a new customer."""
    return crud.create_customer(db, customer)


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int, customer: CustomerUpdate, db: Session = Depends(get_db)
):
    """Update an existing customer."""
    db_customer = crud.update_customer(db, customer_id, customer)
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return db_customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """Delete a customer. Only customers without orders can be deleted."""
    if not crud.delete_customer(db, customer_id):
        raise HTTPException(
            status_code=400,
            detail="Customer not found or has existing orders",
        )
