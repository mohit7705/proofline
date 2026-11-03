"""Add media metadata to evidence.

Revision ID: 7d2c8a41f6b9
Revises: 2b8e4d6c9f10
"""

from alembic import op
import sqlalchemy as sa


revision = "7d2c8a41f6b9"
down_revision = "2b8e4d6c9f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "evidence",
        sa.Column("media_metadata", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("evidence", "media_metadata")
