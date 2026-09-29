# Naavai AI: The Freight Strategist - Team F6 | SIH 2026 PS26006
Decision-Support System for SAIL Transport & Shipping (TSD).

## Step 1 (Spec Section 4) - done
```powershell
cd Naavai
python -m venv venv --without-pip
.\venv\Scripts\python.exe -m ensurepip --upgrade
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\Activate.ps1
python backend\generate_sample_datasets.py
python backend\physics\voyage_cost_engine.py
uvicorn backend.main:app --reload --port 8000
```
Keep the backend terminal running. In a second terminal, start the frontend:
```powershell
cd frontend
npm install
npm run dev
```

If the Vite terminal shows `ECONNREFUSED` or the page says `Unable to load historical incidents`,
the API is not listening on `127.0.0.1:8000`. Start the backend command above and refresh the page.

For a deployed frontend, set the build environment variable
`VITE_API_BASE_URL` to the deployed FastAPI URL ending in `/api/v1`.
Local development uses the Vite proxy automatically.

## Structure
backend/physics, backend/ml_engine, backend/simulation, backend/optimization, backend/data, frontend/src
