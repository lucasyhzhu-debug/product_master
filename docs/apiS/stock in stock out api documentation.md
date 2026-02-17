
Get command pulls the details of our company from k3mart - just for information 
https://consapi.k3mart.id/api/v1/vendor-profile/get

response:
{
    "success": true,
    "meta": {
        "success": true
    },
    "data": {
        "id": 3131,
        "outlet_id": 47,
        "vendor_code": "F03131",
        "name": "(K) (G) RISTIANA ETENG",
        "phone": "81380830006",
        "email": "malostudio.id@gmail.com",
        "account_name": "PT Malo Group Bahagia",
        "account_number": "6044 830 994",
        "bank_name": "BCA",
        "is_agree_tnc": 1,
        "category_id": 2
    }
}

Get-outlet API receives all the stores which we have product planned for (this should be our core store database and the data should be stored in our database
https://consapi.k3mart.id/api/v1/vendor-profile/get-outlet
response: the key data fiels are outlet_id, linked to outlet_name < human readable version of the outlet_id, outlet_id is the id we can use to map our other apis  
{
    "success": true,
    "meta": {
        "success": true
    },
    "data": [
        {
            "id": 58801,
            "outlet_id": 47,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-02-06",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-02-06",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-02-06T03:00:15.000Z",
            "updatedAt": "2026-02-06T03:00:27.000Z",
            "outlet_name": "JKT-BINTARO"
        },
        {
            "id": 58370,
            "outlet_id": 45,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-01-30",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-01-30",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-01-30T07:54:59.000Z",
            "updatedAt": "2026-01-30T07:55:03.000Z",
            "outlet_name": "JKT-GADING SERPONG"
        },
        {
            "id": 58799,
            "outlet_id": 48,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-02-06",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-02-06",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-02-06T02:59:00.000Z",
            "updatedAt": "2026-02-06T02:59:07.000Z",
            "outlet_name": "JKT-KOTA KASABLANKA"
        },
        {
            "id": 58796,
            "outlet_id": 57,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-02-06",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-02-06",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-02-06T02:55:54.000Z",
            "updatedAt": "2026-02-06T02:56:04.000Z",
            "outlet_name": "JKT-LIPPO PURI"
        },
        {
            "id": 58803,
            "outlet_id": 78,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-02-06",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-02-06",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-02-06T03:01:19.000Z",
            "updatedAt": "2026-02-06T03:01:26.000Z",
            "outlet_name": "JKT-LM NUSANTARA"
        },
        {
            "id": 58797,
            "outlet_id": 53,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-02-06",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-02-06",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-02-06T02:56:56.000Z",
            "updatedAt": "2026-02-06T02:57:05.000Z",
            "outlet_name": "JKT-OLD SHANGHAI"
        },
        {
            "id": 58798,
            "outlet_id": 44,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-02-06",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-02-06",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-02-06T02:58:04.000Z",
            "updatedAt": "2026-02-06T02:58:12.000Z",
            "outlet_name": "JKT-SCBD"
        },
        {
            "id": 58369,
            "outlet_id": 81,
            "vendor_id": 3131,
            "createdby_id": 1007,
            "createdby_pos": "AdelliaAura Ardana",
            "handledby_id": 1007,
            "handledby_pos": "AdelliaAura Ardana",
            "period": 1,
            "start_date": "2026-01-31",
            "end_date": "2026-03-02",
            "status": "approved",
            "approved_at": "2026-01-30",
            "rejected_at": null,
            "canceled_at": null,
            "payment_proof": null,
            "payment_rule": null,
            "upload_date": "2026-01-30",
            "has_extended": null,
            "taxType": "I",
            "price": 500000,
            "DPP": 0,
            "PPN": 0,
            "discount": 500000,
            "final_price": 0,
            "createdAt": "2026-01-30T07:54:31.000Z",
            "updatedAt": "2026-01-30T07:54:35.000Z",
            "outlet_name": "JKT-TAMTEM"
        }
    ]
}


get list of all products held in this outletid for this account 
https://consapi.k3mart.id/api/v1/vendor-stock/get-dashboard?outletId=47&page=1&pageSize=10&order=-quantity
outletId=47&page=1&pageSize=10&order=-quantity
response: you can see the vendor id which is our vendor id, and also the product code and name which are unique ids of our product and human name, the image is just a visual
{
    "success": true,
    "meta": {
        "success": true
    },
    "data": {
        "data": [
            {
                "id": 115432,
                "outlet_id": 47,
                "product_id": 47069,
                "price": 0,
                "quantity": 0,
                "price_grabfood_gofood": 0,
                "price_grabmart": 0,
                "price_shopee": 0,
                "created_at": "2026-02-07T07:48:03.000Z",
                "updated_at": "2026-02-07T07:48:03.000Z",
                "product.capital": 0,
                "product.vendor_id": 3131,
                "product.photo": null,
                "product.product_code": "F03131-P00002",
                "product.product_name": "Dubai Chewy Cookie",
                "product.productImage": "uploads/consignmentproducts/Jan2026/pulCl2bEkQ4cPgVPIhGjvQks2n1CM9HrloNA.jpeg"
            }
        ],
        "pagination": {
            "page": "1",
            "pageSize": "10",
            "count": 1
        }
    }
}



Gets list of all the stock ins and outs for that specific location (outlet_id) and returns the list < we care about the last 4 requests pending or not 
https://consapi.k3mart.id/api/v1/vendor-stock-flow/get-list?order=-id&outletId=47&page=1&pageSize=10&adjustment=false
order=-id&outletId=47&page=1&pageSize=10&adjustment=false
{
    "success": true,
    "meta": {
        "success": true
    },
    "data": {
        "data": [
            {
                "id": 327126,
                "outlet_id": 47,
                "vendor_id": 3131,
                "handledby_id": null,
                "handledby_pos": null,
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "pending",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": null,
                "created_at": "2026-02-07T10:48:26.000Z",
                "updated_at": "2026-02-07T10:48:26.000Z",
                "admin.name": null,
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 327003,
                "outlet_id": 47,
                "vendor_id": 3131,
                "handledby_id": null,
                "handledby_pos": null,
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "canceled",
                "canceled_at": "2026-02-07T10:48:09.000Z",
                "rejected_at": null,
                "approved_at": null,
                "created_at": "2026-02-07T07:48:03.000Z",
                "updated_at": "2026-02-07T10:48:09.000Z",
                "admin.name": null,
                "vendor.name": "(K) (G) RISTIANA ETENG"
            }
        ],
        "pagination": {
            "page": "1",
            "pageSize": "10",
            "count": 2
        }
    }
}


pulls the details of the stock-in/ stock out for taht specific id noted in 'id' in the stock-in/ stock out api previously < we care about the stock product name, and quantity, and price - this shows us what we're actually planning to stock in / out at the place
https://consapi.k3mart.id/api/v1/vendor-stock-flow/get-list-by-id?requestId=327126
requestId=327126
{
    "success": true,
    "meta": {
        "success": true
    },
    "data": [
        {
            "id": 936387,
            "stock_id": 115432,
            "stockflowrequest_id": 327126,
            "price": 45000,
            "quantity": 18,
            "price_grabfood_gofood": 0,
            "price_grabmart": 0,
            "price_shopee": 0,
            "createdAt": "2026-02-07T10:48:26.000Z",
            "updatedAt": "2026-02-07T10:48:26.000Z",
            "stock.stock_quantity": 0,
            "stock.stock_price": 0,
            "stock.product.id": 47069,
            "stock.product.product_name": "Dubai Chewy Cookie",
            "stock.product.product_code": "F03131-P00002",
            "stock.product.barcode": "00313100002"
        }
    ]
}

This is another example of a detailed report of all the stock ins and stock outs for the gading serpong store (outletid=45)
https://consapi.k3mart.id/api/v1/vendor-stock-flow/get-list?order=-id&outletId=45&page=1&pageSize=10&adjustment=false
order=-id&outletId=45&page=1&pageSize=10&adjustment=false

interesting thing to note is request_type = 0 is a stockout, and request_type = 1 is a stock in
Status is key as well it shows whether it was cancelled or approved 
{
    "success": true,
    "meta": {
        "success": true
    },
    "data": {
        "data": [
            {
                "id": 328175,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "VONNY SEPTIANINGSIH",
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-10T00:00:00.000Z",
                "created_at": "2026-02-10T04:56:59.000Z",
                "updated_at": "2026-02-10T04:57:17.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 328034,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": null,
                "handledby_pos": null,
                "request_type": 1,
                "note": "NEWSTOCK_ARRIVAL",
                "internal_note": null,
                "status": "canceled",
                "canceled_at": "2026-02-10T04:57:30.000Z",
                "rejected_at": null,
                "approved_at": null,
                "created_at": "2026-02-09T17:21:34.000Z",
                "updated_at": "2026-02-10T04:57:30.000Z",
                "admin.name": null,
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 327000,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "MUHAMAD SOBRI HIDAYAT",
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-07T00:00:00.000Z",
                "created_at": "2026-02-07T07:46:50.000Z",
                "updated_at": "2026-02-07T07:47:11.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326938,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "MUHAMAD SOBRI HIDAYAT",
                "request_type": 0,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-07T00:00:00.000Z",
                "created_at": "2026-02-07T06:08:01.000Z",
                "updated_at": "2026-02-07T06:20:49.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326937,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": null,
                "handledby_pos": null,
                "request_type": 0,
                "note": "Taking out of shop - Eteng",
                "internal_note": null,
                "status": "canceled",
                "canceled_at": "2026-02-07T06:07:45.000Z",
                "rejected_at": null,
                "approved_at": null,
                "created_at": "2026-02-07T06:07:11.000Z",
                "updated_at": "2026-02-07T06:07:45.000Z",
                "admin.name": null,
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326795,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "MUHAMAD SOBRI HIDAYAT",
                "request_type": 0,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-07T00:00:00.000Z",
                "created_at": "2026-02-07T03:46:59.000Z",
                "updated_at": "2026-02-07T03:49:09.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326594,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "RIZKY MAULIDANI",
                "request_type": 0,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-06T00:00:00.000Z",
                "created_at": "2026-02-06T14:27:20.000Z",
                "updated_at": "2026-02-06T14:27:53.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326593,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "RIZKY MAULIDANI",
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-06T00:00:00.000Z",
                "created_at": "2026-02-06T14:25:37.000Z",
                "updated_at": "2026-02-06T14:25:46.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326591,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": 1007,
                "handledby_pos": "RIZKY MAULIDANI",
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "approved",
                "canceled_at": null,
                "rejected_at": null,
                "approved_at": "2026-02-06T00:00:00.000Z",
                "created_at": "2026-02-06T14:11:06.000Z",
                "updated_at": "2026-02-06T14:19:39.000Z",
                "admin.name": "Pos K3 Mart",
                "vendor.name": "(K) (G) RISTIANA ETENG"
            },
            {
                "id": 326524,
                "outlet_id": 45,
                "vendor_id": 3131,
                "handledby_id": null,
                "handledby_pos": null,
                "request_type": 1,
                "note": null,
                "internal_note": null,
                "status": "canceled",
                "canceled_at": "2026-02-06T14:10:37.000Z",
                "rejected_at": null,
                "approved_at": null,
                "created_at": "2026-02-06T10:54:51.000Z",
                "updated_at": "2026-02-06T14:10:37.000Z",
                "admin.name": null,
                "vendor.name": "(K) (G) RISTIANA ETENG"
            }
        ],
        "pagination": {
            "page": "1",
            "pageSize": "10",
            "count": 13
        }
    }
}



KEY API: stock in example  POST request method
https://consapi.k3mart.id/api/v1/vendor-stock-flow/add
This api adds the stock in or stock out for the store - with the detail of what they're adding - very important to have this work for us
payload < PAY ATTENTION HERE
{"outletId":57,"header":{"requestType":1,"note":"Pierre"},"detail":[{"productId":47069,"productName":"Dubai Chewy Cookie","productCode":"F03131-P00002","qty":30,"price":45000,"currentStock":0,"currentPrice":45000,"edit":false}]}
NOTE THAT CURRENT STOCK AND CURRENT PRICE MUST BE EXACTLY WHAT WE KNOW IS THE CURRENT STOCK AND PRICE < IF THIS IS A NEW LOCATION THEN WE CAN ASSUME IT'S 0 FOR BOTH
parsed so we can see what's going on 
{outletId: 57, header: {requestType: 1, note: "Pierre"},…}  outletID we know it's the store id - we need this, requesttype 1 - stock-in; request type 0 = stockout (i'll give example later), note is good we should allow for notes in our input
detail
: 
[{productId: 47069, productName: "Dubai Chewy Cookie", productCode: "F03131-P00002", qty: 30,…}] << this is where we input our product - details are productID which we have saved already, product name should be exactlywhat k3mart has, product code is also saved for us, quantity is KEY this is what we are planning to stock into that location it's what we need an input for.
header
: 
{requestType: 1, note: "Pierre"}
outletId
: 
57

