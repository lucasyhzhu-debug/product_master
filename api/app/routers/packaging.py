from typing import Union
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.packaging import (
    PackagingRecipeCreate,
    PackagingRecipeResponse,
    PackagingRecipeSummary,
    PackagingVersionDetail,
    PackagingVersionCreate,
    PackagingVersionCopyCreate,
    PackagingComponentResponse,
    PackagingComponentMaterialResponse,
)
from app.schemas.packaging_material import PackagingMaterialResponse
from app.crud import packaging as crud
from app.crud.products import get_products_using_packaging
from app.services.cost_calculator import (
    get_packaging_version_cost,
    get_packaging_component_cost,
    get_material_line_cost,
)

router = APIRouter(prefix="/api/packaging", tags=["packaging"])


def _build_version_detail(version, db: Session) -> PackagingVersionDetail:
    """Build a detailed version response with cost calculations."""
    components_data = []
    for comp in version.components:
        materials_data = []
        for pcm in comp.materials:
            mat_cost = get_material_line_cost(pcm)
            materials_data.append(
                PackagingComponentMaterialResponse(
                    id=pcm.id,
                    packaging_material_id=pcm.packaging_material_id,
                    sort_order=pcm.sort_order,
                    unit=pcm.unit,
                    quantity=pcm.quantity,
                    material=PackagingMaterialResponse.model_validate(pcm.material),
                    cost=mat_cost,
                )
            )

        comp_cost = get_packaging_component_cost(comp)
        components_data.append(
            PackagingComponentResponse(
                id=comp.id,
                sort_order=comp.sort_order,
                component_name=comp.component_name,
                materials=materials_data,
                subtotal_cost=comp_cost,
            )
        )

    total_cost = get_packaging_version_cost(version.id, db)

    return PackagingVersionDetail(
        id=version.id,
        packaging_recipe_id=version.packaging_recipe_id,
        version_number=version.version_number,
        version_name=version.version_name,
        description=version.description,
        copied_from_version_id=version.copied_from_version_id,
        created_at=version.created_at,
        created_by=version.created_by,
        components=components_data,
        total_cost=total_cost,
    )


@router.get("", response_model=list[PackagingRecipeSummary])
def list_packaging_recipes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all packaging recipes with summary information."""
    recipes = crud.get_packaging_recipes(db, skip, limit)
    result = []
    for recipe in recipes:
        if recipe.versions:
            latest = max(recipe.versions, key=lambda v: v.version_number)
            total_cost = get_packaging_version_cost(latest.id, db)
            result.append(
                PackagingRecipeSummary(
                    id=recipe.id,
                    name=recipe.name,
                    tags=[t.name for t in recipe.tags],
                    latest_version=latest.version_number,
                    latest_version_name=latest.version_name,
                    total_cost=total_cost,
                    created_at=recipe.created_at,
                )
            )
    return result


@router.get("/{packaging_id}", response_model=PackagingRecipeResponse)
def get_packaging_recipe(packaging_id: int, db: Session = Depends(get_db)):
    """Get a packaging recipe with all its versions."""
    recipe = crud.get_packaging_recipe(db, packaging_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Packaging recipe not found")
    return recipe


@router.get("/{packaging_id}/versions/{version_number}", response_model=PackagingVersionDetail)
def get_packaging_version(
    packaging_id: int, version_number: int, db: Session = Depends(get_db)
):
    """Get a specific packaging version with full details."""
    version = crud.get_packaging_version_by_number(db, packaging_id, version_number)
    if not version:
        raise HTTPException(status_code=404, detail="Packaging version not found")
    return _build_version_detail(version, db)


@router.get("/{packaging_id}/usage", response_model=list[dict])
def get_packaging_usage(packaging_id: int, db: Session = Depends(get_db)):
    """Get products using any version of this packaging."""
    return get_products_using_packaging(db, packaging_id)


@router.post("", response_model=PackagingRecipeResponse, status_code=201)
def create_packaging_recipe(
    packaging: PackagingRecipeCreate, db: Session = Depends(get_db)
):
    """Create a new packaging recipe with its first version."""
    if not packaging.first_version.components:
        raise HTTPException(
            status_code=400, detail="Packaging must have at least one component"
        )

    for comp in packaging.first_version.components:
        if not comp.materials:
            raise HTTPException(
                status_code=400,
                detail=f"Component '{comp.component_name}' must have at least one material",
            )

    return crud.create_packaging_recipe(db, packaging)


@router.post(
    "/{packaging_id}/versions", response_model=PackagingVersionDetail, status_code=201
)
def create_version(
    packaging_id: int,
    version: Union[PackagingVersionCreate, PackagingVersionCopyCreate],
    db: Session = Depends(get_db),
):
    """Create a new version - either by copying from an existing version or from scratch."""
    if isinstance(version, PackagingVersionCopyCreate):
        # Copy from existing version
        new_version = crud.create_packaging_version(db, packaging_id, version)
    else:
        # Create new version with components
        new_version = crud.create_packaging_version_new(db, packaging_id, version)

    if not new_version:
        raise HTTPException(
            status_code=400,
            detail="Could not create version. Check packaging and source version IDs.",
        )
    return _build_version_detail(new_version, db)


@router.put("/{packaging_id}/tags", response_model=PackagingRecipeResponse)
def update_tags(packaging_id: int, tag_ids: list[int], db: Session = Depends(get_db)):
    """Update the tags for a packaging recipe."""
    recipe = crud.update_packaging_tags(db, packaging_id, tag_ids)
    if not recipe:
        raise HTTPException(status_code=404, detail="Packaging recipe not found")
    return recipe


@router.delete("/{packaging_id}", status_code=204)
def delete_packaging_recipe(packaging_id: int, db: Session = Depends(get_db)):
    """Delete a packaging recipe. Blocked if used in any products."""
    products = get_products_using_packaging(db, packaging_id)
    if products:
        product_names = [p["product_name"] for p in products]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete packaging. Used in products: {', '.join(product_names)}",
        )

    if not crud.delete_packaging_recipe(db, packaging_id):
        raise HTTPException(status_code=404, detail="Packaging recipe not found")
