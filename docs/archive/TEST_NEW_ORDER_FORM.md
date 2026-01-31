# Testing Guide: New Order Form with Sonner Toast Improvements

## Prerequisites
- ✅ Backend running on `http://localhost:8000`
- ✅ Frontend running on `http://localhost:5173`
- ✅ Fresh database (run seed if needed)

---

## Test Scenario 1: Successful Order Creation (Happy Path)

### Steps
1. Navigate to **Orders** → **New Order** dialog
2. **Customer Field:**
   - Type "Test Customer"
   - Click "Create 'Test Customer'" button in dropdown
   - (Optional) Enter phone: "08123456789"
3. **Channel & Sold By:**
   - Channel: Select "WA"
   - Sold By: Type "TestSeller" (will appear in suggestions)
4. **Due Date:**
   - Default is today - OK to leave as is
5. **Items:**
   - Product Name: "Bite Sized Double (90g)"
   - Qty: 1
   - Price: 70000
   - Discount: 0
6. **Delivery:**
   - Delivery Type: "Pickup"
   - Pickup Location: "Goldfinch Legato"
7. **Contact:**
   - Contact WA: "08123456789"
8. **Click "Create Order" button**

### Expected Results
✅ **Button State:**
- Text changes to "🔄 Creating Order..."
- Animated spinner appears
- Button becomes disabled
- Form stays visible (no blocking overlay)

✅ **Toast Notifications (Sequential):**
1. Loading: "Creating order for Test Customer..."
2. Success: "Order 0130-XXX created successfully! 🎉"
   - (Auto-dismisses after 3 seconds)

✅ **Form Reset:**
- All fields clear
- Ready for next order
- Modal can be closed

---

## Test Scenario 2: Validation Error - Missing Customer

### Steps
1. Open **New Order** dialog
2. **Skip Customer field** - leave empty
3. Fill in items:
   - Product Name: "Test Product"
   - Qty: 1
   - Price: 5000
4. **Click "Create Order" button**

### Expected Results
❌ **Toast Error:**
- Appears immediately: "Please fix the errors above"
- Red/error styling
- Does NOT submit form

✅ **Error Card Appears:**
- Below Customer field
- Contains: "ⓘ Please select an existing customer or create a new one"
- Light red background with red border
- Smooth fade-in

❌ **Form State:**
- Not submitted
- Values preserved (not cleared)
- Ready for correction

---

## Test Scenario 3: Validation Error - Missing Item Details

### Steps
1. Open **New Order** dialog
2. **Create customer:** Type "Test" → Click "Create 'Test'"
3. **Select Channel:** "IG"
4. **Leave Item fields empty/zero:**
   - Product Name: "" (empty)
   - Price: 0
   - Qty: 0
5. **Click "Create Order" button**

### Expected Results
❌ **Multiple Error Cards:**
- Toast: "Please fix the errors above"
- Error card appears in Items section:
  - "ⓘ Product name is required for all items"
  - (or specific price/quantity error)

✅ **Specific Error Messages:**
- If product name empty: "Product name is required for all items"
- If qty = 0: "Quantity must be greater than 0 for all items"
- If price = 0: "Please enter a price for all items"
- If price negative: "Price cannot be negative"

❌ **Form NOT submitted**

---

## Test Scenario 4: Validation Error - Zero Price

### Steps
1. Open **New Order** dialog
2. **Create customer:** "John"
3. **Fill items:**
   - Product Name: "Free Sample"
   - Qty: 5
   - Price: 0 (leave empty or set to 0)
4. **Click "Create Order" button**

### Expected Results
❌ **Error:**
- Toast: "Please fix the errors above"
- Error card: "ⓘ Please enter a price for all items"

✅ **Message is clear:**
- User knows they need to enter a price
- Not rejected with generic "invalid price" message

---

## Test Scenario 5: Validation Error - Negative Price

### Steps
1. Open **New Order** dialog
2. **Create customer**
3. **Fill items:**
   - Product Name: "Test"
   - Qty: 1
   - Price: -50000 (negative)
4. **Click "Create Order" button**

### Expected Results
❌ **Error:**
- Toast: "Please fix the errors above"
- Error card: "ⓘ Price cannot be negative"

---

## Test Scenario 6: Network/Server Error

### Steps
1. **Stop backend** (`Ctrl+C` on backend terminal)
2. Open **New Order** dialog
3. **Fill all fields correctly**
4. **Click "Create Order" button**

### Expected Results
❌ **Error Toast:**
- Shows: "❌ Error: [server error message]"
- Persists on screen (user can dismiss)
- Form NOT cleared

✅ **Button State:**
- Loading spinner stops
- Button text returns to "Create Order"
- Button becomes enabled again

✅ **User Can Retry:**
- Fix any issues
- Click "Create Order" again
- (Restart backend and try again)

