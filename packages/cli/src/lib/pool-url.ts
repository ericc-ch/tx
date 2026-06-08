export const normalizePoolRpcUrl = (serverUrl: string) => {
  const trimmed = serverUrl.trim().replace(/\/+$/, "")
  if (trimmed.endsWith("/rpc")) return trimmed
  return `${trimmed}/rpc`
}
