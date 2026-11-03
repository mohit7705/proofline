"""Link evidence to checklist requirements.

Revision ID: 2b8e4d6c9f10
Revises: 1cfbc4964e82
"""
from alembic import op
import sqlalchemy as sa

revision = "2b8e4d6c9f10"
down_revision = "1cfbc4964e82"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("evidence", sa.Column("requirement_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_evidence_requirement_id_requirements",
        "evidence", "requirements", ["requirement_id"], ["id"],
    )
    op.create_index("ix_evidence_requirement_id", "evidence", ["requirement_id"])


def downgrade() -> None:
    op.drop_index("ix_evidence_requirement_id", table_name="evidence")
    op.drop_constraint(
        "fk_evidence_requirement_id_requirements",
        "evidence", type_="foreignkey",
    )
    op.drop_column("evidence", "requirement_id")
