import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..core.database import SessionLocal
from ..models.product import VendorProduct
from ..models.vendor import Vendor
from ..services.vendor_service import verify_vendor


async def check_vendor_availability():
    """Background task to check and update vendor product availability."""
    db = SessionLocal()
    try:
        # Get all active vendor products that haven't been verified in the last 24 hours
        cutoff_time = datetime.utcnow() - timedelta(hours=24)
        
        vendor_products = db.query(VendorProduct).filter(
            VendorProduct.is_active == True,
            VendorProduct.last_verified < cutoff_time
        ).all()
        
        for vendor_product in vendor_products:
            # In production, this would make API calls to vendors or check their systems
            # For now, we'll just update the last_verified timestamp
            # You can extend this to actually check with vendors
            
            # If stock is 0, mark as inactive
            if vendor_product.stock_quantity == 0:
                vendor_product.is_active = False
            
            vendor_product.last_verified = datetime.utcnow()
        
        db.commit()
        print(f"Checked {len(vendor_products)} vendor products")
    except Exception as e:
        print(f"Error checking vendor availability: {e}")
        db.rollback()
    finally:
        db.close()


async def verify_vendors_periodically():
    """Background task to periodically verify vendor information."""
    db = SessionLocal()
    try:
        # Get vendors that need re-verification (older than 30 days)
        cutoff_time = datetime.utcnow() - timedelta(days=30)
        
        vendors = db.query(Vendor).filter(
            Vendor.updated_at < cutoff_time
        ).all()
        
        for vendor in vendors:
            verify_vendor(vendor)
        
        db.commit()
        print(f"Verified {len(vendors)} vendors")
    except Exception as e:
        print(f"Error verifying vendors: {e}")
        db.rollback()
    finally:
        db.close()


async def run_background_tasks():
    """Run all background tasks periodically."""
    while True:
        try:
            await check_vendor_availability()
            await verify_vendors_periodically()
        except Exception as e:
            print(f"Error in background tasks: {e}")
        
        # Run every hour
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(run_background_tasks())


