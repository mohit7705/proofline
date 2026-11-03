"""Add perceptual fingerprints to evidence."""

from alembic import op
import sqlalchemy as sa


revision = "4a8b7c2d9e10"
down_revision = "7d2c8a41f6b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "evidence",
        sa.Column("perceptual_hash", sa.String(length=16), nullable=True),
    )
    op.create_index(
        "ix_evidence_perceptual_hash",
        "evidence",
        ["perceptual_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_evidence_perceptual_hash", table_name="evidence")
    op.drop_column("evidence", "perceptual_hash")
