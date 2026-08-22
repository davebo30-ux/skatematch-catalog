import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { normalizeShopifyProduct, normalizeWooProduct } from "./normalizer.mjs"

const sourceDirectory = dirname(fileURLToPath(import.meta.url))
const backendDirectory = resolve(sourceDirectory, "..")
const feeds = JSON.parse(await readFile(resolve(backendDirectory, "feeds.json"), "utf8"))
const outputPath = resolve(backendDirectory, "data/catalog.json")
const headers = { "User-Agent": "SkateMatch-MVP/0.1 (catalog synchronization)" }

let previousCatalog = null
try {
  previousCatalog = JSON.parse(await readFile(outputPath, "utf8"))
} catch (error) {
  if (error.code !== "ENOENT") throw error
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (response.ok) return response.json()
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 1_500))
    return fetchJson(url, attempt + 1)
  }
  throw new Error(`${response.status} ${response.statusText} · ${url}`)
}

async function importShopify(feed) {
  const normalized = []
  let scanned = 0
  for (let page = 1; page <= 20; page += 1) {
    const url = `${feed.baseUrl}/products.json?limit=250&page=${page}`
    const payload = await fetchJson(url)
    const products = payload.products || []
    scanned += products.length
    products.forEach(product => normalized.push(...normalizeShopifyProduct(feed, product)))
    if (products.length < 250) break
  }
  return { normalized, scanned }
}

async function importWooCommerce(feed) {
  const normalized = []
  let scanned = 0
  for (const [componentType, category] of Object.entries(feed.categories)) {
    for (let page = 1; page <= 20; page += 1) {
      const url = `${feed.baseUrl}/wp-json/wc/store/v1/products?category=${category}&per_page=100&page=${page}`
      const products = await fetchJson(url)
      scanned += products.length
      products.forEach(product => normalized.push(...normalizeWooProduct(feed, componentType, product)))
      if (products.length < 100) break
    }
  }
  return { normalized, scanned }
}

const productsById = new Map()
const sourceResults = []

for (const feed of feeds) {
  try {
    const result = feed.kind === "shopify"
      ? await importShopify(feed)
      : await importWooCommerce(feed)
    if (!result.normalized.length) throw new Error("Aucun produit disponible dans le flux")
    result.normalized.forEach(product => productsById.set(product.id, product))
    sourceResults.push({ id: feed.id, shop: feed.shop, status: "ok", scanned: result.scanned, imported: result.normalized.length })
    process.stdout.write(`✓ ${feed.shop}: ${result.normalized.length} variantes matériel\n`)
  } catch (error) {
    const retainedProducts = (previousCatalog?.products || []).filter(product => product.source === feed.id)
    if (retainedProducts.length) {
      retainedProducts.forEach(product => productsById.set(product.id, product))
      sourceResults.push({
        id: feed.id,
        shop: feed.shop,
        status: "stale",
        imported: retainedProducts.length,
        retainedFrom: previousCatalog.generatedAt,
        message: error.message
      })
      process.stderr.write(`⚠ ${feed.shop}: ${error.message} · ${retainedProducts.length} offres précédentes conservées\n`)
    } else {
      sourceResults.push({ id: feed.id, shop: feed.shop, status: "error", message: error.message })
      process.stderr.write(`✗ ${feed.shop}: ${error.message}\n`)
    }
  }
}

const products = [...productsById.values()].sort((left, right) =>
  left.componentType.localeCompare(right.componentType) || left.brand.localeCompare(right.brand) || left.price - right.price
)
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: sourceResults,
  counts: Object.fromEntries(["DECK", "TRUCKS", "WHEELS", "BEARINGS"].map(type => [type, products.filter(product => product.componentType === type).length])),
  products
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, "utf8")
process.stdout.write(`Catalogue écrit : ${products.length} offres · ${outputPath}\n`)

if (!products.length || sourceResults.every(source => source.status === "error")) process.exitCode = 1
