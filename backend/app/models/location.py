import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Location(TimestampMixin, Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    site: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sites.id"), nullable=True, index=True
    )
    building: Mapped[str | None] = mapped_column(String(200), nullable=True)
    floor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    room: Mapped[str | None] = mapped_column(String(100), nullable=True)
    equipment: Mapped[str | None] = mapped_column(String(200), nullable=True)

    tasks: Mapped[list["Task"]] = relationship(back_populates="location")
    site_record: Mapped["Site | None"] = relationship(back_populates="locations")
