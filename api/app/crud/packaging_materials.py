from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.packaging_material import PackagingMaterial
from app.schemas.packaging_material import PackagingMaterialCreate, PackagingMaterialUpdate


def get_packaging_materials(db: Session, skip: int = 0, limit: int = 100) -> list[PackagingMaterial]:
    return db.query(PackagingMaterial).offset(skip).limit(limit).all()


def get_packaging_material(db: Session, material_id: int) -> PackagingMaterial | None:
    return db.query(PackagingMaterial).filter(PackagingMaterial.id == material_id).first()


def search_packaging_materials(db: Session, query: str, limit: int = 20) -> list[PackagingMaterial]:
    search_pattern = f"%{query}%"
    return (
        db.query(PackagingMaterial)
        .filter(
            or_(
                PackagingMaterial.name.ilike(search_pattern),
                PackagingMaterial.brand.ilike(search_pattern),
            )
        )
        .limit(limit)
        .all()
    )


def create_packaging_material(db: Session, material: PackagingMaterialCreate) -> PackagingMaterial:
    db_material = PackagingMaterial(**material.model_dump())
    db.add(db_material)
    db.commit()
    db.refresh(db_material)
    return db_material


def update_packaging_material(
    db: Session, material_id: int, material: PackagingMaterialUpdate
) -> PackagingMaterial | None:
    db_material = get_packaging_material(db, material_id)
    if not db_material:
        return None

    update_data = material.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_material, field, value)

    db.commit()
    db.refresh(db_material)
    return db_material


def delete_packaging_material(db: Session, material_id: int) -> bool:
    db_material = get_packaging_material(db, material_id)
    if not db_material:
        return False

    db.delete(db_material)
    db.commit()
    return True
