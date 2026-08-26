import assert from "node:assert/strict"
import test from "node:test"
import {
  classifyHardware,
  extractSpecs,
  normalizeBigCartelProduct,
  normalizeHtmlProduct,
  normalizePrestaProduct,
  normalizeShopifyProduct,
  normalizeWooProduct
} from "../src/normalizer.mjs"
import { extractCatalogPage } from "../src/html-catalog.mjs"

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
  assert.equal(classifyHardware({ productType: "Handelsware", title: "Bones Wheels 56mm 95A" }), "WHEELS")
  assert.equal(classifyHardware({ productType: "Skateboard", title: "Planche N4 Skateshop 8.25" }), "DECK")
  assert.equal(classifyHardware({ productType: "Deck", title: "Deck trottinette freestyle 22 pouces" }), null)
  assert.equal(classifyHardware({ productType: "Wheels", title: "Roues longboard 78A 70mm" }), null)
  assert.equal(classifyHardware({ productType: "tee-shirts", title: "Carhartt Deck Script Tee-shirt" }), null)
  assert.equal(classifyHardware({ productType: "roulements", title: "Bones Bearing Spacers pack de 4" }), null)
})

test("extrait diamètre, dureté, largeur et ABEC", () => {
  assert.deepEqual(extractSpecs("WHEELS", "Spitfire Formula Four 54mm 99D"), { diameterMm: 54, hardnessA: 99 })
  assert.deepEqual(extractSpecs("DECK", "Baker Deck 8.25\""), { widthInches: 8.25 })
  assert.deepEqual(extractSpecs("DECK", "Planche N4 Skateboard 8,375"), { widthInches: 8.375 })
  assert.deepEqual(extractSpecs("TRUCKS", "Independent 144 Truck 8.25\""), { dimension: "144", axleWidthInches: 8.25 })
  assert.deepEqual(extractSpecs("TRUCKS", "Film Truck Raw 5.25"), { hangerWidthInches: 5.25 })
  assert.deepEqual(extractSpecs("BEARINGS", "Andale ABEC 7"), { rating: "ABEC 7" })
  assert.deepEqual(extractSpecs("BEARINGS", "Enuff ABEC-7 pack de 8"), { rating: "ABEC 7" })
  assert.deepEqual(extractSpecs("WHEELS", "Quasi Protothane 53mm 83B"), { diameterMm: 53, hardnessA: 103 })
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
    variants: [{ id: 11, title: "Default Title", price: "69.90", compare_at_price: "89.90", available: true }]
  })
  assert.equal(products.length, 1)
  assert.equal(products[0].price, 69.9)
  assert.equal(products[0].regularPrice, 89.9)
  assert.equal(products[0].productUrl, "https://example.com/products/spitfire-52-101a")
  assert.deepEqual(products[0].specs, { diameterMm: 52, hardnessA: 101 })
  assert.equal(products[0].quantityForSetup, 1)
})

test("utilise une collection Shopify ciblée sans importer un longboard ou une trottinette", () => {
  const feed = { id: "shop", shop: "Petit Shop", baseUrl: "https://example.com" }
  const base = {
    id: 10,
    handle: "bones-wheels",
    product_type: "Handelsware",
    vendor: "Bones Wheels",
    tags: [],
    images: [{ src: "https://example.com/wheel.png" }],
    variants: [{ id: 11, title: "Default Title", price: "49.90", available: true }]
  }
  const [wheel] = normalizeShopifyProduct(feed, { ...base, title: "Bones X-Formula 54mm 97A" }, "WHEELS")
  assert.equal(wheel.componentType, "WHEELS")
  assert.deepEqual(normalizeShopifyProduct(feed, { ...base, title: "Roue trottinette 110mm" }, "WHEELS"), [])
})

test("retire les accessoires WooCommerce et compte deux trucks par setup", () => {
  const feed = { id: "shop", shop: "Petit Shop" }
  const base = {
    id: 10,
    is_in_stock: true,
    prices: { price: "3500", regular_price: "4500", currency_minor_unit: 2, currency_code: "EUR" },
    images: [{ src: "https://example.com/truck.png" }],
    permalink: "https://example.com/truck",
    attributes: []
  }
  assert.deepEqual(normalizeWooProduct(feed, "TRUCKS", { ...base, name: "Ace Baseplate Truck" }), [])
  assert.deepEqual(normalizeWooProduct(feed, "TRUCKS", { ...base, name: "Paris Truck 180mm" }), [])
  assert.deepEqual(normalizeWooProduct(feed, "BEARINGS", { ...base, name: "Nude Bearing 608 ABEC 5 x1" }), [])
  assert.deepEqual(normalizeWooProduct(feed, "BEARINGS", { ...base, name: "Roulement ABEC 3 vendu à l’unité" }), [])
  assert.deepEqual(normalizeWooProduct(feed, "BEARINGS", { ...base, name: "Bones Cream Speed Lubricant" }), [])
  const [truck] = normalizeWooProduct(feed, "TRUCKS", { ...base, name: "Independent Truck 144" })
  assert.equal(truck.quantityForSetup, 2)
  assert.equal(truck.regularPrice, 45)
})

