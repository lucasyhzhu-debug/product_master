export const mockIngredients = {
  flour: {
    _id: 'ing_flour' as any,
    name: 'Wheat Flour',
    unitType: 'kg',
    volumePurchased: 25,
    priceExclShipping: 250000,
    shippingCost: 15000,
    costPerBaseUnit: 10.6, // (250000+15000)/25/1000 = 10.6 IDR/g
    baseUnit: 'g',
  },
  sugar: {
    _id: 'ing_sugar' as any,
    name: 'White Sugar',
    unitType: 'kg',
    volumePurchased: 50,
    priceExclShipping: 700000,
    shippingCost: 20000,
    costPerBaseUnit: 14.4, // (700000+20000)/50/1000 = 14.4 IDR/g
    baseUnit: 'g',
  },
  oil: {
    _id: 'ing_oil' as any,
    name: 'Cooking Oil',
    unitType: 'l',
    volumePurchased: 18,
    priceExclShipping: 360000,
    shippingCost: 0,
    costPerBaseUnit: 20, // 360000/18/1000 = 20 IDR/ml
    baseUnit: 'ml',
  },
}
