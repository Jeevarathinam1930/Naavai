# Naavai AI - Team F6 | SIH 2026 PS26006
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
Frontend:
```powershell
cd frontend; npm install; npm run dev
```

## Structure
backend/physics, backend/ml_engine, backend/simulation, backend/optimization, backend/data, frontend/src
