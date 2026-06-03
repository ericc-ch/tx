export const normalizePath = (pathname: string) => pathname.replace(/\/$/, "") || "/"

export type PageKind =
  | "overview"
  | "packages"
  | "order"
  | "payment"
  | "payment-confirm"
  | "unknown"

export const pageKind = (location: Pick<Location, "pathname">): PageKind => {
  const base = normalizePath(location.pathname)
  if (base.includes("/payment/") && base.endsWith("/confirm")) return "payment-confirm"
  if (base.endsWith("/payment")) return "payment"
  if (base.endsWith("/order")) return "order"
  if (base.endsWith("/packages")) return "packages"
  if (base.includes("/to-do/")) return "overview"
  return "unknown"
}

export const overviewUrl = (location: Pick<Location, "pathname" | "search">) => {
  if (pageKind(location) === "overview") return null

  const base = normalizePath(location.pathname)
  if (!base.endsWith("/packages") && !base.endsWith("/order")) return null

  const overviewBase = base.endsWith("/order")
    ? base.slice(0, -"/order".length)
    : base.slice(0, -"/packages".length)
  return `${overviewBase}${location.search}`
}

export const packagesUrl = (location: Pick<Location, "pathname" | "search">) => {
  const base = normalizePath(location.pathname)
  if (base.endsWith("/packages")) return null
  return `${base}/packages${location.search}`
}
