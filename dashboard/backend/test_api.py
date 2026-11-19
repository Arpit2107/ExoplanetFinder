#!/usr/bin/env python3
"""Test API endpoints using pytest and httpx."""

import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "message" in data


@pytest.mark.asyncio
async def test_summary(client):
    response = await client.get("/api/summary")
    assert response.status_code == 200
    data = response.json()
    assert "test_cnn" in data
    assert "test_gb" in data
    assert "val_cnn" in data
    assert "val_gb" in data


@pytest.mark.asyncio
async def test_metrics(client):
    response = await client.get("/api/metrics")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


@pytest.mark.asyncio
async def test_curves_cnn_test(client):
    response = await client.get("/api/curves/cnn/test")
    assert response.status_code == 200
    data = response.json()
    assert data["model_type"] == "cnn"
    assert data["split"] == "test"
    assert "pr_curve" in data
    assert "roc_curve" in data
    assert "auc" in data
    assert "avg_precision" in data


@pytest.mark.asyncio
async def test_curves_gb_test(client):
    response = await client.get("/api/curves/gb/test")
    assert response.status_code == 200
    data = response.json()
    assert data["model_type"] == "gb"
    assert data["split"] == "test"


@pytest.mark.asyncio
async def test_predictions_test(client):
    response = await client.get("/api/predictions/test")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


@pytest.mark.asyncio
async def test_tces(client):
    response = await client.get("/api/tces")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


@pytest.mark.asyncio
async def test_tce_detail(client):
    response = await client.get("/api/tces/TCE_000000")
    assert response.status_code == 200
    data = response.json()
    assert data["tce_id"] == "TCE_000000"
    assert "global_view" in data
    assert "local_view" in data


@pytest.mark.asyncio
async def test_counters(client):
    response = await client.get("/api/stats/counters")
    assert response.status_code == 200
    data = response.json()
    assert "total_tces" in data
    assert "planet_candidates" in data
    assert "astrophysical_false_positives" in data
    assert "non_transiting_phenomena" in data


@pytest.mark.asyncio
async def test_splits(client):
    response = await client.get("/api/stats/splits")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 3  # train, val, test


@pytest.mark.asyncio
async def test_top_candidates(client):
    response = await client.get("/api/stats/top-candidates")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert data[0]["rank"] == 1


@pytest.mark.asyncio
async def test_histogram(client):
    response = await client.get("/api/stats/histogram")
    assert response.status_code == 200
    data = response.json()
    assert "bins" in data
    assert isinstance(data["bins"], list)
    assert len(data["bins"]) == 20


@pytest.mark.asyncio
async def test_scatter_eclipse(client):
    response = await client.get("/api/stats/scatter-eclipse")
    assert response.status_code == 200
    data = response.json()
    assert "points" in data
    assert isinstance(data["points"], list)
    assert len(data["points"]) > 0


@pytest.mark.asyncio
async def test_errors(client):
    response = await client.get("/api/errors")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


@pytest.mark.asyncio
async def test_optimal_threshold(client):
    response = await client.get("/api/threshold/optimal")
    assert response.status_code == 200
    data = response.json()
    assert "threshold" in data
    assert "source" in data
    assert "model_type" in data


@pytest.mark.asyncio
async def test_update_threshold(client):
    response = await client.post("/api/threshold", json={"threshold": 0.5})
    assert response.status_code == 200
    data = response.json()
    assert data["threshold"] == 0.5
    assert "precision" in data
    assert "recall" in data
    assert "f1" in data
    assert "confusion_matrix" in data
    assert "n_samples" in data


@pytest.mark.asyncio
async def test_kepler90(client):
    response = await client.get("/api/kepler90")
    assert response.status_code == 200
    data = response.json()
    assert "planets" in data
    assert "disclaimer" in data
    assert isinstance(data["planets"], list)
    assert len(data["planets"]) == 8


@pytest.mark.asyncio
async def test_plots(client):
    response = await client.get("/api/plots")
    assert response.status_code == 200
    data = response.json()
    assert "plots" in data
    assert isinstance(data["plots"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])