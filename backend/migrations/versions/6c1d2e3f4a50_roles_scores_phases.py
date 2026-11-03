"""Evidence phase, self-created work, challenge code, score storage."""

from alembic import op
import sqlalchemy as sa


revision = "6c1d2e3f4a50"
down_revision = "5b9c1d3e7f20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "evidence",
        sa.Column("phase", sa.String(length=10), server_default="other", nullable=False),
    )
    op.create_check_constraint(
        "ck_evidence_phase", "evidence", "phase IN ('before', 'after', 'other')"
    )

    op.add_column(
        "requirements",
        sa.Column(
            "requires_before_after",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )

    op.add_column(
        "work_orders",
        sa.Column(
            "is_self_created", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
    )

    op.add_column("tasks", sa.Column("challenge_code", sa.String(length=32), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("challenge_issued_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "task_scores",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("requirement_id", sa.Uuid(), nullable=True),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("band", sa.String(length=12), nullable=False),
        sa.Column("parts", sa.JSON(), nullable=False),
        sa.Column("reasons", sa.JSON(), nullable=False),
        sa.Column("model_name", sa.String(length=150), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("trigger", sa.String(length=20), nullable=False),
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
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_task_scores_score",
        ),
        sa.CheckConstraint(
            "band IN ('strong', 'check', 'weak', 'not_scored')",
            name="ck_task_scores_band",
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["requirement_id"], ["requirements.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_scores_task_id", "task_scores", ["task_id"])
    op.create_index("ix_task_scores_batch_id", "task_scores", ["batch_id"])
    op.create_index(
        "ix_task_scores_task_created", "task_scores", ["task_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_task_scores_task_created", table_name="task_scores")
    op.drop_index("ix_task_scores_batch_id", table_name="task_scores")
    op.drop_index("ix_task_scores_task_id", table_name="task_scores")
    op.drop_table("task_scores")
    op.drop_column("tasks", "challenge_issued_at")
    op.drop_column("tasks", "challenge_code")
    op.drop_column("work_orders", "is_self_created")
    op.drop_column("requirements", "requires_before_after")
    op.drop_constraint("ck_evidence_phase", "evidence", type_="check")
    op.drop_column("evidence", "phase")
