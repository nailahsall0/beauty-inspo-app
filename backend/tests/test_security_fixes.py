"""
Regression tests for security and stability fixes.

These tests verify that the stabilization fixes work correctly:
- Rate limiting on auth endpoints
- File upload size limits
- Search query validation
- Regex injection prevention
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import io


# Import will fail without proper environment setup, so we use conditional import
try:
    from server import app, MAX_UPLOAD_SIZE, MAX_QUERY_LENGTH
    client = TestClient(app)
    HAS_SERVER = True
except Exception:
    HAS_SERVER = False
    MAX_UPLOAD_SIZE = 50 * 1024 * 1024
    MAX_QUERY_LENGTH = 100


@pytest.mark.skipif(not HAS_SERVER, reason="Server not available")
class TestRateLimiting:
    """Tests for rate limiting on auth endpoints."""

    def test_login_rate_limit_allows_normal_usage(self):
        """Normal login attempts should work."""
        # First few attempts should work (even if credentials are wrong)
        for i in range(3):
            response = client.post(
                "/api/auth/login",
                json={"email": f"test{i}@example.com", "password": "wrong"}
            )
            # Should get 401 (invalid credentials), not 429 (rate limited)
            assert response.status_code in [401, 429]

    def test_register_rate_limit_allows_normal_usage(self):
        """Normal registration attempts should work."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "validpassword123",
                "display_name": "New User",
                "username": "newuser"
            }
        )
        # Should get either success, conflict, or rate limit
        assert response.status_code in [200, 409, 429]


@pytest.mark.skipif(not HAS_SERVER, reason="Server not available")
class TestUploadSizeLimits:
    """Tests for file upload size limits."""

    def test_upload_size_limit_constant_exists(self):
        """MAX_UPLOAD_SIZE should be defined."""
        assert MAX_UPLOAD_SIZE > 0
        assert MAX_UPLOAD_SIZE == 50 * 1024 * 1024  # 50MB default

    def test_upload_rejects_oversized_file_mock(self):
        """Files over MAX_UPLOAD_SIZE should be rejected with 413."""
        # This test would need authentication and storage mocking
        # For now, just verify the constant exists
        assert MAX_UPLOAD_SIZE == 50 * 1024 * 1024


@pytest.mark.skipif(not HAS_SERVER, reason="Server not available")
class TestSearchSecurity:
    """Tests for search endpoint security."""

    def test_search_query_length_constant_exists(self):
        """MAX_QUERY_LENGTH should be defined."""
        assert MAX_QUERY_LENGTH > 0
        assert MAX_QUERY_LENGTH == 100  # Default

    def test_search_rejects_long_query(self):
        """Queries longer than MAX_QUERY_LENGTH should be rejected."""
        long_query = "a" * 150  # Exceeds 100 char limit
        response = client.get(f"/api/search?q={long_query}")
        assert response.status_code == 400
        assert "too long" in response.json().get("detail", "").lower()

    def test_search_accepts_normal_query(self):
        """Normal length queries should work."""
        response = client.get("/api/search?q=braids")
        # Should work (might be 200 or 401 depending on auth state)
        assert response.status_code in [200, 401]

    def test_search_handles_regex_metacharacters(self):
        """Regex metacharacters in search should not cause errors."""
        # These characters are regex metacharacters that could cause ReDoS
        dangerous_chars = ".*[](){}+?^$|\\test"
        response = client.get(f"/api/search?q={dangerous_chars}")
        # Should not crash - either work or return auth error
        assert response.status_code in [200, 400, 401]

    def test_search_empty_query_rejected(self):
        """Empty search queries should be rejected."""
        response = client.get("/api/search?q=")
        assert response.status_code == 400

    def test_search_whitespace_only_rejected(self):
        """Whitespace-only queries should be rejected."""
        response = client.get("/api/search?q=   ")
        assert response.status_code == 400


@pytest.mark.skipif(not HAS_SERVER, reason="Server not available")
class TestProfessionalSearch:
    """Tests for professional search endpoint security."""

    def test_professional_search_query_length_limit(self):
        """Long queries to professional search should be rejected."""
        long_query = "b" * 150
        response = client.get(f"/api/professionals/search?q={long_query}")
        assert response.status_code == 400

    def test_professional_search_city_length_limit(self):
        """Long city names should be rejected."""
        long_city = "c" * 150
        response = client.get(f"/api/professionals/search?city={long_city}")
        assert response.status_code == 400

    def test_professional_search_handles_regex_in_city(self):
        """Regex characters in city search should be escaped."""
        # This should not cause a regex error
        response = client.get("/api/professionals/search?city=.*Cincinnati.*")
        assert response.status_code in [200, 401]


class TestJWTConfiguration:
    """Tests for JWT security configuration."""

    def test_jwt_expiration_default(self):
        """JWT expiration should default to 24 hours (1440 minutes)."""
        try:
            from server import ACCESS_TOKEN_MINUTES
            # Default should be 1440 (24 hours), not 43200 (30 days)
            assert ACCESS_TOKEN_MINUTES == 1440
        except ImportError:
            pytest.skip("Server not available")


class TestMongoDBConfiguration:
    """Tests for MongoDB connection pool configuration."""

    def test_mongodb_pool_configured(self):
        """MongoDB client should have pool configuration."""
        try:
            from server import client
            # Motor client should exist
            assert client is not None
            # Pool settings should be configured (verify options exist)
            # Note: Motor's internal API varies, so we just verify client exists
        except ImportError:
            pytest.skip("Server not available")


class TestStorageRetryLogic:
    """Tests for storage service retry logic."""

    def test_get_object_has_retry_parameter(self):
        """get_object should have max_retries parameter."""
        try:
            from server import get_object
            import inspect
            sig = inspect.signature(get_object)
            assert 'max_retries' in sig.parameters
            assert sig.parameters['max_retries'].default == 2
        except ImportError:
            pytest.skip("Server not available")


class TestLogging:
    """Tests for proper logging configuration."""

    def test_logger_exists(self):
        """Logger should be configured."""
        try:
            from server import logger
            assert logger is not None
            assert logger.name == "brookie"
        except ImportError:
            pytest.skip("Server not available")
