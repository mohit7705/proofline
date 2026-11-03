import uuid
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, User, WorkOrder, Task


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
        session.rollback()

    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def manager(db):
    user = User(
        email="validation-manager@example.com",
        password_hash="test-hash",
        full_name="Validation Manager",
        role="manager",
    )
    db.add(user)
    db.flush()
    return user


def make_order(manager=None, **overrides):
    values = {
        "title": "Inspect site",
        "description": "Verify site conditions",
        "created_by": manager.id if manager is not None else None,
        "status": "draft",
    }
    values.update(overrides)
    return WorkOrder(**values)


def test_valid_work_order_statuses(db, manager):
    statuses = [
        "draft", "open", "in_progress", "submitted",
        "under_review", "approved", "rejected", "cancelled",
    ]
    for status in statuses:
        db.add(make_order(manager, status=status))
    db.commit()
    assert db.query(WorkOrder).count() == len(statuses)


def test_invalid_work_order_status_rejected(db, manager):
    db.add(make_order(manager, status="unknown"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_invalid_task_status_rejected(db, manager):
    order = make_order(manager)
    db.add(order)
    db.flush()

    db.add(Task(
        work_order_id=order.id,
        title="Check equipment",
        instructions="Inspect the equipment",
        status="unknown",
        position=0,
    ))
    with pytest.raises(IntegrityError):
        db.flush()


def test_negative_task_position_rejected(db, manager):
    order = make_order(manager)
    db.add(order)
    db.flush()

    db.add(Task(
        work_order_id=order.id,
        title="Check equipment",
        instructions="Inspect the equipment",
        position=-1,
    ))
    with pytest.raises(IntegrityError):
        db.flush()


def test_missing_creator_rejected(db):
    db.add(make_order(manager=None, created_by=None))
    with pytest.raises(IntegrityError):
        db.flush()


def test_nonexistent_work_order_foreign_key_rejected(db):
    db.add(Task(
        work_order_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        title="Check equipment",
        instructions="Inspect the equipment",
        position=0,
    ))
    with pytest.raises(IntegrityError):
        db.flush()
