from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.auth import get_current_user, require_roles


@pytest.mark.parametrize(
    ("role", "allowed", "expected"),
    [
        ("manager", ("manager",), 200),
        ("worker", ("worker",), 200),
        ("worker", ("manager",), 403),
        ("manager", ("worker",), 403),
    ],
)
def test_role_permissions(role, allowed, expected):
    test_app = FastAPI()
    test_app.dependency_overrides[get_current_user] = lambda: (
        SimpleNamespace(role=role)
    )

    @test_app.get("/protected")
    def protected(user=Depends(require_roles(*allowed))):
        return {"role": user.role}

    response = TestClient(test_app).get("/protected")
    assert response.status_code == expected

    if expected == 200:
        assert response.json()["role"] == role
    else:
        assert response.json()["detail"] == "Insufficient permissions"
