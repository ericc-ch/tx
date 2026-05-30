export const normalizePath = (pathname: string) => pathname.replace(/\/$/, "") || "/"

export type PageKind = "overview" | "packages" | "order" | "unknown"

export const pageKind = (pathname: string): PageKind => {
  const base = normalizePath(pathname)
  if (base.endsWith("/order")) return "order"
  if (base.endsWith("/packages")) return "packages"
  if (base.includes("/to-do/")) return "overview"
  return "unknown"
}

export const overviewUrl = (pathname: string, search: string) => {
  if (pageKind(pathname) === "overview") return null

  const base = normalizePath(pathname)
  if (!base.endsWith("/packages") && !base.endsWith("/order")) return null

  const overviewBase = base.endsWith("/order")
    ? base.slice(0, -"/order".length)
    : base.slice(0, -"/packages".length)
  return `${overviewBase}${search}`
}

export const packagesUrl = (pathname: string, search: string) => {
  const base = normalizePath(pathname)
  if (base.endsWith("/packages")) return null
  return `${base}/packages${search}`
}
