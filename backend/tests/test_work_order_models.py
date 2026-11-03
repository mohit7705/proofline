import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, User, WorkOrder, Task


def test_work_order_creator_assignee_and_tasks():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    try:
        with Session(engine) as db:
            manager = User(
                email="manager@example.com",
                password_hash="test-hash",
                full_name="Test Manager",
                role="manager",
            )
            worker = User(
                email="worker@example.com",
                password_hash="test-hash",
                full_name="Test Worker",
                role="worker",
            )
            db.add_all([manager, worker])
            db.flush()

            order = WorkOrder(
                title="Inspect equipment",
                description="Verify equipment condition",
                created_by=manager.id,
                assigned_to=worker.id,
                status="open",
            )
            db.add(order)
            db.flush()

            task = Task(
                work_order_id=order.id,
                title="Check serial number",
                instructions="Capture the equipment serial number",
                position=0,
            )
            db.add(task)
            db.commit()

            db.expire_all()
            saved_order = db.get(WorkOrder, order.id)

            assert saved_order.creator.email == "manager@example.com"
            assert saved_order.assignee.email == "worker@example.com"
            assert len(saved_order.tasks) == 1
            assert saved_order.tasks[0].title == "Check serial number"
            assert saved_order.tasks[0].work_order_id == saved_order.id
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
