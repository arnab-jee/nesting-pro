# Nesting Pro Backend

This backend provides a FastAPI service for parsing wood panel CSV data,
optimizing layouts for panel saw and Nanxing nesting, and exporting PDF/XML outputs.

## Setup

```bash
cd /home/arniem/dev/projects/universal-pride/nesting-pro/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

If required, install runtime dependencies explicitly:

```bash
pip install fastapi uvicorn reportlab shapely lxml
```

## Run

```bash
source .venv/bin/activate
./start-backend.sh
```

The API will be available at `http://127.0.0.1:8000`.

## Endpoints

- `POST /parse` — parse CSV text into normalized parts
- `POST /optimize` — run optimization for saw or nanxing
- `POST /export/pdf` — render a layout PDF
- `POST /export/xml` — export FCC-like XML
