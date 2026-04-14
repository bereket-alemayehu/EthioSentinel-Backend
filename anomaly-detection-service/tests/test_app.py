from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app import app


def test_detect_zscore_anomaly() -> None:
    client = app.test_client()

    response = client.post(
        "/detect",
        json={
            "method": "zscore",
            "current_cases": 130,
            "historical_mean": 100,
            "std_dev": 10,
        },
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert data["method"] == "zscore"
    assert data["classification"] == "ANOMALY"
    assert data["z_score"] == 3.0


def test_detect_arima_returns_valid_response() -> None:
    client = app.test_client()

    response = client.post(
        "/detect",
        json={
            "method": "arima",
            "current_cases": 130,
            "historical_series": [90, 95, 92, 98, 100, 102, 101, 99, 104, 107],
            "arima_order": [1, 1, 1],
            "anomaly_threshold": 1.5,
        },
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert data["method"] == "arima"
    assert data["classification"] == "ANOMALY"
    assert isinstance(data["forecast_next"], float)
    assert isinstance(data["residual_std"], float)
    assert isinstance(data["z_score"], float)
    assert data["anomaly_threshold"] == 1.5


def test_detect_arima_requires_minimum_series_length() -> None:
    client = app.test_client()

    response = client.post(
        "/detect",
        json={
            "method": "arima",
            "current_cases": 130,
            "historical_series": [90, 95, 92],
            "arima_order": [1, 1, 1],
        },
    )

    assert response.status_code == 400
    data = response.get_json()
    assert data is not None
    assert "historical_series must contain at least 8 values" in data["error"]