test("normalise le flux JSON PrestaShop et retire les produits réellement indisponibles", () => {
  const feed = { id: "city", shop: "City Skateshop" }
  const product = {
    id_product: 42,
    active: "1",
    add_to_cart_url: "https://example.com/cart",
    name: "DGK Deck Guadalupe 8.25",
    manufacturer_name: "DGK",
    url: "https://example.com/deck-dgk",
    price_amount: 95,
    regular_price_amount: 109,
    cover: { bySize: { home_default: { url: "https://example.com/deck.jpg" } } }
  }
  const [deck] = normalizePrestaProduct(feed, "DECK", product)
  assert.equal(deck.brand, "DGK")
  assert.equal(deck.imageUrl, "https://example.com/deck.jpg")
  assert.equal(deck.productUrl, "https://example.com/deck-dgk")
  assert.equal(deck.regularPrice, 109)
  assert.deepEqual(deck.specs, { widthInches: 8.25 })
  assert.deepEqual(normalizePrestaProduct(feed, "DECK", { ...product, add_to_cart_url: null }), [])
  assert.equal(normalizePrestaProduct(feed, "DECK", { ...product, add_to_cart_url: null, quantity: 1 }).length, 1)
  const [opera] = normalizePrestaProduct(feed, "DECK", { ...product, name: "Opera Face EX7 Deck 8.5", manufacturer_name: undefined })
  assert.equal(opera.brand, "Opera")
})

test("normalise Big Cartel sans reprendre les articles en rupture ni les vêtements", () => {
  const feed = { id: "lockwood", shop: "Lockwood Skateshop", baseUrl: "https://example.com" }
  const product = {
    id: 10,
    name: "Spitfire Wheels Burner 99A 53mm",
    status: "active",
    price: 48,
    url: "/product/spitfire-burner",
    images: [{ url: "https://example.com/spitfire.jpg" }],
    categories: [{ name: "Skateboards" }],
    options: [{ id: 11, name: "Spitfire Wheels Burner 99A 53mm", price: 48, sold_out: false }]
  }
  const [wheel] = normalizeBigCartelProduct(feed, product)
  assert.equal(wheel.brand, "Spitfire")
  assert.equal(wheel.productUrl, "https://example.com/product/spitfire-burner")
  assert.deepEqual(wheel.specs, { diameterMm: 53, hardnessA: 99 })
  assert.deepEqual(normalizeBigCartelProduct(feed, { ...product, status: "sold-out" }), [])
  assert.deepEqual(normalizeBigCartelProduct(feed, { ...product, name: "LP Contrast Polo White" }), [])
})

test("lit les catégories publiques Magento et PrestaShop sans confondre stock et promotion", () => {
  const html = `
    <ol class="products list items product-items">
      <li class="item product product-item">
        <a class="product-item-photo" href="/deck-baker-825.html"><img src="/images/baker.jpg" alt="Baker Deck 8.25"></a>
        <strong class="product-item-name"><a class="product-item-link" href="/deck-baker-825.html">Baker Deck 8.25</a></strong>
        <span class="price-wrapper" data-price-amount="79.90"><span class="price">79,90&nbsp;€</span></span>
        <button>Ajouter au panier</button>
      </li>
      <li class="ajax_block_product item">
        <a class="product_img_link" href="/deck-santa-cruz.html"><img data-src="/images/santa.jpg" alt="Santa Cruz Deck 8.5"></a>
        <h2 class="product-name"><a href="/deck-santa-cruz.html">Santa Cruz Deck 8.5</a></h2>
        <span class="old-price"><span class="price">95,00 €</span></span>
        <span class="special-price"><span class="price">72,50 €</span></span>
        <span>Épuisé</span>
      </li>
    </ol>
    <a class="next" href="/skateboards/planches.html?p=2">Suivant</a>
  `

  const result = extractCatalogPage(html, "https://example.com/skateboards/planches.html")
  assert.equal(result.products.length, 2)
  assert.equal(result.products[0].price, 79.9)
  assert.equal(result.products[0].imageUrl, "https://example.com/images/baker.jpg")
  assert.equal(result.products[1].price, 72.5)
  assert.equal(result.products[1].regularPrice, 95)
  assert.equal(result.products[1].inStock, false)
  assert.equal(result.nextUrl, "https://example.com/skateboards/planches.html?p=2")

  const feed = { id: "magento", shop: "Magento Shop" }
  const [deck] = normalizeHtmlProduct(feed, "DECK", result.products[0])
  assert.equal(deck.brand, "Baker")
  assert.deepEqual(deck.specs, { widthInches: 8.25 })
  assert.deepEqual(normalizeHtmlProduct(feed, "DECK", result.products[1]), [])
})
