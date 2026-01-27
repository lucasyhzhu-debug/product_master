from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.product import (
    ProductCreate,
    ProductResponse,
    ProductSummary,
    ProductVersionDetail,
    ProductVersionCopyCreate,
    ProductCOGS,
)
from app.crud import products as crud
from app.services.cost_calculator import get_product_cogs

router = APIRouter(prefix="/api/products", tags=["products"])


def _build_version_detail(version, db: Session) -> ProductVersionDetail:
    """Build a detailed version response with COGS calculations."""
    cogs_data = get_product_cogs(version, db)

    return ProductVersionDetail(
        id=version.id,
        product_id=version.product_id,
        version_number=version.version_number,
        version_name=version.version_name,
        description=version.description,
        recipe_version_id=version.recipe_version_id,
        packaging_version_id=version.packaging_version_id,
        retail_price_idr=version.retail_price_idr,
        num_pieces=version.num_pieces,
        grams_per_piece=version.grams_per_piece,
        copied_from_version_id=version.copied_from_version_id,
        created_at=version.created_at,
        created_by=version.created_by,
        recipe_name=version.recipe_version.recipe.name,
        recipe_version_name=version.recipe_version.version_name,
        packaging_name=version.packaging_version.packaging_recipe.name,
        packaging_version_name=version.packaging_version.version_name,
        cogs=ProductCOGS(**cogs_data),
    )


@router.get("", response_model=list[ProductSummary])
def list_products(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all products with summary information."""
    products = crud.get_products(db, skip, limit)
    result = []
    for product in products:
        if product.versions:
            latest = max(product.versions, key=lambda v: v.version_number)
            # Need to get version with relationships loaded
            full_version = crud.get_product_version(db, latest.id)
            if full_version:
                cogs_data = get_product_cogs(full_version, db)
                result.append(
                    ProductSummary(
                        id=product.id,
                        name=product.name,
                        latest_version=latest.version_number,
                        latest_version_name=latest.version_name,
                        recipe_name=full_version.recipe_version.recipe.name,
                        packaging_name=full_version.packaging_version.packaging_recipe.name,
                        total_cogs=cogs_data["total_cogs"],
                        retail_price_idr=latest.retail_price_idr,
                        contribution_margin_pct=cogs_data["contribution_margin_pct"],
                        created_at=product.created_at,
                        tags=product.tags,
                    )
                )
    return result


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Get a product with all its versions."""
    product = crud.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/versions/{version_number}", response_model=ProductVersionDetail)
def get_product_version(
    product_id: int, version_number: int, db: Session = Depends(get_db)
):
    """Get a specific product version with full details and COGS."""
    version = crud.get_product_version_by_number(db, product_id, version_number)
    if not version:
        raise HTTPException(status_code=404, detail="Product version not found")
    return _build_version_detail(version, db)


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Create a new product with its first version."""
    # Validate recipe version exists
    from app.crud.recipes import get_recipe_version
    recipe_version = get_recipe_version(db, product.first_version.recipe_version_id)
    if not recipe_version:
        raise HTTPException(status_code=400, detail="Invalid recipe version ID")

    # Validate packaging version exists
    from app.crud.packaging import get_packaging_version
    packaging_version = get_packaging_version(db, product.first_version.packaging_version_id)
    if not packaging_version:
        raise HTTPException(status_code=400, detail="Invalid packaging version ID")

    return crud.create_product(db, product)


@router.post("/{product_id}/versions", response_model=ProductVersionDetail, status_code=201)
def create_version(
    product_id: int, version: ProductVersionCopyCreate, db: Session = Depends(get_db)
):
    """Create a new version by copying from an existing version."""
    new_version = crud.create_product_version(db, product_id, version)
    if not new_version:
        raise HTTPException(
            status_code=400,
            detail="Could not create version. Check product and source version IDs.",
        )

    # Reload with relationships
    full_version = crud.get_product_version(db, new_version.id)
    return _build_version_detail(full_version, db)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Delete a product and all its versions."""
    if not crud.delete_product(db, product_id):
        raise HTTPException(status_code=404, detail="Product not found")
