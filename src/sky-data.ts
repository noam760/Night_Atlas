type CatalogCallback = (error: Error | null, data?: unknown) => void

export interface CatalogLoader {
  json: (url: string, callback: CatalogCallback) => unknown
}

const catalogs = import.meta.glob('../public/sky-data/*.json', {
  eager: true,
  import: 'default',
})

export function installBundledCatalogs(loader: CatalogLoader): void {
  const originalJson = loader.json.bind(loader)
  loader.json = (url, callback) => {
    const prefix = '/sky-data/'
    const catalog = url.startsWith(prefix)
      ? catalogs[`../public/sky-data/${url.slice(prefix.length)}`]
      : undefined

    if (catalog === undefined) return originalJson(url, callback)

    queueMicrotask(() => callback(null, structuredClone(catalog)))
    return undefined
  }
}