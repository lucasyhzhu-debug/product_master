import sys
import os
import json
import time
import urllib.request
import urllib.error
from datetime import datetime

# Add API URL
API_URL = "http://localhost:8002/api"

def make_request(method, url, data=None):
    headers = {'Content-Type': 'application/json'}
    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        req.data = json.dumps(data).encode('utf-8')
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status not in [200, 201, 204]:
                print(f"Error: {response.status}")
                return None
            if response.status == 204:
                return {}
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"Request Error: {e}")
        return None

def test_phase2():
    print("Verifying Phase 2: Order Management Enhancements...")
    
    # Check health with retry
    max_retries = 5
    for i in range(max_retries):
        try:
            with urllib.request.urlopen(f"{API_URL}/health") as response:
                if response.status == 200:
                    print("API is running!")
                    break
        except Exception:
            print(f"Waiting for API... ({i+1}/{max_retries})")
            time.sleep(2)
    else:
        print("API failed to start.")
        return

    # 1. Helper to get or create customer
    customer_data = {"name": "Test Customer Phase 2", "phone": "08123456789", "source": "WA"}
    print("Creating/Fetching Customer...")
    customer = make_request("POST", f"{API_URL}/customers", customer_data)
    
    if not customer:
        print("Trying to find existing customer...")
        # Simple list fetch since query param handling with urllib needs encoding
        customers = make_request("GET", f"{API_URL}/customers?q=Test%20Customer%20Phase%202")
        if customers and len(customers) > 0:
            customer_id = customers[0]["id"]
            print(f"Customer found: {customer_id}")
        else:
            print("Could not create or find customer.")
            return
    else:
        customer_id = customer["id"]
        print(f"Customer created/found: {customer_id}")

    # 2. Get Menu Products for ID
    products = make_request("GET", f"{API_URL}/menu-products")
    if not products:
        print("No menu products found (did you seed?)")
        return
    
    menu_product = products[0]
    print(f"Using Menu Product: {menu_product['name']} (ID: {menu_product['id']})")

    # 3. Create Order with New Fields
    order_data = {
        "customer_id": customer_id,
        "items": [
            {
                "product_name": menu_product['name'],
                "product_variant": "Standard",
                "quantity": 2,
                "unit_price": menu_product['default_price'],
                "unit_cost": 15000,
                "menu_product_id": menu_product['id']
            }
        ],
        "delivery_type": "Delivery",
        "delivery_address": "Test Address 123, Jakarta",
        "contact_wa": "08123456789",
        "shipping_agency": "JNE",
        "due_date": datetime.now().isoformat()
    }
    
    print("Creating Order...")
    order = make_request("POST", f"{API_URL}/orders", order_data)
    if not order:
        print("Failed to create order")
        return
    
    print(f"Order created: {order['order_number']}")
    
    # 4. Verify Fields
    assert order["delivery_type"] == "Delivery"
    assert order["delivery_address"] == "Test Address 123, Jakarta"
    assert order["contact_wa"] == "08123456789"
    assert order["items"][0]["menu_product_id"] == menu_product['id']
    print("New fields verified successfully ✅")

    # 5. Test Status Update
    print("Testing Status Update...")
    update_data = {"status": "Processing"}
    updated_order = make_request("PATCH", f"{API_URL}/orders/{order['id']}/status", update_data)
    if updated_order:
        print("Status updated to Processing ✅")

    # 6. Test Cancellation Reason
    print("Testing Cancellation...")
    cancel_data = {"status": "Cancelled", "cancellation_reason": "Out of stock"}
    updated_order = make_request("PATCH", f"{API_URL}/orders/{order['id']}/status", cancel_data)
    
    if updated_order and updated_order["status"] == "Cancelled" and updated_order["cancellation_reason"] == "Out of stock":
        print("Cancellation reason verified ✅")
    else:
        print(f"Failed cancellation verification: {updated_order}")

    print("Phase 2 Verification Complete!")

if __name__ == "__main__":
    test_phase2()
