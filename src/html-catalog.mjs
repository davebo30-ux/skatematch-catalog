import { createHash } from "node:crypto"

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"])
const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  euro: "€",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
}

function decodeEntities(value = "") {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name.startsWith("#x")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10))
    return NAMED_ENTITIES[name.toLowerCase()] || entity
  })
}

function parseAttributes(source) {
  const attributes = {}
  const expression = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const match of source.matchAll(expression)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
  }
  return attributes
}

function parseDocument(html) {
  const root = { tag: "root", attrs: {}, children: [] }
  const stack = [root]
  const cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
  const expression = /<(\/)?([\w:-]+)([^>]*?)\/?\s*>|([^<]+)/g

  for (const match of cleaned.matchAll(expression)) {
    if (match[4]) {
      const value = decodeEntities(match[4]).replace(/\s+/g, " ").trim()
      if (value) stack.at(-1).children.push({ tag: "#text", value, attrs: {}, children: [] })
      continue
    }

    const tag = match[2].toLowerCase()
    if (match[1]) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.length = index
          break
        }
      }
      continue
    }

    const node = { tag, attrs: parseAttributes(match[3]), children: [] }
    stack.at(-1).children.push(node)
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(match[0])) stack.push(node)
  }

  return root
}

function visit(node, predicate, matches = []) {
  for (const child of node.children || []) {
    if (predicate(child)) matches.push(child)
    visit(child, predicate, matches)
  }
  return matches
}

function hasClass(node, ...values) {
  const classes = (node.attrs.class || "").toLowerCase().split(/\s+/)
  return values.some(value => classes.includes(value))
}

function nodeText(node) {
  if (!node) return ""
  if (node.tag === "#text") return node.value
  return node.children.map(nodeText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

function first(node, predicate) {
  return visit(node, predicate)[0] || null
}

function absoluteUrl(value, baseUrl) {
  if (!value || /^data:/i.test(value)) return ""
  try {
    return new URL(value.split(/\s+/)[0], baseUrl).href
  } catch {
    return ""
  }
}

function parsePrice(value = "") {
  const match = decodeEntities(value).match(/(?:€\s*)?((?:\d[\d\s\u00a0]*)(?:[.,]\d{1,2})?)\s*(?:€|EUR)?/i)
  if (!match) return Number.NaN
  const numeric = match[1].replace(/[\s\u00a0]/g, "").replace(",", ".")
  const number = Number(numeric)
  return Number.isFinite(number) && number > 0 ? number : Number.NaN
}

function findPrice(card) {
  const special = first(card, node => hasClass(node, "special-price"))
  const explicit = first(special || card, node => node.attrs["data-price-amount"] || node.attrs.itemprop === "price")
  if (explicit) {
    const amount = parsePrice(explicit.attrs["data-price-amount"] || explicit.attrs.content || nodeText(explicit))
    if (Number.isFinite(amount)) return amount
  }

  for (const className of ["special-price", "price-wrapper", "product-price", "regular-price", "price"]) {
    const node = first(card, candidate => hasClass(candidate, className))
    const amount = parsePrice(nodeText(node))
    if (Number.isFinite(amount)) return amount
  }

  return Number.NaN
}

function productLink(card) {
  const named = first(card, node => node.tag === "a" && hasClass(node, "product-item-link", "product-name"))
  if (named) return named

  const title = first(card, node => ["h2", "h3", "h4", "strong"].includes(node.tag)
    && (hasClass(node, "product-name", "product-item-name", "product-title") || node.attrs.itemprop === "name"))
  const nested = title && first(title, node => node.tag === "a")
  if (nested) return nested

  return first(card, node => node.tag === "a" && hasClass(node, "product_img_link", "product-image", "product-item-photo"))
}

function extractProduct(card, baseUrl) {
  const link = productLink(card)
  const image = first(card, node => node.tag === "img")
  if (!link || !image) return null

  const titleNode = first(card, node => ["h2", "h3", "h4", "strong"].includes(node.tag)
    && (hasClass(node, "product-name", "product-item-name", "product-title") || node.attrs.itemprop === "name"))
  const name = nodeText(link) || nodeText(titleNode) || link.attrs.title || image.attrs.alt || ""
  const productUrl = absoluteUrl(link.attrs.href, baseUrl)
  const imageUrl = absoluteUrl(
    image.attrs["data-src"] || image.attrs["data-original"] || image.attrs["data-lazy"] || image.attrs.src || image.attrs.srcset,
    baseUrl
  )
  const price = findPrice(card)
  if (!name || !productUrl || !imageUrl || !Number.isFinite(price)) return null

  const details = nodeText(card)
  const soldOut = /(?:[ée]puis[ée]|rupture de stock|out of stock|sold out|indisponible)/i.test(details)
  const addToCart = /\b(?:ajouter au panier|add to cart|ajout(?:er)? au panier)\b/i.test(details)
  const brandNode = first(card, node => hasClass(node, "product-brand", "brand", "manufacturer", "product-vendor"))
  const identifierNode = first(card, node => node.attrs["data-product-id"] || node.attrs["data-id-product"])
  const identifier = identifierNode?.attrs["data-product-id"]
    || identifierNode?.attrs["data-id-product"]
    || createHash("sha1").update(productUrl).digest("hex").slice(0, 16)

  return {
    id: identifier,
    name,
    brand: nodeText(brandNode),
    price,
    productUrl,
    imageUrl,
    details,
    inStock: !soldOut || addToCart
  }
}

function nextPage(root, baseUrl) {
  const current = new URL(baseUrl)
  const currentPage = Number(current.searchParams.get("p") || current.searchParams.get("page") || 1)
  const anchors = visit(root, node => node.tag === "a" && Boolean(node.attrs.href))
  const explicit = anchors.find(node => {
    const label = nodeText(node)
    return node.attrs.rel?.split(/\s+/).includes("next")
      || hasClass(node, "next", "next-page", "next-page-link")
      || /^(?:suivant(?:e)?|next|›|»|❯)$/i.test(label)
  })
  if (explicit) return absoluteUrl(explicit.attrs.href, baseUrl) || null

  const numbered = anchors.find(node => {
    const destination = absoluteUrl(node.attrs.href, baseUrl)
    if (!destination) return false
    const url = new URL(destination)
    const page = Number(url.searchParams.get("p") || url.searchParams.get("page") || 1)
    return url.origin === current.origin && url.pathname === current.pathname && page === currentPage + 1
  })
  return numbered ? absoluteUrl(numbered.attrs.href, baseUrl) : null
}

export function extractCatalogPage(html, baseUrl) {
  const root = parseDocument(html)
  let cards = visit(root, node => node.tag === "li"
    && (hasClass(node, "product-item", "ajax_block_product", "item") || node.attrs.itemtype?.includes("schema.org/Product")))

  if (!cards.length) {
    cards = visit(root, node => node.tag === "div"
      && (hasClass(node, "product-item-info", "product-container") || node.attrs.itemtype?.includes("schema.org/Product")))
  }

  const products = [...new Map(cards.map(card => extractProduct(card, baseUrl))
    .filter(Boolean)
    .map(product => [product.productUrl, product])).values()]

  return { products, nextUrl: nextPage(root, baseUrl) }
}
