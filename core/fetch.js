import { computed, reactive, unref } from "vue"
import { hash } from "ohash"
import { useRequestFetch } from "./ssr.js";
import { useAsyncData } from "./asyncData.js"


/**
 * 
 * @param {String} request url链接 
 * @param {*} arg1 
 * @param {*} arg2 
 * @returns 
 */
export function useFetch (request, arg1, arg2) {
  const [opts = {}, autoKey] = typeof arg1 === "string" ? [{}, arg1] : [arg1, arg2]

  const _key = opts.key || hash([autoKey, unref(opts.baseURL), typeof request === "string" ? request : "", unref(opts.params || opts.query)])
  if (!_key || typeof _key !== "string") {
    throw new TypeError("[nuxt] [useFetch] key must be a string: " + _key)
  }
  if (!request) {
    throw new Error("[nuxt] [useFetch] request is missing.")
  }

  const key = _key === autoKey ? "$f" + _key : _key

  const _request = computed(() => {
    let r = request
    if (typeof r === "function") {
      r = r()
    }
    return unref(r)
  })

  if (!opts.baseURL && typeof _request.value === "string" && _request.value.startsWith("//")) {
    throw new Error('[nuxt] [useFetch] the request URL must not start with "//".')
  }

  const {
    server,
    lazy,
    default: defaultFn,
    transform,
    pick,
    watch,
    immediate,
    ...fetchOptions
  } = opts

  const _fetchOptions = reactive({
    ...fetchOptions,
    cache: typeof opts.cache === "boolean" ? void 0 : opts.cache
  })

  const _asyncDataOptions = {
    server,
    lazy,
    default: defaultFn,
    transform,
    pick,
    immediate,
    watch: watch === false ? [] : [_fetchOptions, _request, ...watch || []]
  }

  let controller

  const asyncData = useAsyncData(key, () => {
    controller?.abort?.()
    controller = typeof AbortController !== "undefined" ? new AbortController() : {}
    const isLocalFetch = typeof _request.value === "string" && _request.value.startsWith("/")
    let _$fetch = opts.$fetch || globalThis.$fetch

    if (process.server && !opts.$fetch && isLocalFetch) {
      _$fetch = useRequestFetch()
    }
    return _$fetch(_request.value, { signal: controller.signal, ..._fetchOptions })
  }, _asyncDataOptions)


  return asyncData
}


/**
 * 
 * @param {*} request 
 * @param {*} arg1 
 * @param {*} arg2 
 * @returns 
 */
export function useLazyFetch (request, arg1, arg2) {
  const [opts, autoKey] = typeof arg1 === "string" ? [{}, arg1] : [arg1, arg2]
  return useFetch(
    request,
    {
      ...opts,
      lazy: true
    },
    // @ts-expect-error we pass an extra argument with the resolved auto-key to prevent another from being injected
    autoKey
  )
}


