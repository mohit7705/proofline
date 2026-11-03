#!/bin/sh
# Apply database migrations, then start the command given to the container.
set -e
alembic upgrade head
exec "$@"
