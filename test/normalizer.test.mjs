import assert from "node:assert/strict"
import test from "node:test"
import { classifyHardware, extractSpecs, normalizeShopifyProduct, normalizeWooProduct } from "../src/normalizer.mjs"

test("classifie les quatre composants sans confondre une casquette trucker", () => {
  assert.equal(classifyHardware({ productType: "Roues", title: "Spitfire F4 54mm 99A" }), "WHEELS")
  assert.equal(classifyHardware({ productType: "Board", title: "Baker 8.25" }), "DECK")
  assert.equal(classifyHardware({ productType: "Trucks", title: "Independent 144" }), "TRUCKS")
  assert.equal(classifyHardware({ productType: "Bearings", title: "Bones Reds" }), "BEARINGS")
  assert.equal(classifyHardware({ productType: "Casquette", title: "Heroin Trucker Cap" }), null)
  assert.equal(classifyHardware({ productType: "bushings", title: "88 Wheel Co Gummies 95A" }), null)
  assert.equal(classifyHardware({ productType: "trucks", title: "Ace AF1 Inverted Baseplate" }), null)
  assert.equal(classifyHardware({ productType: "roulements", title: "Bones Speed Cream Lubrifiant" }), null)
  assert.equal(classifyHardware({ productType: "Bearings", title: "Bones Bearings Cleaning Unit" }), null)
})

test("extrait diamètre, dureté, largeur et ABEC", () => {
  assert.deepEqual(extractSpecs("WHEELS", "Spitfire Formula Four 54mm 99D"), { diameterMm: 54, hardnessA: 99 })
  assert.deepEqual(extractSpecs("DECK", "Baker Deck 8.25\""), { widthInches: 8.25 })
  assert.deepEqual(extractSpecs("TRUCKS", "Independent 144 Truck 8.25\""), { dimension: "144", axleWidthInches: 8.25 })
  assert.deepEqual(extractSpecs("TRUCKS", "Film Truck Raw 5.25"), { hangerWidthInches: 5.25 })
  assert.deepEqual(extractSpecs("BEARINGS", "Andale ABEC 7"), { rating: "ABEC 7" })
})

test("normalise une variante Shopify disponible avec son lien shop", () => {
  const feed = { id: "shop", shop: "Petit Shop", baseUrl: "https://example.com" }
  const products = normalizeShopifyProduct(feed, {
    id: 10,
    title: "Spitfire Wheels 52mm 101A",
    handle: "spitfire-52-101a",
    product_type: "Roues",
    vendor: "Spitfire",
    tags: ["52mm", "101A"],
    images: [{ src: "https://example.com/wheel.png" }],
    variants: [{ id: 11, title: "Default Title", price: "69.90", available: true }]
  })
  assert.equal(products.length, 1)
  assert.equal(products[0].price, 69.9)
  assert.equal(products[0].productUrl, "https://example.com/products/spitfire-52-101a")
  assert.deepEqual(products[0].specs, { diameterMm: 52, hardnessA: 101 })
  assert.equal(products[0].quantityForSetup, 1)
})

test("retire les accessoires WooCommerce et compte deux trucks par setup", () => {
  const feed = { id: "shop", shop: "Petit Shop" }
  const base = {
    id: 10,
    is_in_stock: true,
    prices: { price: "3500", currency_minor_unit: 2, currency_code: "EUR" },
    images: [{ src: "https://example.com/truck.png" }],
    permalink: "https://example.com/truck",
    attributes: []
  }
  assert.deepEqual(normalizeWooProduct(feed, "TRUCKS", { ...base, name: "Ace Baseplate Truck" }), [])
  assert.deepEqual(normalizeWooProduct(feed, "BEARINGS", { ...base, name: "Nude Bearing 608 ABEC 5 x1" }), [])
  assert.deepEqual(normalizeWooProduct(feed, "BEARINGS", { ...base, name: "Bones Cream Speed Lubricant" }), [])
  const [truck] = normalizeWooProduct(feed, "TRUCKS", { ...base, name: "Independent Truck 144" })
  assert.equal(truck.quantityForSetup, 2)
})
