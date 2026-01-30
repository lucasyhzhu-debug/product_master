from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.packaging_material import (
    PackagingMaterialCreate,
    PackagingMaterialUpdate,
    PackagingMaterialResponse,
    PackagingMaterialWithCost,
)
from app.crud import packaging_materials as crud
from app.services.cost_calculator import get_material_cost_per_base_unit

router = APIRouter(prefix="/api/packaging-materials", tags=["packaging-materials"])


@router.get("", response_model=list[PackagingMaterialWithCost])
def list_packaging_materials(
    skip: int = 0,
    limit: int = 100,
    search: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """List all packaging materials, optionally filtered by search query."""
    if search:
        items = crud.search_packaging_materials(db, search, limit)
    else:
        items = crud.get_packaging_materials(db, skip, limit)

    # Add cost calculations
    result = []
    for item in items:
        cost, base_unit = get_material_cost_per_base_unit(item)
        result.append(
            PackagingMaterialWithCost(
                **PackagingMaterialResponse.model_validate(item).model_dump(),
                cost_per_base_unit=cost,
                base_unit=base_unit,
            )
        )
    return result


@router.get("/{material_id}", response_model=PackagingMaterialWithCost)
def get_packaging_material(material_id: int, db: Session = Depends(get_db)):
    """Get a specific packaging material by ID."""
    item = crud.get_packaging_material(db, material_id)
    if not item:
        raise HTTPException(status_code=404, detail="Packaging material not found")

    cost, base_unit = get_material_cost_per_base_unit(item)
    return PackagingMaterialWithCost(
        **PackagingMaterialResponse.model_validate(item).model_dump(),
        cost_per_base_unit=cost,
        base_unit=base_unit,
    )


@router.post("", response_model=PackagingMaterialWithCost, status_code=201)
def create_packaging_material(
    material: PackagingMaterialCreate, db: Session = Depends(get_db)
):
    """Create a new packaging material."""
    item = crud.create_packaging_material(db, material)
    cost, base_unit = get_material_cost_per_base_unit(item)
    return PackagingMaterialWithCost(
        **PackagingMaterialResponse.model_validate(item).model_dump(),
        cost_per_base_unit=cost,
        base_unit=base_unit,
    )


@router.put("/{material_id}", response_model=PackagingMaterialWithCost)
def update_packaging_material(
    material_id: int,
    material: PackagingMaterialUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing packaging material."""
    item = crud.update_packaging_material(db, material_id, material)
    if not item:
        raise HTTPException(status_code=404, detail="Packaging material not found")

    cost, base_unit = get_material_cost_per_base_unit(item)
    return PackagingMaterialWithCost(
        **PackagingMaterialResponse.model_validate(item).model_dump(),
        cost_per_base_unit=cost,
        base_unit=base_unit,
    )


@router.delete("/{material_id}", status_code=204)
def delete_packaging_material(material_id: int, db: Session = Depends(get_db)):
    """Delete a packaging material."""
    if not crud.delete_packaging_material(db, material_id):
        raise HTTPException(status_code=404, detail="Packaging material not found")