---

## Test Scenario 7: Multiple Items

### Steps
1. Open **New Order** dialog
2. **Create customer:** "Bulk Order"
3. **Add first item:**
   - Product Name: "Snack Pack A"
   - Qty: 10
   - Price: 5000
4. **Click "+ Add" button**
5. **Add second item:**
   - Product Name: "Snack Pack B"
   - Qty: 5
   - Price: 8000
6. **Fill other required fields**
7. **Click "Create Order" button**

### Expected Results
✅ **Form Accepts Multiple Items:**
- Both items validate
- Price calculations show correct totals
- Order created with both items

✅ **Success Flow:**
- Toast: "Creating order for Bulk Order..."
- Then: "Order 0130-XXX created successfully! 🎉"

---

## Test Scenario 8: Create New Customer + Order (Together)

### Steps
1. Open **New Order** dialog
2. **Customer Field:**
   - Type a new name: "Siti Nurhaliza"
   - Click "Create 'Siti Nurhaliza'" in dropdown
   - Enter Phone: "+6281234567890"
3. **Fill rest of form**
4. **Click "Create Order" button**

### Expected Results
✅ **New Customer Created + Order:**
- Customer saved to database
- Order created for this customer
- Toast confirms order creation
- Future orders can reference this customer

✅ **Verification:**
- Go to Customers section
- Find "Siti Nurhaliza" in list
- See phone number saved

---

## Test Scenario 9: Cancel Order Creation

### Steps
1. Open **New Order** dialog
2. **Fill some fields**
3. **Click "Cancel" button** (top right X)

### Expected Results
✅ **Dialog Closes:**
- No form submission
- No toasts
- Data not saved

---

## Test Scenario 10: Loading State Performance

### Steps
1. Fill complete order form
2. Click "Create Order"
3. **Observe immediately:**
   - Button loading state activates instantly
   - Spinner rotates smoothly
   - Toast appears immediately
   - Form remains responsive
4. **Wait for submission:**
   - Don't close dialog
   - Watch toast state changes

### Expected Results
✅ **Smooth Loading Experience:**
- No lag or freezing
- Spinner rotates continuously
- Toast updates when ready
- No blocking overlays

---

## UI/UX Validation Checklist

- [ ] Error messages are prominently displayed with icon
- [ ] Error cards have light red background and red border
- [ ] Button shows animated spinner during loading
- [ ] Toast notifications appear in top-right corner
- [ ] Loading toast shows customer name dynamically
- [ ] Success toast shows order number and emoji
- [ ] Error toast shows specific error message
- [ ] Form doesn't submit on validation errors
- [ ] Form values are preserved on validation error
- [ ] Button is disabled while loading
- [ ] No full-screen blocking overlay appears
- [ ] User can interact with page while toast shows
- [ ] Toasts auto-dismiss appropriately (success) or persist (error)
- [ ] Error cards fade in smoothly
- [ ] All text is readable and accessible

---

## Edge Cases to Test

### Edge Case 1: Very Long Customer Name
- Customer name: "Muhammad Syah Alam Budi Setiawan"
- Expected: Error card wraps text properly, no overflow

### Edge Case 2: Special Characters
- Product name: "Snack @ 50% off"
- Expected: Accepts and displays correctly

### Edge Case 3: Very Large Price
- Price: 999999999
- Expected: Accepts (no upper limit validation currently)

### Edge Case 4: Decimal Prices
- Price: 5000.50
- Expected: Accepts decimals (if currency supports)

### Edge Case 5: Very Long Notes
- Notes: "This is a very long note about the order..."
- Expected: Text wraps in textarea, no overflow issues

---

## Performance Checklist

- [ ] Form loads within 1 second
- [ ] Click to submit is responsive (< 100ms to show spinner)
- [ ] Toast appears within 200ms
- [ ] No console errors
- [ ] No network errors
- [ ] Memory usage is stable
- [ ] No memory leaks on repeated form opens/closes

---

## Accessibility Checklist

- [ ] Error messages are semantic (color not only indicator)
- [ ] Info icon provides visual structure
- [ ] Spinner animation is smooth (not seizure-inducing)
- [ ] Contrast meets WCAG AA standards
- [ ] Tab order is logical
- [ ] Form fields have proper labels
- [ ] Disabled button state is clear
- [ ] Toast notifications are readable

---

## Browser Compatibility Testing

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Expected: All UI elements, animations, and toasts work consistently

---

## Next Steps After Testing

If all tests pass:
1. ✅ Commit changes to git
2. ✅ Update CHANGELOG.md
3. ✅ Deploy to staging
4. ✅ Notify team of improvements
5. ✅ Monitor production for any issues

If issues found:
1. ❌ Document issue details
2. ❌ Create bug report
3. ❌ Fix and retest
4. ❌ Get QA approval before merge
