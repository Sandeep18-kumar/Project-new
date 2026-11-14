# Signal — Customer Churn Intelligence

A runnable customer-retention workspace with separate Overview, Customers, Model Insights, and Retention Campaigns pages. It includes a FastAPI scoring service, a scikit-learn random-forest classifier, searchable customer profiles, CSV export, model feature insights, prediction testing, and locally persisted campaign planning.

> **Important:** The included model is trained on generated synthetic data so the app works immediately. Its scores and dashboard metrics are illustrative only. Do not use this starter model to make real customer decisions. Before production use, train and validate the model on representative, consented customer data, define an appropriate intervention policy, and monitor model quality and impact.

## Run locally

Requires Python 3.10 or newer.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Use the left navigation to visit `/customers`, `/insights`, and `/campaigns`. Interactive API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs); the liveness endpoint is `/health`.

The starter model is fitted at app startup. Campaign plans are persisted in `data/signal.db`; changing a campaign's status or deleting one is supported. Campaign creation only stores a plan: the app does not send emails, texts, or calls. API routes:

| Route | Purpose |
| --- | --- |
| `GET /api/dashboard` | Dashboard metrics, trend, and model notice |
| `GET /api/customers` | Scored sample customers; supports `risk`, `search`, and `limit` |
| `GET /api/customers/{customer_id}` | Customer score and retention recommendations |
| `POST /api/predict` | Validate customer features and return a churn probability |
| `GET /api/model` | Model metadata and ranked feature importances |
| `GET /api/campaigns` | List saved campaign plans |
| `POST /api/campaigns` | Save a campaign plan as a draft |
| `PATCH /api/campaigns/{id}` | Update a campaign status |
| `DELETE /api/campaigns/{id}` | Delete a campaign plan |

## Deploy publicly on Render

This project includes a Render Blueprint (`render.yaml`) and Dockerfile. The Blueprint uses a paid Starter web service and a 1 GB persistent disk so saved campaign plans survive deploys and restarts.

1. Push this project to a GitHub repository. Do not commit `.env`, `.venv`, or `data/signal.db`.
2. In Render, choose **New → Blueprint**, connect the repository, and apply the `render.yaml` configuration.
3. Wait for the first deploy to pass its `/health` check. Render will provide the public `onrender.com` URL.

The public demo uses synthetic customer data. It has no user login, so do not put real customer data or secrets into it. Campaign actions only modify the local campaign plan; they do not contact customers. Configure authentication and access controls before using it with private data or a wider audience.

## Replace the demo training data

`_make_training_data()` in `app.py` is an intentionally visible synthetic-data generator. Replace it with a governed data-loading and training pipeline, keeping the feature contract consistent with `PredictionRequest`. Evaluate calibration and performance on a time-based holdout, compare against a simple baseline, document the target window and label definition, and review fairness and privacy before deploying predictions. Add model-artifact versioning and monitoring before scaling this demo into a production service.