This should be the response: all True is good 
{"success":true,"meta":{"success":true},"data":true}

EXAMPLE 2 of Stock IN POST request method
https://consapi.k3mart.id/api/v1/vendor-stock-flow/add
this is for outlet 53 ('JKT-OLD SHANGHAI') A NEW LOCATION < NOTE CURRENT STOCK AND CURRENT PRICE IS 0 BECAUSE THIS IS THE NEW LOCATION
{"outletId":53,"header":{"requestType":1,"note":"Pierre"},"detail":[{"productId":47069,"productName":"Dubai Chewy Cookie","productCode":"F03131-P00002","qty":20,"price":"45000","currentStock":0,"currentPrice":0,"edit":false}]}
response 
{"success":true,"meta":{"success":true},"data":true}

EXAMPLE 3: STOCK OUT of OUTLET 48 (JKT-KOTA KASABLANKA) 14 x DUBAI CHEWY COOKIES << WE NEED TO HAVE A BUTTON TO STOCK OUT A LOCATION AS WELL
https://consapi.k3mart.id/api/v1/vendor-stock-flow/add
Request Method
POST
HEADER: NOTE REQUESTTYPE IS NOW 0, AND THE DETAILS ARE STILL SIMILAR FOR PRODUCT DETAIL, THE QTY OF 14 IS WHAT WE ARE NOW TAKING OUT OF THAT OUTLET 
{"outletId":48,"header":{"requestType":0},"detail":[{"productName":"Dubai Chewy Cookie","qty":14,"price":45000,"priceGrab":0,"priceGrabMart":0,"priceShopee":0,"currentStock":14,"edit":false,"productId":47069,"productCode":"F03131-P00002","currentPrice":45000}]}

RESPONSE SHOULD BE:
{"success":true,"meta":{"success":true},"data":true}


example 4 payload opnly: stock in 30 at jkt-scbd outlet_id 44
{"outletId":44,"header":{"requestType":1,"note":"pierre"},"detail":[{"productId":47069,"productName":"Dubai Chewy Cookie","productCode":"F03131-P00002","qty":30,"price":45000,"currentStock":0,"currentPrice":45000,"edit":false}]}



Cancelling a stock in /out :
This one you need the ID of the original stock-in/out which should be easily readable from the stocklist api above 
this one uses a simple put https://consapi.k3mart.id/api/v1/vendor-stock-flow/cancel/327126


response: 
{"success":true,"meta":{"success":true},"data":[1]}