"""Remove the inspector role: only manager and worker remain.

Existing inspector accounts become managers (they already reviewed work).
"""

from alembic import op

revision = "8e4f5a6b7c72"
down_revision = "7d2e3f4a5b61"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'manager' WHERE role = 'inspector'")
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint("ck_users_role", "users", "role IN ('manager', 'worker')")


def downgrade() -> None:
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role", "users", "role IN ('manager', 'worker', 'inspector')"
    )
