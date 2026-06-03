from app.routers.machines import _compute_health


def test_compute_health_healthy():
    metrics = {"cpu": 10, "ram": 20, "disk": 30, "latency_ms": 20}
    status, score = _compute_health(metrics, None, 0)
    assert status == "Healthy"
    assert 80 <= score <= 100


def test_compute_health_warning():
    metrics = {"cpu": 85, "ram": 86, "disk": 40, "latency_ms": 100}
    status, score = _compute_health(metrics, None, 1)
    assert status == "Warning"
    assert 40 <= score < 80


def test_compute_health_critical():
    metrics = {"cpu": 98, "ram": 96, "disk": 96, "latency_ms": 300}
    status, score = _compute_health(metrics, None, 3)
    assert status == "Critical"
    assert 0 <= score < 40


def test_compute_health_no_metrics():
    status, score = _compute_health(None, None, 2)
    assert status in ("Healthy", "Warning", "Critical")
    assert 0 <= score <= 100
