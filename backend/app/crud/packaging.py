from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.models.packaging import (
    PackagingRecipe,
    PackagingVersion,
    PackagingComponent,
    PackagingComponentMaterial,
    PackagingTag,
)
from app.models.tag import Tag
from app.schemas.packaging import (
    PackagingRecipeCreate,
    PackagingVersionCreate,
    PackagingVersionCopyCreate,
)


def get_packaging_recipes(db: Session, skip: int = 0, limit: int = 100) -> list[PackagingRecipe]:
    return (
        db.query(PackagingRecipe)
        .options(joinedload(PackagingRecipe.versions), joinedload(PackagingRecipe.tags))
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_packaging_recipe(db: Session, packaging_id: int) -> PackagingRecipe | None:
    return (
        db.query(PackagingRecipe)
        .options(joinedload(PackagingRecipe.versions), joinedload(PackagingRecipe.tags))
        .filter(PackagingRecipe.id == packaging_id)
        .first()
    )


def get_packaging_version(db: Session, version_id: int) -> PackagingVersion | None:
    return (
        db.query(PackagingVersion)
        .options(
            joinedload(PackagingVersion.components)
            .joinedload(PackagingComponent.materials)
            .joinedload(PackagingComponentMaterial.material)
        )
        .filter(PackagingVersion.id == version_id)
        .first()
    )


def get_packaging_version_by_number(
    db: Session, packaging_id: int, version_number: int
) -> PackagingVersion | None:
    return (
        db.query(PackagingVersion)
        .options(
            joinedload(PackagingVersion.components)
            .joinedload(PackagingComponent.materials)
            .joinedload(PackagingComponentMaterial.material)
        )
        .filter(
            PackagingVersion.packaging_recipe_id == packaging_id,
            PackagingVersion.version_number == version_number,
        )
        .first()
    )


def create_packaging_recipe(db: Session, packaging: PackagingRecipeCreate) -> PackagingRecipe:
    # Create the packaging recipe
    db_packaging = PackagingRecipe(name=packaging.name)
    db.add(db_packaging)
    db.flush()

    # Add tags
    if packaging.tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_(packaging.tag_ids)).all()
        db_packaging.tags = tags

    # Create first version
    _create_version_with_components(
        db,
        packaging_id=db_packaging.id,
        version_number=1,
        version_data=packaging.first_version,
        copied_from_version_id=None,
    )

    db.commit()
    db.refresh(db_packaging)
    return db_packaging


def create_packaging_version(
    db: Session, packaging_id: int, version_data: PackagingVersionCopyCreate
) -> PackagingVersion | None:
    """Create a new version by copying from an existing version."""
    packaging = get_packaging_recipe(db, packaging_id)
    if not packaging:
        return None

    source_version = get_packaging_version(db, version_data.copy_from_version_id)
    if not source_version or source_version.packaging_recipe_id != packaging_id:
        return None

    # Get next version number
    max_version = (
        db.query(func.max(PackagingVersion.version_number))
        .filter(PackagingVersion.packaging_recipe_id == packaging_id)
        .scalar()
    ) or 0

    # Create new version with copied components
    new_version = PackagingVersion(
        packaging_recipe_id=packaging_id,
        version_number=max_version + 1,
        version_name=version_data.version_name,
        description=version_data.description,
        copied_from_version_id=version_data.copy_from_version_id,
    )
    db.add(new_version)
    db.flush()

    # Deep copy components and materials
    for src_comp in source_version.components:
        new_comp = PackagingComponent(
            packaging_version_id=new_version.id,
            sort_order=src_comp.sort_order,
            component_name=src_comp.component_name,
        )
        db.add(new_comp)
        db.flush()

        for src_mat in src_comp.materials:
            new_mat = PackagingComponentMaterial(
                packaging_component_id=new_comp.id,
                packaging_material_id=src_mat.packaging_material_id,
                sort_order=src_mat.sort_order,
                unit=src_mat.unit,
                quantity=src_mat.quantity,
            )
            db.add(new_mat)

    db.commit()
    db.refresh(new_version)
    return new_version


def create_packaging_version_new(
    db: Session, packaging_id: int, version_data: PackagingVersionCreate
) -> PackagingVersion | None:
    """Create a completely new version with provided components."""
    packaging = get_packaging_recipe(db, packaging_id)
    if not packaging:
        return None

    # Get next version number
    max_version = (
        db.query(func.max(PackagingVersion.version_number))
        .filter(PackagingVersion.packaging_recipe_id == packaging_id)
        .scalar()
    ) or 0

    return _create_version_with_components(
        db,
        packaging_id=packaging_id,
        version_number=max_version + 1,
        version_data=version_data,
        copied_from_version_id=None,
    )


def _create_version_with_components(
    db: Session,
    packaging_id: int,
    version_number: int,
    version_data: PackagingVersionCreate,
    copied_from_version_id: int | None,
) -> PackagingVersion:
    """Helper to create a version with its components."""
    new_version = PackagingVersion(
        packaging_recipe_id=packaging_id,
        version_number=version_number,
        version_name=version_data.version_name,
        description=version_data.description,
        copied_from_version_id=copied_from_version_id,
    )
    db.add(new_version)
    db.flush()

    for comp_data in version_data.components:
        new_comp = PackagingComponent(
            packaging_version_id=new_version.id,
            sort_order=comp_data.sort_order,
            component_name=comp_data.component_name,
        )
        db.add(new_comp)
        db.flush()

        for mat_data in comp_data.materials:
            new_mat = PackagingComponentMaterial(
                packaging_component_id=new_comp.id,
                packaging_material_id=mat_data.packaging_material_id,
                sort_order=mat_data.sort_order,
                unit=mat_data.unit,
                quantity=mat_data.quantity,
            )
            db.add(new_mat)

    db.commit()
    db.refresh(new_version)
    return new_version


def update_packaging_tags(db: Session, packaging_id: int, tag_ids: list[int]) -> PackagingRecipe | None:
    packaging = get_packaging_recipe(db, packaging_id)
    if not packaging:
        return None

    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    packaging.tags = tags
    db.commit()
    db.refresh(packaging)
    return packaging


def delete_packaging_recipe(db: Session, packaging_id: int) -> bool:
    packaging = get_packaging_recipe(db, packaging_id)
    if not packaging:
        return False

    db.delete(packaging)
    db.commit()
    return True
