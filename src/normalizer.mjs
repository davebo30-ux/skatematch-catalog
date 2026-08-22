const COMPONENTS = new Set(["DECK", "TRUCKS", "WHEELS", "BEARINGS"])

function excludedHardware(text, componentType = "") {
  const normalized = plain(text)
  const excluded = /\b(complete|complet|longboard|surfskate|fingerboard|keychain|porte cles|trucker cap|bushing|bushings|gomme pivot|baseplate|re threader|lubrifiant|lubricant|speed cream|cleaning unit|bearings? lub|cream)\b/
  if (excluded.test(normalized)) return true
  return componentType === "BEARINGS" && /\b(?:x\s*1|1\s*roulement|single bearing)\b/.test(normalized)
}

export function plain(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.,'"”″\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function classifyHardware({ productType = "", title = "", tags = [] }) {
  const type = plain(productType)
  const haystack = plain(`${title} ${tags.join(" ")}`)
  if (excludedHardware(`${type} ${haystack}`)) return null

  if (/^(plateau|plateaux|deck|decks|board|boards)$/.test(type)) return "DECK"
  if (/^(truck|trucks)$/.test(type)) return "TRUCKS"
  if (/^(roue|roues|wheel|wheels)$/.test(type)) return "WHEELS"
  if (/^(roulement|roulements|bearing|bearings)$/.test(type)) return "BEARINGS"

  // Certains thèmes Shopify utilisent seulement « Skateboard » comme type.
  // Dans ce cas (ou sans type), le titre et les tags servent de repli.
  if (type && !/^(skateboard|skateboards)$/.test(type)) return null
  if (/\b(plateau|plateaux|deck|decks|board)\b/.test(haystack)) return "DECK"
  if (/\b(truck|trucks)\b/.test(haystack)) return "TRUCKS"
  if (/\b(roue|roues|wheel|wheels)\b/.test(haystack)) return "WHEELS"
  if (/\b(roulement|roulements|bearing|bearings)\b/.test(haystack)) return "BEARINGS"
  return null
}

function firstNumber(text, regex, min, max) {
  const match = plain(text).match(regex)
  if (!match) return null
  const number = Number(match[1].replace(",", "."))
  return number >= min && number <= max ? number : null
}

export function extractSpecs(componentType, text) {
  const specs = {}
  const normalized = plain(text)

  if (componentType === "WHEELS") {
    const diameter = firstNumber(normalized, /(?:^|\D)(\d{2}(?:[.,]\d+)?)\s*mm\b/, 45, 80)
    const hardness = firstNumber(normalized, /\b(\d{2,3})\s*[ad]\b/, 70, 105)
    if (diameter) specs.diameterMm = diameter
    if (hardness) specs.hardnessA = hardness
  }

  if (componentType === "DECK") {
    const width = firstNumber(normalized, /\b(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:"|”|″|inches?\b|inch\b)/, 6, 12)
    if (width) specs.widthInches = width
  }

  if (componentType === "TRUCKS") {
    const dimension = normalized.match(/\b(109|129|135|139|144|145|149|155|159|169|215|225|235|245|255)\s*(?:mm)?\b/)
    if (dimension) specs.dimension = dimension[1]
    const axleWidth = firstNumber(normalized, /\b(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:"|”|″|inches?\b|inch\b)/, 6, 12)
    if (axleWidth) specs.axleWidthInches = axleWidth
    const hangerWidth = firstNumber(normalized, /(?:^|\s)(5(?:[.,](?:0|00|25|5|50|75))?|6(?:[.,](?:0|00))?)(?:\s|$)/, 4, 7)
    if (hangerWidth) specs.hangerWidthInches = hangerWidth
  }

  if (componentType === "BEARINGS") {
    const abec = normalized.match(/\babec\s*([3579])\b/)
    if (abec) specs.rating = `ABEC ${abec[1]}`
    else if (/\bswiss\b/.test(normalized)) specs.rating = "Swiss"
    else if (/\b(skate rated|reds)\b/.test(normalized)) specs.rating = "Skate Rated"
  }

  return specs
}

function canonicalKey(product) {
  const specPart = Object.entries(product.specs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("|")
  return plain(`${product.componentType}|${product.brand}|${product.name}|${specPart}`)
}

export function normalizeShopifyProduct(feed, product) {
  const componentType = classifyHardware({
    productType: product.product_type,
    title: product.title,
    tags: product.tags || []
  })
  if (!componentType || !COMPONENTS.has(componentType)) return []
  if (excludedHardware(product.title, componentType)) return []

  const variants = (product.variants || []).filter(variant => variant.available !== false)
  if (!variants.length) return []
  const imageUrl = product.images?.[0]?.src || product.image?.src || ""

  return variants.map(variant => {
    const variantLabel = variant.title && variant.title !== "Default Title" ? variant.title : ""
    const relevantTags = componentType === "TRUCKS" ? "" : (product.tags || []).join(" ")
    const specText = `${product.title} ${variantLabel} ${relevantTags}`
    const item = {
      id: `${feed.id}:shopify:${variant.id || product.id}`,
      source: feed.id,
      sourceProductId: String(product.id),
      componentType,
      brand: product.vendor || "Sans marque",
      name: variantLabel ? `${product.title} · ${variantLabel}` : product.title,
      imageUrl,
      productUrl: `${feed.baseUrl}/products/${product.handle}`,
      shop: feed.shop,
      price: Number(variant.price),
      currency: "EUR",
      inStock: true,
      quantityForSetup: componentType === "TRUCKS" ? 2 : 1,
      specs: extractSpecs(componentType, specText)
    }
    return { ...item, canonicalKey: canonicalKey(item) }
  }).filter(item => Number.isFinite(item.price) && item.price > 0)
}

export function normalizeWooProduct(feed, componentType, product) {
  if (!COMPONENTS.has(componentType) || product.is_in_stock === false) return []
  if (excludedHardware(product.name, componentType)) return []
  const brand = product.attributes?.find(attribute => plain(attribute.name) === "brand")?.terms?.[0]?.name || "Sans marque"
  const minorUnit = product.prices?.currency_minor_unit ?? 2
  const rawPrice = product.prices?.price
  const price = rawPrice == null ? Number.NaN : Number(rawPrice) / (10 ** minorUnit)
  const item = {
    id: `${feed.id}:woo:${product.id}`,
    source: feed.id,
    sourceProductId: String(product.id),
    componentType,
    brand,
    name: product.name,
    imageUrl: product.images?.[0]?.src || "",
    productUrl: product.permalink,
    shop: feed.shop,
    price,
    currency: product.prices?.currency_code || "EUR",
    inStock: product.is_in_stock !== false,
    quantityForSetup: componentType === "TRUCKS" ? 2 : 1,
    specs: extractSpecs(componentType, `${product.name} ${(product.attributes || []).flatMap(attribute => attribute.terms || []).map(term => term.name).join(" ")}`)
  }
  return Number.isFinite(price) && price > 0 ? [{ ...item, canonicalKey: canonicalKey(item) }] : []
}
