from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.models.product import Product, ProductVersion
from app.models.recipe import RecipeVersion
from app.models.packaging import PackagingVersion
from app.schemas.product import ProductCreate, ProductVersionCreate, ProductVersionCopyCreate


def get_products(db: Session, skip: int = 0, limit: int = 100) -> list[Product]:
    return (
        db.query(Product)
        .options(joinedload(Product.versions))
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_product(db: Session, product_id: int) -> Product | None:
    return (
        db.query(Product)
        .options(joinedload(Product.versions))
        .filter(Product.id == product_id)
        .first()
    )


def get_product_version(db: Session, version_id: int) -> ProductVersion | None:
    return (
        db.query(ProductVersion)
        .options(
            joinedload(ProductVersion.recipe_version).joinedload(RecipeVersion.recipe),
            joinedload(ProductVersion.packaging_version).joinedload(PackagingVersion.packaging_recipe),
        )
        .filter(ProductVersion.id == version_id)
        .first()
    )


def get_product_version_by_number(
    db: Session, product_id: int, version_number: int
) -> ProductVersion | None:
    return (
        db.query(ProductVersion)
        .options(
            joinedload(ProductVersion.recipe_version).joinedload(RecipeVersion.recipe),
            joinedload(ProductVersion.packaging_version).joinedload(PackagingVersion.packaging_recipe),
        )
        .filter(
            ProductVersion.product_id == product_id,
            ProductVersion.version_number == version_number,
        )
        .first()
    )


def get_products_using_recipe(db: Session, recipe_id: int) -> list[dict]:
    """Get all products that use any version of a recipe."""
    versions = (
        db.query(ProductVersion)
        .join(RecipeVersion, ProductVersion.recipe_version_id == RecipeVersion.id)
        .filter(RecipeVersion.recipe_id == recipe_id)
        .options(joinedload(ProductVersion.product))
        .all()
    )

    result = []
    for v in versions:
        result.append({
            "product_id": v.product_id,
            "product_name": v.product.name,
            "version_number": v.version_number,
        })
    return result


def get_products_using_packaging(db: Session, packaging_id: int) -> list[dict]:
    """Get all products that use any version of a packaging recipe."""
    versions = (
        db.query(ProductVersion)
        .join(PackagingVersion, ProductVersion.packaging_version_id == PackagingVersion.id)
        .filter(PackagingVersion.packaging_recipe_id == packaging_id)
        .options(joinedload(ProductVersion.product))
        .all()
    )

    result = []
    for v in versions:
        result.append({
            "product_id": v.product_id,
            "product_name": v.product.name,
            "version_number": v.version_number,
        })
    return result


def create_product(db: Session, product: ProductCreate) -> Product:
    # Create the product
    db_product = Product(name=product.name)
    db.add(db_product)
    db.flush()

    # Create first version
    _create_version(
        db,
        product_id=db_product.id,
        version_number=1,
        version_data=product.first_version,
        copied_from_version_id=None,
    )

    db.commit()
    db.refresh(db_product)
    return db_product


def create_product_version(
    db: Session, product_id: int, version_data: ProductVersionCopyCreate
) -> ProductVersion | None:
    """Create a new version by copying from an existing version."""
    product = get_product(db, product_id)
    if not product:
        return None

    source_version = get_product_version(db, version_data.copy_from_version_id)
    if not source_version or source_version.product_id != product_id:
        return None

    # Get next version number
    max_version = (
        db.query(func.max(ProductVersion.version_number))
        .filter(ProductVersion.product_id == product_id)
        .scalar()
    ) or 0

    # Create new version copying source data
    new_version = ProductVersion(
        product_id=product_id,
        version_number=max_version + 1,
        version_name=version_data.version_name,
        description=version_data.description,
        recipe_version_id=source_version.recipe_version_id,
        packaging_version_id=source_version.packaging_version_id,
        retail_price_idr=source_version.retail_price_idr,
        num_pieces=source_version.num_pieces,
        grams_per_piece=source_version.grams_per_piece,
        copied_from_version_id=version_data.copy_from_version_id,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return new_version


def create_product_version_new(
    db: Session, product_id: int, version_data: ProductVersionCreate
) -> ProductVersion | None:
    """Create a completely new version with provided data."""
    product = get_product(db, product_id)
    if not product:
        return None

    # Get next version number
    max_version = (
        db.query(func.max(ProductVersion.version_number))
        .filter(ProductVersion.product_id == product_id)
        .scalar()
    ) or 0

    return _create_version(
        db,
        product_id=product_id,
        version_number=max_version + 1,
        version_data=version_data,
        copied_from_version_id=None,
    )


def _create_version(
    db: Session,
    product_id: int,
    version_number: int,
    version_data: ProductVersionCreate,
    copied_from_version_id: int | None,
) -> ProductVersion:
    """Helper to create a product version."""
    new_version = ProductVersion(
        product_id=product_id,
        version_number=version_number,
        version_name=version_data.version_name,
        description=version_data.description,
        recipe_version_id=version_data.recipe_version_id,
        packaging_version_id=version_data.packaging_version_id,
        retail_price_idr=version_data.retail_price_idr,
        num_pieces=version_data.num_pieces,
        grams_per_piece=version_data.grams_per_piece,
        copied_from_version_id=copied_from_version_id,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return new_version


def delete_product(db: Session, product_id: int) -> bool:
    product = get_product(db, product_id)
    if not product:
        return False

    db.delete(product)
    db.commit()
    return True
