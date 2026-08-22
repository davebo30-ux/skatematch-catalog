import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  normalizeBigCartelProduct,
  normalizePrestaProduct,
  normalizeShopifyProduct,
  normalizeWooProduct
} from "./normalizer.mjs"

const sourceDirectory = dirname(fileURLToPath(import.meta.url))
const backendDirectory = resolve(sourceDirectory, "..")
const feeds = JSON.parse(await readFile(resolve(backendDirectory, "feeds.json"), "utf8"))
const outputPath = resolve(backendDirectory, "data/catalog.json")
const statusPath = resolve(backendDirectory, "data/status.json")
const headers = { "User-Agent": "SkateMatch-MVP/0.1 (catalog synchronization)" }

let previousCatalog = null
try {
  previousCatalog = JSON.parse(await readFile(outputPath, "utf8"))
} catch (error) {
  if (error.code !== "ENOENT") throw error
}

async function fetchJson(url, attempt = 1, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: { ...headers, ...extraHeaders },
    signal: AbortSignal.timeout(45_000)
  })
  if (response.ok) return response.json()
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 1_500))
    return fetchJson(url, attempt + 1, extraHeaders)
  }
  throw new Error(`${response.status} ${response.statusText} · ${url}`)
}

async function importShopify(feed) {
  const normalized = []
  let scanned = 0
  const collections = feed.collections
    ? Object.entries(feed.collections)
    : [[null, null]]

  for (const [componentType, handle] of collections) {
    for (let page = 1; page <= 20; page += 1) {
      const path = handle ? `/collections/${handle}/products.json` : "/products.json"
      const url = `${feed.baseUrl}${path}?limit=250&page=${page}`
      const payload = await fetchJson(url)
      const products = payload.products || []
      scanned += products.length
      products.forEach(product => normalized.push(...normalizeShopifyProduct(feed, product, componentType)))
      if (products.length < 250) break
    }
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

async function importPrestaShop(feed) {
  const normalized = []
  let scanned = 0

  for (const [componentType, categoryPath] of Object.entries(feed.categories)) {
    for (let page = 1; page <= 30; page += 1) {
      const query = new URLSearchParams({ ajax: "1", page: String(page) })
      if (!feed.omitPageSize) query.set("resultsPerPage", "100")
      const url = `${feed.baseUrl}${categoryPath}?${query}`
      const payload = await fetchJson(url, 1, {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest"
      })
      const products = Array.isArray(payload.products)
        ? payload.products
        : Object.values(payload.products || {})
      scanned += products.length
      products.forEach(product => normalized.push(...normalizePrestaProduct(feed, componentType, product)))
      const pagesCount = Number(payload.pagination?.pages_count || 1)
      if (page >= pagesCount || !products.length) break
    }
  }

  return { normalized, scanned }
}

async function importBigCartel(feed) {
  const payload = await fetchJson(`${feed.baseUrl}/products.json`)
  const products = Array.isArray(payload) ? payload : (payload.products || [])
  const normalized = products.flatMap(product => normalizeBigCartelProduct(feed, product))
  return { normalized, scanned: products.length }
}

const productsById = new Map()
const sourceResults = Array(feeds.length)

async function synchronizeFeed(feed, index) {
  try {
    const importer = {
      shopify: importShopify,
      woocommerce: importWooCommerce,
      prestashop: importPrestaShop,
      bigcartel: importBigCartel
    }[feed.kind]
    if (!importer) throw new Error(`Type de flux non reconnu : ${feed.kind}`)
    const result = await importer(feed)
    if (!result.normalized.length) throw new Error("Aucun produit disponible dans le flux")
    result.normalized.forEach(product => productsById.set(product.id, product))
    sourceResults[index] = { id: feed.id, shop: feed.shop, status: "ok", scanned: result.scanned, imported: result.normalized.length }
    process.stdout.write(`✓ ${feed.shop}: ${result.normalized.length} variantes matériel\n`)
  } catch (error) {
    const retainedProducts = (previousCatalog?.products || []).filter(product => product.source === feed.id)
    if (retainedProducts.length) {
      retainedProducts.forEach(product => productsById.set(product.id, product))
      sourceResults[index] = {
        id: feed.id,
        shop: feed.shop,
        status: "stale",
        imported: retainedProducts.length,
        retainedFrom: previousCatalog.generatedAt,
        message: error.message
      }
      process.stderr.write(`⚠ ${feed.shop}: ${error.message} · ${retainedProducts.length} offres précédentes conservées\n`)
    } else {
      sourceResults[index] = { id: feed.id, shop: feed.shop, status: "error", message: error.message }
      process.stderr.write(`✗ ${feed.shop}: ${error.message}\n`)
    }
  }
}

let nextFeed = 0
async function worker() {
  while (nextFeed < feeds.length) {
    const index = nextFeed
    nextFeed += 1
    await synchronizeFeed(feeds[index], index)
  }
}

await Promise.all(Array.from({ length: Math.min(4, feeds.length) }, worker))

const products = [...productsById.values()].sort((left, right) =>
  left.componentType.localeCompare(right.componentType) || left.brand.localeCompare(right.brand) || left.price - right.price
)
const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: sourceResults.filter(source => source.status !== "error"),
  unavailableSources: sourceResults.filter(source => source.status === "error"),
  counts: Object.fromEntries(["DECK", "TRUCKS", "WHEELS", "BEARINGS"].map(type => [type, products.filter(product => product.componentType === type).length])),
  products
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, "utf8")
await writeFile(statusPath, `${JSON.stringify({
  generatedAt: catalog.generatedAt,
  totalOffers: products.length,
  counts: catalog.counts,
  sources: catalog.sources,
  unavailableSources: catalog.unavailableSources
}, null, 2)}\n`, "utf8")
process.stdout.write(`Catalogue écrit : ${products.length} offres · ${outputPath}\n`)

if (!products.length || sourceResults.every(source => source.status === "error")) process.exitCode = 1
