import asyncio

import httpx
import pytest
from pydantic import SecretStr

from app.ai.client import (
    MetaAIClient,
    MetaAIHTTPError,
    MetaAIRequestError,
    MetaAIResponseError,
)
from app.core.config import Settings


def post_with_handler(handler, payload=None):
    async def scenario():
        async with httpx.AsyncClient(
            base_url="https://api.meta.ai",
            transport=httpx.MockTransport(handler),
        ) as http_client:
            settings = Settings(
                model_api_key=SecretStr("unit-test-secret"),
                meta_api_base_url="https://api.meta.ai",
                meta_api_timeout_seconds=1.0,
            )
            client = MetaAIClient(
                settings=settings,
                http_client=http_client,
            )
            return await client.post_json(
                "/v1/responses",
                payload or {"input": "test"},
            )

    return asyncio.run(scenario())


def response_handler(status_code=200, content=None):
    def handler(request):
        return httpx.Response(
            status_code,
            json=content if content is not None else {"output_text": "OK"},
            request=request,
        )

    return handler


def test_post_json_returns_successful_object():
    result = post_with_handler(
        response_handler(content={"output_text": "PROOFLINE_API_OK"})
    )
    assert result == {"output_text": "PROOFLINE_API_OK"}


@pytest.mark.parametrize("status_code", [400, 401, 403, 429, 500, 503])
def test_post_json_rejects_http_errors_without_exposing_body(status_code):
    def handler(request):
        return httpx.Response(
            status_code,
            json={"error": "unit-test-secret"},
            request=request,
        )

    with pytest.raises(MetaAIHTTPError) as exc_info:
        post_with_handler(handler)

    assert exc_info.value.status_code == status_code
    assert "unit-test-secret" not in str(exc_info.value)


def test_post_json_handles_timeout():
    def handler(request):
        raise httpx.ReadTimeout("simulated timeout", request=request)

    with pytest.raises(MetaAIRequestError, match="timed out"):
        post_with_handler(handler)


def test_post_json_handles_connection_failure():
    def handler(request):
        raise httpx.ConnectError("simulated connection failure", request=request)

    with pytest.raises(MetaAIRequestError, match="Unable to connect"):
        post_with_handler(handler)


def test_post_json_rejects_invalid_json():
    def handler(request):
        return httpx.Response(
            200,
            content=b"{invalid json",
            headers={"Content-Type": "application/json"},
            request=request,
        )

    with pytest.raises(MetaAIResponseError, match="invalid JSON"):
        post_with_handler(handler)


def test_post_json_rejects_non_object_json():
    def handler(request):
        return httpx.Response(200, json=["unexpected"], request=request)

    with pytest.raises(MetaAIResponseError, match="unexpected JSON structure"):
        post_with_handler(handler)


def test_post_json_rejects_api_level_error():
    with pytest.raises(MetaAIResponseError, match="API-level error"):
        post_with_handler(
            response_handler(content={"error": {"code": "invalid_request"}})
        )


@pytest.mark.parametrize("status", ["failed", "incomplete", "cancelled"])
def test_post_json_rejects_unsuccessful_model_states(status):
    with pytest.raises(MetaAIResponseError, match="did not complete"):
        post_with_handler(response_handler(content={"status": status}))


def test_extract_text_from_direct_output():
    assert MetaAIClient.extract_text(
        {"output_text": "  Hello from Meta  "}
    ) == "  Hello from Meta  "


def test_extract_text_from_nested_output():
    data = {
        "output": [
            {
                "content": [
                    {"type": "output_text", "text": "First part"},
                    {"type": "text", "text": "Second part"},
                ]
            }
        ]
    }

    assert MetaAIClient.extract_text(data) == "First part\nSecond part"


def test_extract_text_rejects_missing_text():
    with pytest.raises(MetaAIResponseError, match="no supported text output"):
        MetaAIClient.extract_text({"output": []})


def test_extract_text_preserves_structured_response_separately():
    data = {
        "output_text": "Detected region",
        "segmentation": {"mask_token": "<|mask;example|>"},
    }

    assert MetaAIClient.extract_text(data) == "Detected region"
    assert data["segmentation"]["mask_token"] == "<|mask;example|>"
