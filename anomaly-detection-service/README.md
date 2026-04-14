# Anomaly Detection Microservice

Flask-based microservice for outbreak anomaly detection using:

- Z-score (`method: zscore`)
- ARIMA forecast + residual Z-score (`method: arima`)

## Endpoint

- `POST /detect`

## Request JSON

### Z-score request

```json
{
  "method": "zscore",
  "current_cases": 130,
  "historical_mean": 100,
  "std_dev": 10
}
```

### ARIMA request

```json
{
  "method": "arima",
  "current_cases": 130,
  "historical_series": [90, 95, 92, 98, 100, 102, 101, 99, 104, 107],
  "arima_order": [1, 1, 1],
  "anomaly_threshold": 1.5
}
```

## Logic

- Z-score mode:
  - $Z = \frac{current\_cases - historical\_mean}{std\_dev}$
  - If `Z > 2` -> `ANOMALY`, else `NORMAL`
- ARIMA mode:
  - Fit ARIMA on `historical_series`
  - Forecast next value
  - Compute residual standard deviation from post-burn-in residuals (more sensitive)
  - $Z = \frac{current\_cases - forecast\_next}{residual\_std}$
  - If `Z > anomaly_threshold` (default `1.5`) -> `ANOMALY`, else `NORMAL`

## Response JSON

### Z-score response example

```json
{
  "method": "zscore",
  "input": {
    "current_cases": 130.0,
    "historical_mean": 100.0,
    "std_dev": 10.0
  },
  "z_score": 3.0,
  "classification": "ANOMALY"
}
```

### ARIMA response example

```json
{
  "method": "arima",
  "input": {
    "current_cases": 130.0,
    "historical_series_count": 10,
    "arima_order": [1, 1, 1]
  },
  "forecast_next": 106.9386,
  "residual_std": 2.6284,
  "z_score": 8.7738,
  "anomaly_threshold": 1.5,
  "classification": "ANOMALY"
}
```

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

## Test commands

### 1) Health/index check

```bash
curl -s http://127.0.0.1:5000/ | jq
```

### 2) Test Z-score mode

```bash
curl -s -X POST http://127.0.0.1:5000/detect \
  -H "Content-Type: application/json" \
  -d '{
    "method": "zscore",
    "current_cases": 130,
    "historical_mean": 100,
    "std_dev": 10
  }' | jq
```

### 3) Test ARIMA mode

```bash
curl -s -X POST http://127.0.0.1:5000/detect \
  -H "Content-Type: application/json" \
  -d '{
    "method": "arima",
    "current_cases": 130,
    "historical_series": [90, 95, 92, 98, 100, 102, 101, 99, 104, 107],
    "arima_order": [1, 1, 1],
    "anomaly_threshold": 1.5
  }' | jq
```

### 4) Run automated tests (pytest)

```bash
pytest -q
```
