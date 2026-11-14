from __future__ import annotations

import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.pipeline import Pipeline


ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "data" / "signal.db"
CONTRACTS = ("Month-to-month", "One year", "Two year")
INTERNET_TYPES = ("Fiber optic", "DSL", "No")
PAYMENT_METHODS = ("Electronic check", "Mailed check", "Bank transfer", "Credit card")


def _initialize_database() -> None:
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                audience TEXT NOT NULL,
                channel TEXT NOT NULL,
                offer TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Draft',
                audience_size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


_initialize_database()


def _make_training_data(rows: int = 7_500, seed: int = 24) -> tuple[list[dict], np.ndarray]:
    """Create a repeatable, explicitly synthetic training set for the starter app."""
    rng = np.random.default_rng(seed)
    records: list[dict] = []
    labels = np.empty(rows, dtype=np.int8)

    for index in range(rows):
        tenure = int(rng.integers(0, 73))
        monthly = float(rng.uniform(20, 120))
        contract = str(rng.choice(CONTRACTS, p=(0.56, 0.23, 0.21)))
        internet = str(rng.choice(INTERNET_TYPES, p=(0.46, 0.42, 0.12)))
        payment = str(rng.choice(PAYMENT_METHODS, p=(0.34, 0.16, 0.25, 0.25)))
        support = str(rng.choice(("Yes", "No"), p=(0.31, 0.69)))
        security = str(rng.choice(("Yes", "No"), p=(0.36, 0.64)))
        paperless = str(rng.choice(("Yes", "No"), p=(0.62, 0.38)))
        total = round(max(0.0, tenure * monthly * float(rng.uniform(0.84, 1.03))), 2)

        log_odds = (
            -1.05
            + (0.95 if contract == "Month-to-month" else -0.62 if contract == "Two year" else -0.14)
            + (0.48 if internet == "Fiber optic" else -0.1 if internet == "No" else 0)
            + (0.42 if payment == "Electronic check" else 0)
            + (0.5 if support == "No" else -0.22)
            + (0.36 if security == "No" else -0.2)
            + (0.2 if paperless == "Yes" else 0)
            + (0.72 if tenure < 12 else 0.22 if tenure < 24 else -0.12 if tenure > 48 else 0)
            + (monthly - 70) / 75
            + float(rng.normal(0, 0.38))
        )
        probability = 1 / (1 + math.exp(-log_odds))
        labels[index] = rng.binomial(1, probability)
        records.append(
            {
                "tenure_months": tenure,
                "monthly_charges": round(monthly, 2),
                "total_charges": total,
                "contract": contract,
                "internet_service": internet,
                "payment_method": payment,
                "tech_support": support,
                "online_security": security,
                "paperless_billing": paperless,
            }
        )
    return records, labels


