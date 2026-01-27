from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.schemas.tag import TagCreate


def get_tags(db: Session) -> list[Tag]:
    return db.query(Tag).order_by(Tag.name).all()


def get_tag(db: Session, tag_id: int) -> Tag | None:
    return db.query(Tag).filter(Tag.id == tag_id).first()


def get_tag_by_name(db: Session, name: str) -> Tag | None:
    return db.query(Tag).filter(Tag.name == name).first()


def create_tag(db: Session, tag: TagCreate) -> Tag:
    db_tag = Tag(name=tag.name)
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag


def delete_tag(db: Session, tag_id: int) -> bool:
    db_tag = get_tag(db, tag_id)
    if not db_tag:
        return False

    db.delete(db_tag)
    db.commit()
    return True
