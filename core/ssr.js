import { setResponseStatus as _setResponseStatus } from "h3"
import { useNuxtApp } from "./nuxt.js"


export function useRequestHeaders (include) {
  let client = process.client
  if (client) {
    return {}
  }
  const headers = useNuxtApp().ssrContext?.event.node.req.headers ?? {}
  if (!include) {
    return headers
  }
  return Object.fromEntries(include.map((key) => key.toLowerCase()).filter((key) => headers[key]).map((key) => [key, headers[key]]))
}
export function useRequestEvent (nuxtApp = useNuxtApp()) {
  return nuxtApp.ssrContext?.event
}
export function useRequestFetch () {
  let client = process.client
  if (client) {
    return globalThis.$fetch
  }
  const event = useNuxtApp().ssrContext?.event
  return event?.$fetch || globalThis.$fetch
}
export function setResponseStatus (arg1, arg2, arg3) {
  let client = process.client
  if (client) {
    return
  }
  if (arg1 && typeof arg1 !== "number") {
    return _setResponseStatus(arg1, arg2, arg3)
  }
  return _setResponseStatus(useRequestEvent(), arg1, arg2)
}
