from typing import Any, Self

import httpx

from app.core.config import Settings, get_settings


class MetaAIError(Exception):
    """Base exception for Meta AI integration failures."""


class MetaAIRequestError(MetaAIError):
    """Raised when a request fails before a usable response is received."""


class MetaAIHTTPError(MetaAIError):
    """Raised when the Meta API returns a non-success HTTP status."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"Meta AI request failed with HTTP status {status_code}.")


class MetaAIResponseError(MetaAIError):
    """Raised when the API response is invalid or unusable."""


class MetaAIClient:
    """Shared asynchronous HTTP client for Meta AI endpoints."""

    def __init__(
        self,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings or get_settings()

        if http_client is None and self.settings.model_mock:
            from app.ai.mock import mock_transport

            self._client = httpx.AsyncClient(
                base_url=self.settings.meta_api_base_url.rstrip("/"),
                transport=mock_transport(),
            )
            self._owns_client = True
        elif http_client is None:
            if not self.settings.model_api_key:
                raise RuntimeError("MODEL_API_KEY is not configured.")

            self._client = httpx.AsyncClient(
                base_url=self.settings.meta_api_base_url.rstrip("/"),
                headers={
                    "Authorization": (
                        "Bearer "
                        + self.settings.model_api_key.get_secret_value()
                    ),
                    "Accept": "application/json",
                },
                timeout=httpx.Timeout(
                    self.settings.meta_api_timeout_seconds
                ),
            )
            self._owns_client = True
        else:
            self._client = http_client
            self._owns_client = False

    async def post_json(
        self,
        path: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """POST JSON and return a validated JSON object."""
        try:
            response = await self._client.post(path, json=payload)
        except httpx.TimeoutException as exc:
            raise MetaAIRequestError(
                "Meta AI request timed out."
            ) from exc
        except httpx.RequestError as exc:
            raise MetaAIRequestError(
                "Unable to connect to the Meta AI service."
            ) from exc

        if not response.is_success:
            raise MetaAIHTTPError(response.status_code)

        try:
            data = response.json()
        except ValueError as exc:
            raise MetaAIResponseError(
                "Meta AI returned invalid JSON."
            ) from exc

        if not isinstance(data, dict):
            raise MetaAIResponseError(
                "Meta AI returned an unexpected JSON structure."
            )

        if data.get("error"):
            raise MetaAIResponseError(
                "Meta AI reported an API-level error."
            )

        status = data.get("status")
        if status in {"failed", "incomplete", "cancelled"}:
            raise MetaAIResponseError(
                "Meta AI did not complete the requested operation."
            )

        return data

    @staticmethod
    def extract_text(data: dict[str, Any]) -> str:
        """Extract text from supported response fields without discarding data."""
        direct_text = data.get("output_text")
        if isinstance(direct_text, str) and direct_text.strip():
            return direct_text

        output = data.get("output")
        if not isinstance(output, list):
            raise MetaAIResponseError(
                "Meta AI response contains no supported text output."
            )

        text_parts: list[str] = []

        for item in output:
            if not isinstance(item, dict):
                continue

            content = item.get("content")
            if not isinstance(content, list):
                continue

            for part in content:
                if not isinstance(part, dict):
                    continue

                text = part.get("text")
                if (
                    isinstance(text, str)
                    and text.strip()
                    and part.get("type") in (None, "text", "output_text")
                ):
                    text_parts.append(text)

        if not text_parts:
            raise MetaAIResponseError(
                "Meta AI response contains no supported text output."
            )

        return "\n".join(text_parts)

    async def aclose(self) -> None:
        """Close the HTTP client if this instance owns it."""
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc_value: object,
        traceback: object,
    ) -> None:
        await self.aclose()
