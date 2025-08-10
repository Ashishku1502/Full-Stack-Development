from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
import os
from typing import List, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Idurar ERP CRM Integration API",
    description="Integration and reporting API for Idurar ERP CRM system",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection
client = None
db = None

# Pydantic models
class WebhookPayload(BaseModel):
    leadId: str = Field(..., description="Unique identifier for the lead")
    email: Optional[str] = Field(None, description="Lead email address")
    name: Optional[str] = Field(None, description="Lead name")
    company: Optional[str] = Field(None, description="Lead company")
    phone: Optional[str] = Field(None, description="Lead phone number")
    source: Optional[str] = Field("webhook", description="Lead source")
    metadata: Optional[dict] = Field({}, description="Additional metadata")

class SummaryResponse(BaseModel):
    queries: dict
    invoices: dict
    customers: dict
    generated_at: datetime

class WebhookResponse(BaseModel):
    success: bool
    message: str
    lead_id: str

# Database connection management
@app.on_event("startup")
async def startup_db_client():
    global client, db
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/idurar-erp-crm")
    client = AsyncIOMotorClient(mongo_uri)
    db = client.get_database()
    logger.info("Connected to MongoDB")

@app.on_event("shutdown")
async def shutdown_db_client():
    global client
    if client:
        client.close()
        logger.info("Disconnected from MongoDB")

# Health check endpoint
@app.get("/health")
async def health_check():
    try:
        # Test database connection
        await db.command("ping")
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow(),
            "database": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unhealthy")

# GET /integration/reports/summary - Generate summary reports
@app.get("/integration/reports/summary", response_model=SummaryResponse)
async def get_summary_report():
    try:
        # Query counts by status
        pipeline_queries = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        queries_by_status = await db.queries.aggregate(pipeline_queries).to_list(None)
        
        # Invoice totals by month
        pipeline_invoices = [
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$issueDate"}},
                "total": {"$sum": "$total"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": -1}},
            {"$limit": 12}
        ]
        invoices_by_month = await db.invoices.aggregate(pipeline_invoices).to_list(None)
        
        # Customer statistics
        pipeline_customers = [
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_revenue": {"$sum": "$totalRevenue"}
            }},
            {"$sort": {"_id": 1}}
        ]
        customers_by_status = await db.customers.aggregate(pipeline_customers).to_list(None)
        
        # Convert to dictionaries for easier consumption
        queries_dict = {item["_id"]: item["count"] for item in queries_by_status}
        invoices_dict = {item["_id"]: {"total": item["total"], "count": item["count"]} for item in invoices_by_month}
        customers_dict = {item["_id"]: {"count": item["count"], "total_revenue": item["total_revenue"]} for item in customers_by_status}
        
        return SummaryResponse(
            queries=queries_dict,
            invoices=invoices_dict,
            customers=customers_dict,
            generated_at=datetime.utcnow()
        )
        
    except Exception as e:
        logger.error(f"Error generating summary report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate summary report")

# POST /integration/webhook - Accept webhook payloads
@app.post("/integration/webhook", response_model=WebhookResponse)
async def webhook_handler(payload: WebhookPayload):
    try:
        # Store webhook data
        webhook_data = {
            "leadId": payload.leadId,
            "email": payload.email,
            "name": payload.name,
            "company": payload.company,
            "phone": payload.phone,
            "source": payload.source,
            "metadata": payload.metadata,
            "received_at": datetime.utcnow(),
            "processed": False
        }
        
        # Insert into webhooks collection
        result = await db.webhooks.insert_one(webhook_data)
        
        # Optionally create a customer record if email is provided
        if payload.email and payload.name:
            customer_data = {
                "name": payload.name,
                "email": payload.email,
                "phone": payload.phone,
                "company": payload.company,
                "status": "lead",
                "source": payload.source,
                "tags": ["webhook", "lead"],
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            
            # Check if customer already exists
            existing_customer = await db.customers.find_one({"email": payload.email})
            if not existing_customer:
                await db.customers.insert_one(customer_data)
                logger.info(f"Created new customer from webhook: {payload.email}")
        
        return WebhookResponse(
            success=True,
            message="Webhook processed successfully",
            lead_id=payload.leadId
        )
        
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        raise HTTPException(status_code=500, detail="Failed to process webhook")

# GET /integration/queries/analytics - Query analytics
@app.get("/integration/queries/analytics")
async def get_query_analytics(
    days: int = Query(30, description="Number of days to analyze"),
    status: Optional[str] = Query(None, description="Filter by status")
):
    try:
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Build match conditions
        match_conditions = {
            "createdAt": {"$gte": start_date, "$lte": end_date}
        }
        if status:
            match_conditions["status"] = status
        
        pipeline = [
            {"$match": match_conditions},
            {"$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "status": "$status",
                    "priority": "$priority"
                },
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id.date": 1}}
        ]
        
        analytics = await db.queries.aggregate(pipeline).to_list(None)
        
        return {
            "period": f"Last {days} days",
            "analytics": analytics,
            "generated_at": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Error generating query analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate analytics")

# GET /integration/invoices/revenue - Revenue analytics
@app.get("/integration/invoices/revenue")
async def get_revenue_analytics(
    months: int = Query(6, description="Number of months to analyze")
):
    try:
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=months * 30)
        
        pipeline = [
            {"$match": {
                "issueDate": {"$gte": start_date, "$lte": end_date},
                "status": {"$in": ["Paid", "Sent"]}
            }},
            {"$group": {
                "_id": {
                    "year": {"$year": "$issueDate"},
                    "month": {"$month": "$issueDate"}
                },
                "total_revenue": {"$sum": "$total"},
                "invoice_count": {"$sum": 1},
                "avg_invoice_value": {"$avg": "$total"}
            }},
            {"$sort": {"_id.year": 1, "_id.month": 1}}
        ]
        
        revenue_data = await db.invoices.aggregate(pipeline).to_list(None)
        
        return {
            "period": f"Last {months} months",
            "revenue_data": revenue_data,
            "generated_at": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Error generating revenue analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate revenue analytics")

# GET /integration/customers/top - Top customers by revenue
@app.get("/integration/customers/top")
async def get_top_customers(
    limit: int = Query(10, description="Number of top customers to return")
):
    try:
        pipeline = [
            {"$match": {"totalRevenue": {"$gt": 0}}},
            {"$sort": {"totalRevenue": -1}},
            {"$limit": limit},
            {"$project": {
                "name": 1,
                "email": 1,
                "company": 1,
                "totalRevenue": 1,
                "status": 1
            }}
        ]
        
        top_customers = await db.customers.aggregate(pipeline).to_list(None)
        
        return {
            "top_customers": top_customers,
            "generated_at": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Error fetching top customers: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch top customers")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
