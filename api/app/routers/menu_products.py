from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.menu_product import MenuProductResponse, MenuProductCreate
from ..crud import menu_products as crud

router = APIRouter(
    prefix="/api/menu-products",
    tags=["menu-products"],
    responses={404: {"description": "Not found"}},
)


@router.get("/", response_model=list[MenuProductResponse])
def read_menu_products(active_only: bool = True, db: Session = Depends(get_db)):
    return crud.get_menu_products(db, active_only=active_only)


@router.post("/", response_model=MenuProductResponse)
def create_menu_product(data: MenuProductCreate, db: Session = Depends(get_db)):
    """Create a custom menu product (used when adding new products from order form)"""
    # Check if product with same name exists
    existing = crud.get_menu_product_by_name(db, data.name)
    if existing:
        raise HTTPException(status_code=400, detail="Product with this name already exists")
    return crud.create_menu_product(db, data)
