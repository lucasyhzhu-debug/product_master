from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.menu_product import MenuProductResponse
from ..crud import menu_products as crud

router = APIRouter(
    prefix="/menu-products",
    tags=["menu-products"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=list[MenuProductResponse])
def read_menu_products(active_only: bool = True, db: Session = Depends(get_db)):
    return crud.get_menu_products(db, active_only=active_only)
