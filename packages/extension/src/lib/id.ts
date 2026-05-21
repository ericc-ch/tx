export const getBrowserId = () => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get("__browser_id") ?? "unknown"
}
