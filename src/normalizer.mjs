const COMPONENTS = new Set(["DECK", "TRUCKS", "WHEELS", "BEARINGS"])
const KNOWN_BRANDS = [
  ["the national skateboard co", "The National Skateboard Co"],
  ["the national skateboards", "The National Skateboard Co"],
  ["the national skate co", "The National Skateboard Co"],
  ["powell peralta", "Powell Peralta"],
  ["santa cruz", "Santa Cruz"],
  ["mini logo", "Mini Logo"],
  ["heart supply", "Heart Supply"],
  ["bronson speed co", "Bronson Speed Co"],
  ["independent", "Independent"],
  ["spitfire", "Spitfire"],
  ["bones", "Bones"],
  ["element", "Element"],
  ["thunder", "Thunder"],
  ["venture", "Venture"],
  ["slappy", "Slappy"],
  ["quasi", "Quasi"],
  ["baker", "Baker"],
  ["real", "Real"],
  ["haze", "Haze"],
  ["ace", "Ace"],
  ["dgk", "DGK"]
]

function excludedHardware(text, componentType = "") {
  const normalized = plain(text)
  const excluded = /\b(complete|complet|complets|longboards?|longskates?|surfskates?|fingerboards?|fingerskates?|trottinettes?|scooters?|rollers?|inline|bmx|keychain|porte cles|trucker cap|t[- ]?shirts?|tee[- ]?shirts?|polo|hoodie|sweatshirt|casquettes?|shoe goo|bushings?|gomme pivot|pivot cups?|cups? de pivot|baseplate|kingpins?|re[- ]?threaders?|rethreaders?|lubrifiants?|lubricants?|speed cream|cleaning unit|cleaners?|nettoyants?|nettoyage|bearings? lub|lubes?|cream|spacers?|entretoises?|bearing press|bearing saver|(?:t[- ]?)tools?|ecrous?|axle nuts?|riser(?: pads?)?|shock pads?|bolts|visserie|ressorts?|springs?|washers?|deck display|wall hanger|rails?|pins?)\b/
  if (excluded.test(normalized)) return true
  if (/\bvendu(?:e|s|es)? a l'? ?unite\b/.test(normalized)) return true
  if (componentType === "TRUCKS" && /\b(180|184|190|195|200)\s*mm\b|\breverse kingpin\b/.test(normalized)) return true
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
  const values = Array.isArray(tags) ? tags : String(tags).split(",")
  const titleText = plain(title)
  const haystack = plain(`${title} ${values.join(" ")}`)
  if (excludedHardware(`${type} ${haystack}`)) return null

  if (/\b(plateau|plateaux|planche|planches|deck|decks|board|boards)\b/.test(type)) return "DECK"
  if (/\b(truck|trucks)\b/.test(type)) return "TRUCKS"
  if (/\b(roue|roues|wheel|wheels)\b/.test(type)) return "WHEELS"
  if (/\b(roulement|roulements|bearing|bearings)\b/.test(type)) return "BEARINGS"

  if (type && !/^(skateboard|skateboards|handelsware|marchandise|marchandises|hardware)$/.test(type)) return null

  // Plusieurs boutiques utilisent « Skateboard », « Handelsware » ou une
  // catégorie vide pour tous leurs articles : le nom réel reste prioritaire.
  for (const text of [titleText, haystack]) {
    if (/\b(roulement|roulements|bearing|bearings)\b/.test(text)) return "BEARINGS"
    if (/\b(roue|roues|wheel|wheels)\b/.test(text)) return "WHEELS"
    if (/\b(truck|trucks)\b/.test(text)) return "TRUCKS"
    if (/\b(plateau|plateaux|planche|planches|deck|decks|board|boards)\b/.test(text)) return "DECK"
  }

  if (/\bskateboards?\b/.test(type) && /\b(?:7|8|9)(?:[.,]\d{1,3})\b/.test(titleText)) return "DECK"
  return null
}

function inferBrand(name, fallback = "") {
  if (fallback && !/\b(distribution|distributeur|wholesale|sans marque|no brand)\b/i.test(fallback)) return fallback.trim()
  const normalized = plain(name)
  const known = KNOWN_BRANDS.find(([needle]) => new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized))
  if (known) return known[1]
  const withoutCategory = name.replace(/^\s*(?:decks?|plateaux?|planches?|roues?|roulements?|wheels?|trucks?|bearings?)\s+(?:de\s+skateboard\s+)?/i, "")
  return withoutCategory.trim().split(/\s+/)[0] || "Sans marque"
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
    const aScale = firstNumber(normalized, /\b(\d{2,3})\s*[ad]\b/, 70, 105)
    const bScale = firstNumber(normalized, /\b(\d{2})\s*b\b/, 70, 85)
    const hardness = aScale || (bScale ? bScale + 20 : null)
    if (diameter) specs.diameterMm = diameter
    if (hardness) specs.hardnessA = hardness
  }

  if (componentType === "DECK") {
    const width = firstNumber(normalized, /\b(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:"|”|″|inches?\b|inch\b)/, 6, 12)
      || firstNumber(normalized, /\b((?:7|8|9|10)[.,]\d{1,3})\b/, 6, 12)
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
    const abec = normalized.match(/\babec[\s-]*([3579])\b/)
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

export function normalizeShopifyProduct(feed, product, expectedComponentType = null) {
  const classified = classifyHardware({
    productType: product.product_type,
    title: product.title,
    tags: product.tags || []
  })
  if (excludedHardware(`${product.product_type || ""} ${product.title || ""} ${(product.tags || []).join(" ")}`, expectedComponentType || classified || "")) return []
  const componentType = expectedComponentType || classified
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
      brand: inferBrand(product.title, product.vendor),
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
  }).filter(item => Number.isFinite(item.price) && item.price > 0 && item.imageUrl && item.productUrl)
}

export function normalizeWooProduct(feed, componentType, product) {
  if (!COMPONENTS.has(componentType) || product.is_in_stock === false) return []
  if (excludedHardware(product.name, componentType)) return []
  const declaredBrand = product.brands?.[0]?.name
    || product.attributes?.find(attribute => /^(brand|marque)$/.test(plain(attribute.name)))?.terms?.[0]?.name
  const brand = inferBrand(product.name, declaredBrand)
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
  return Number.isFinite(price) && price > 0 && item.imageUrl && item.productUrl
    ? [{ ...item, canonicalKey: canonicalKey(item) }]
    : []
}

export function normalizePrestaProduct(feed, componentType, product) {
  if (!COMPONENTS.has(componentType) || excludedHardware(product.name || "", componentType)) return []

  const explicitlyOutOfStock = /outofstock|out_of_stock|unavailable/i.test(`${product.seo_availability || ""} ${product.availability || ""}`)
  const quantityKnown = product.quantity !== undefined && product.quantity !== null
  const noStock = quantityKnown && Number(product.quantity) <= 0 && Number(product.allow_oosp || 0) !== 1
  const cannotOrder = product.add_to_cart_url === null && !quantityKnown && !product.seo_availability
  if (explicitlyOutOfStock || noStock || cannotOrder || String(product.active) === "0") return []

  const variants = Object.values(product.attributes || {})
    .filter(attribute => /taille|diametre|largeur|durete|size/i.test(attribute.group || ""))
    .map(attribute => attribute.name)
    .filter(Boolean)
  const variantLabel = variants.filter(value => !plain(product.name).includes(plain(value))).join(" · ")
  const specParts = variants.map(value => componentType === "DECK" && /^\d(?:[.,]\d+)?$/.test(value) ? `${value}"` : value)
  const description = String(product.description_short || "").replace(/<[^>]*>/g, " ")
  const price = Number(product.price_amount ?? String(product.price || "").replace(/[^\d,.]/g, "").replace(",", "."))
  const id = product.id_product || product.id
  const variantId = product.id_product_attribute || ""
  const item = {
    id: `${feed.id}:presta:${id}${variantId ? `:${variantId}` : ""}`,
    source: feed.id,
    sourceProductId: String(id),
    componentType,
    brand: inferBrand(product.name, product.manufacturer_name),
    name: variantLabel ? `${product.name} · ${variantLabel}` : product.name,
    imageUrl: product.cover?.bySize?.home_default?.url || product.cover?.medium?.url || product.cover?.large?.url || "",
    productUrl: product.url || product.canonical_url || product.link || "",
    shop: feed.shop,
    price,
    currency: "EUR",
    inStock: true,
    quantityForSetup: componentType === "TRUCKS" ? 2 : 1,
    specs: extractSpecs(componentType, `${product.name} ${specParts.join(" ")} ${description}`)
  }
  return Number.isFinite(price) && price > 0 && item.imageUrl && item.productUrl
    ? [{ ...item, canonicalKey: canonicalKey(item) }]
    : []
}

export function normalizeBigCartelProduct(feed, product) {
  if (product.status !== "active") return []
  const categories = (product.categories || []).map(category => category.name)
  const description = String(product.description || "").replace(/<[^>]*>/g, " ")
  const componentType = classifyHardware({ productType: categories.join(" "), title: product.name, tags: [description] })
  if (!componentType || excludedHardware(product.name, componentType)) return []

  const options = (product.options || []).filter(option => !option.sold_out)
  const availableOptions = options.length ? options : [{ id: product.id, name: product.name, price: product.price }]

  return availableOptions.map(option => {
    const optionLabel = option.name && plain(option.name) !== plain(product.name) ? option.name : ""
    const item = {
      id: `${feed.id}:bigcartel:${option.id || product.id}`,
      source: feed.id,
      sourceProductId: String(product.id),
      componentType,
      brand: inferBrand(product.name),
      name: optionLabel ? `${product.name} · ${optionLabel}` : product.name.trim(),
      imageUrl: product.images?.[0]?.url || "",
      productUrl: new URL(product.url || `/product/${product.permalink}`, feed.baseUrl).href,
      shop: feed.shop,
      price: Number(option.price ?? product.price),
      currency: "EUR",
      inStock: true,
      quantityForSetup: componentType === "TRUCKS" ? 2 : 1,
      specs: extractSpecs(componentType, `${product.name} ${optionLabel} ${description}`)
    }
    return { ...item, canonicalKey: canonicalKey(item) }
  }).filter(item => Number.isFinite(item.price) && item.price > 0 && item.imageUrl && item.productUrl)
}
