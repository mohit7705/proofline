"""Step 2: task verification results and the escalate review decision."""

from alembic import op
import sqlalchemy as sa


revision = "5b9c1d3e7f20"
down_revision = "4a8b7c2d9e10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("decision", sa.String(length=30), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("trigger", sa.String(length=20), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
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
            "decision IN ('VERIFIED', 'NEEDS_MORE_EVIDENCE', "
            "'FAILED_INSPECTION', 'NEEDS_HUMAN_REVIEW')",
            name="ck_task_verifications_decision",
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_task_verifications_task_id", "task_verifications", ["task_id"]
    )

    op.drop_constraint(
        "ck_review_decisions_decision", "review_decisions", type_="check"
    )
    op.create_check_constraint(
        "ck_review_decisions_decision",
        "review_decisions",
        "decision IN ('approved', 'rejected', 'needs_more_evidence', 'escalate')",
    )

    op.create_index(
        "ix_evidence_task_id_sha256", "evidence", ["task_id", "sha256_hash"]
    )


def downgrade() -> None:
    op.drop_index("ix_evidence_task_id_sha256", table_name="evidence")
    op.execute("DELETE FROM review_decisions WHERE decision = 'escalate'")
    op.drop_constraint(
        "ck_review_decisions_decision", "review_decisions", type_="check"
    )
    op.create_check_constraint(
        "ck_review_decisions_decision",
        "review_decisions",
        "decision IN ('approved', 'rejected', 'needs_more_evidence')",
    )
    op.drop_index("ix_task_verifications_task_id", table_name="task_verifications")
    op.drop_table("task_verifications")
