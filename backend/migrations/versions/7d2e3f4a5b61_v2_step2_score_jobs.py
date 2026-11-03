"""v2 step 2: AI score runs (progress and what the AI saw)."""

from alembic import op
import sqlalchemy as sa


revision = "7d2e3f4a5b61"
down_revision = "6c1d2e3f4a50"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "score_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("started_by", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed')",
            name="ck_score_jobs_status",
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["started_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_score_jobs_task_id", "score_jobs", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_score_jobs_task_id", table_name="score_jobs")
    op.drop_table("score_jobs")
