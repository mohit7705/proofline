"""Add Google authentication support to users.

Revision ID: 9a7f3c2d1b60
Revises: 057b06434191
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9a7f3c2d1b60"
down_revision: Union[str, Sequence[str], None] = "057b06434191"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.add_column(
        "users",
        sa.Column("google_sub", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_users_google_sub",
        "users",
        ["google_sub"],
        unique=True,
    )


def downgrade() -> None:
    # Refuse to discard the ability to authenticate Google-only accounts.
    connection = op.get_bind()
    google_only_users = connection.execute(
        sa.text(
            "SELECT COUNT(*) FROM users "
            "WHERE google_sub IS NOT NULL AND password_hash IS NULL"
        )
    ).scalar_one()

    if google_only_users:
        raise RuntimeError(
            "Cannot downgrade: Google-only accounts exist. "
            "Migrate those accounts before retrying."
        )

    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_column("users", "google_sub")
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
