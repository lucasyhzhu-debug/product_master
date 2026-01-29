import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from backend.app.database import engine

def migrate():
    print("Migrating database for Phase 2...")
    with engine.connect() as conn:
        try:
            # Add columns to order
            queries = [
                "ALTER TABLE `order` ADD COLUMN delivery_type VARCHAR(20) DEFAULT 'Pickup'",
                "ALTER TABLE `order` ADD COLUMN pickup_location VARCHAR(100)",
                "ALTER TABLE `order` ADD COLUMN delivery_address VARCHAR(500)",
                "ALTER TABLE `order` ADD COLUMN contact_wa VARCHAR(50)",
                "ALTER TABLE `order` ADD COLUMN contact_ig VARCHAR(100)",
                "ALTER TABLE `order` ADD COLUMN shipping_agency VARCHAR(50)",
                "ALTER TABLE `order` ADD COLUMN shipping_number VARCHAR(100)",
                "ALTER TABLE `order` ADD COLUMN cancellation_reason VARCHAR(255)",
                
                # Add column to order_item
                "ALTER TABLE order_item ADD COLUMN menu_product_id INTEGER REFERENCES menu_product(id)"
            ]
            
            for query in queries:
                try:
                    conn.execute(text(query))
                    print(f"Executed: {query}")
                except Exception as e:
                    if "duplicate column name" in str(e):
                        print(f"Skipping already existing column: {query.split('ADD COLUMN')[1].split()[0]}")
                    else:
                        print(f"Error executing {query}: {e}")
            
            conn.commit()
            print("Migration complete!")
            
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