def _train_model() -> Pipeline:
    training_rows, labels = _make_training_data()
    pipeline = Pipeline(
        [
            ("features", DictVectorizer(sparse=True)),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=220,
                    max_depth=12,
                    min_samples_leaf=4,
                    class_weight="balanced_subsample",
                    random_state=24,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    pipeline.fit(training_rows, labels)
    return pipeline


MODEL = _train_model()


class PredictionRequest(BaseModel):
    tenure_months: int = Field(ge=0, le=120)
    monthly_charges: float = Field(gt=0, le=10_000)
    contract: Literal["Month-to-month", "One year", "Two year"]
    internet_service: Literal["Fiber optic", "DSL", "No"]
    payment_method: Literal[
        "Electronic check", "Mailed check", "Bank transfer", "Credit card"
    ]
    tech_support: Literal["Yes", "No"]
    online_security: Literal["Yes", "No"]
    paperless_billing: Literal["Yes", "No"]


def _risk_band(probability: float) -> str:
    if probability >= 0.7:
        return "High"
    if probability >= 0.4:
        return "Medium"
    return "Low"


def _suggestions(customer: dict) -> list[str]:
    suggestions: list[str] = []
    if customer["contract"] == "Month-to-month":
        suggestions.append("Offer a contract upgrade with a loyalty incentive")
    if customer["tech_support"] == "No":
        suggestions.append("Include a complimentary tech-support trial")
    if customer["online_security"] == "No":
        suggestions.append("Recommend an online-security bundle")
    if customer["tenure_months"] < 12:
        suggestions.append("Schedule a proactive first-year check-in")
    if not suggestions:
        suggestions.append("Recognize this loyal customer with a tailored rewards offer")
    return suggestions[:3]


def _score(customer: dict) -> dict:
    probability = float(MODEL.predict_proba([customer])[0][1])
    return {
        **customer,
        "churn_probability": round(probability, 4),
        "risk": _risk_band(probability),
        "recommendations": _suggestions(customer),
    }


def _make_customer_sample(count: int = 240, seed: int = 19) -> list[dict]:
    rng = np.random.default_rng(seed)
    customers: list[dict] = []
    for index in range(count):
        tenure = int(rng.integers(1, 73))
        monthly = round(float(rng.uniform(24, 118)), 2)
        customer = {
            "id": f"CX-{100000 + index}",
            "name": str(rng.choice(
                ("Avery Morgan", "Jordan Lee", "Taylor Kim", "Riley Patel", "Casey Chen",
                 "Morgan Davis", "Quinn Rivera", "Jamie Brooks", "Alex Turner", "Sam Wilson")
            )),
            "tenure_months": tenure,
            "monthly_charges": monthly,
            "total_charges": round(tenure * monthly * float(rng.uniform(0.85, 1.02)), 2),
            "contract": str(rng.choice(CONTRACTS, p=(0.57, 0.23, 0.2))),
            "internet_service": str(rng.choice(INTERNET_TYPES, p=(0.47, 0.41, 0.12))),
            "payment_method": str(rng.choice(PAYMENT_METHODS, p=(0.34, 0.16, 0.25, 0.25))),
            "tech_support": str(rng.choice(("Yes", "No"), p=(0.32, 0.68))),
            "online_security": str(rng.choice(("Yes", "No"), p=(0.36, 0.64))),
            "paperless_billing": str(rng.choice(("Yes", "No"), p=(0.62, 0.38))),
        }
        customers.append(_score(customer))
    return sorted(customers, key=lambda row: row["churn_probability"], reverse=True)


CUSTOMERS = _make_customer_sample()

app = FastAPI(
    title="Signal — Customer Churn Intelligence",
    description="Customer churn scoring and retention intelligence API.",
    version="1.0.0",
)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/customers", include_in_schema=False)
def customers_page() -> FileResponse:
    return FileResponse(ROOT / "static" / "customers.html")


@app.get("/insights", include_in_schema=False)
def insights_page() -> FileResponse:
    return FileResponse(ROOT / "static" / "insights.html")


@app.get("/campaigns", include_in_schema=False)
def campaigns_page() -> FileResponse:
    return FileResponse(ROOT / "static" / "campaigns.html")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": "random-forest-demo-v1"}


@app.get("/api/dashboard")
def dashboard() -> dict:
    high = [customer for customer in CUSTOMERS if customer["risk"] == "High"]
    at_risk = [customer for customer in CUSTOMERS if customer["risk"] in ("High", "Medium")]
    average_risk = sum(row["churn_probability"] for row in CUSTOMERS) / len(CUSTOMERS)
    monthly_revenue = sum(row["monthly_charges"] for row in CUSTOMERS)

    return {
        "total_customers": len(CUSTOMERS),
        "high_risk": len(high),
        "at_risk": len(at_risk),
        "average_risk": round(average_risk, 4),
        "revenue_at_risk": round(
            sum(row["monthly_charges"] for row in at_risk), 2
        ),
        "monthly_revenue": round(monthly_revenue, 2),
        "retention_opportunity": round(len(high) * 0.42),
        "risk_distribution": {
            band: sum(row["risk"] == band for row in CUSTOMERS)
            for band in ("High", "Medium", "Low")
        },
        "trend": [
            {"month": month, "rate": round(rate, 1)}
            for month, rate in zip(
                ("May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"),
                (29.4, 28.7, 30.1, 27.8, 26.9, 25.6, average_risk * 100),
            )
        ],
        "model": {
            "name": "Random Forest Classifier",
            "version": "demo-v1",
            "training_rows": 7500,
            "data_notice": "Starter model trained on synthetic data. Retrain on consented, representative customer data before business use.",
        },
    }


@app.get("/api/customers")
def customers(
    risk: Literal["All", "High", "Medium", "Low"] = Query("All"),
    search: str = Query("", max_length=100),
    limit: int = Query(100, ge=1, le=240),
) -> list[dict]:
    selected = CUSTOMERS
    if risk != "All":
        selected = [customer for customer in selected if customer["risk"] == risk]
    normalized_search = search.casefold().strip()
    if normalized_search:
        selected = [
            customer for customer in selected
            if normalized_search in customer["name"].casefold()
            or normalized_search in customer["id"].casefold()
        ]
    return selected[:limit]


@app.post("/api/predict")
def predict(request: PredictionRequest) -> dict:
    customer = request.model_dump()
    score = _score(customer)
    return {
        "probability": score["churn_probability"],
        "risk": score["risk"],
        "recommendations": score["recommendations"],
        "model": "random-forest-demo-v1",
    }


@app.get("/api/model")
def model_info() -> dict:
    classifier = MODEL.named_steps["classifier"]
    transformed_names = MODEL.named_steps["features"].get_feature_names_out()
    importances = classifier.feature_importances_
    feature_names = [name.split("__", maxsplit=1)[-1].replace("_", " ") for name in transformed_names]
    grouped_importances: dict[str, float] = {}
    for name, importance in zip(feature_names, importances):
        feature = name.split("=", maxsplit=1)[0].replace("_", " ")
        grouped_importances[feature] = grouped_importances.get(feature, 0.0) + float(importance)
    ranked = sorted(grouped_importances.items(), key=lambda item: item[1], reverse=True)
    return {
        "name": "Random Forest Classifier",
        "version": "demo-v1",
        "algorithm": "Random Forest",
        "training_rows": 7500,
        "features": len(grouped_importances),
        "trees": MODEL.named_steps["classifier"].n_estimators,
        "status": "Ready",
        "data_type": "Synthetic demo data",
        "top_features": [
            {"name": name, "importance": round(float(value), 4)}
            for name, value in ranked[:8]
        ],
        "notice": "Synthetic training data is for demonstration only. Validate and retrain with representative, consented customer data before production decisions.",
    }


@app.get("/api/customers/{customer_id}")
def customer_detail(customer_id: str) -> dict:
    for customer in CUSTOMERS:
        if customer["id"] == customer_id:
            return customer
    raise HTTPException(status_code=404, detail="Customer not found")


class CampaignCreate(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    audience: Literal["High", "Medium", "Low", "All"]
    channel: Literal["Email", "SMS", "Phone"]
    offer: str = Field(min_length=3, max_length=160)


class CampaignStatusUpdate(BaseModel):
    status: Literal["Draft", "Active", "Completed"]


def _campaign_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "audience": row["audience"],
        "channel": row["channel"],
        "offer": row["offer"],
        "status": row["status"],
        "audience_size": row["audience_size"],
        "created_at": row["created_at"],
    }


@app.get("/api/campaigns")
def list_campaigns() -> list[dict]:
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT * FROM campaigns ORDER BY id DESC"
        ).fetchall()
    return [_campaign_dict(row) for row in rows]


@app.post("/api/campaigns", status_code=201)
def create_campaign(campaign: CampaignCreate) -> dict:
    audience_size = sum(
        customer["risk"] == campaign.audience for customer in CUSTOMERS
    ) if campaign.audience != "All" else len(CUSTOMERS)
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with sqlite3.connect(DATABASE) as connection:
        cursor = connection.execute(
            """
            INSERT INTO campaigns (name, audience, channel, offer, status, audience_size, created_at)
            VALUES (?, ?, ?, ?, 'Draft', ?, ?)
            """,
            (
                campaign.name.strip(),
                campaign.audience,
                campaign.channel,
                campaign.offer.strip(),
                audience_size,
                created_at,
            ),
        )
        campaign_id = cursor.lastrowid
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            "SELECT * FROM campaigns WHERE id = ?", (campaign_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Campaign was created but could not be loaded")
    return _campaign_dict(row)


@app.patch("/api/campaigns/{campaign_id}")
def update_campaign_status(
    campaign_id: int, update: CampaignStatusUpdate
) -> dict:
    with sqlite3.connect(DATABASE) as connection:
        connection.execute(
            "UPDATE campaigns SET status = ? WHERE id = ?",
            (update.status, campaign_id),
        )
        if connection.total_changes == 0:
            raise HTTPException(status_code=404, detail="Campaign not found")
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            "SELECT * FROM campaigns WHERE id = ?", (campaign_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _campaign_dict(row)


@app.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int) -> dict:
    with sqlite3.connect(DATABASE) as connection:
        cursor = connection.execute(
            "DELETE FROM campaigns WHERE id = ?", (campaign_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Campaign not found")
    return {"deleted": True, "id": campaign_id}
