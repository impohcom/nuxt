import { getCurrentInstance, onBeforeMount, onServerPrefetch, onUnmounted, ref, toRef, unref, watch, reactive, shallowReactive } from "vue"
import { useNuxtApp } from './nuxt.js'
import { createError } from "./error.js"
import { onNuxtReady } from "./ready.js"

const getDefault = () => null

/**
 * 
 * @param  {...any} args 
 * @returns 
 */
export function useAsyncData (...args) {
  const autoKey = typeof args[args.length - 1] === "string" ? args.pop() : void 0
  if (typeof args[0] !== "string") {
    args.unshift(autoKey)
  }
  let [key, handler, options = {}] = args

  if (typeof key !== "string") {
    throw new TypeError("[nuxt] [asyncData] key must be a string.")
  }
  if (typeof handler !== "function") {
    throw new TypeError("[nuxt] [asyncData] handler must be a function.")
  }

  options.server = options.server ?? true
  options.default = options.default ?? getDefault
  options.lazy = options.lazy ?? false
  options.immediate = options.immediate ?? true

  const nuxt = useNuxtApp()
  const getCachedData = () => nuxt.isHydrating ? nuxt.payload.data[key] : nuxt.static.data[key]
  const hasCachedData = () => getCachedData() !== void 0
  if (!nuxt._asyncData[key]) {
    nuxt._asyncData[key] = {
      data: ref(getCachedData() ?? options.default()),
      pending: ref(!hasCachedData()),
      error: toRef(nuxt.payload._errors, key),
      status: ref("idle")
    }
  }

  const asyncData = { ...nuxt._asyncData[key] }
  asyncData.refresh = asyncData.execute = (opts = {}) => {
    if (nuxt._asyncDataPromises[key]) {
      if (opts.dedupe === false) {
        return nuxt._asyncDataPromises[key]
      }
      nuxt._asyncDataPromises[key].cancelled = true
    }
    if ((opts._initial || nuxt.isHydrating && opts._initial !== false) && hasCachedData()) {
      return getCachedData()
    }
    asyncData.pending.value = true
    asyncData.status.value = "pending"
    const promise = new Promise(
      (resolve, reject) => {
        try {
          resolve(handler(nuxt))
        } catch (err) {
          reject(err)
        }
      }
    ).then((_result) => {
      if (promise.cancelled) {
        return nuxt._asyncDataPromises[key]
      }
      let result = _result
      if (options.transform) {
        result = options.transform(_result)
      }
      if (options.pick) {
        result = pick(result, options.pick)
      }

      asyncData.data.value = result
      asyncData.error.value = null
      asyncData.status.value = "success"


    }).catch((error) => {
      if (promise.cancelled) {
        return nuxt._asyncDataPromises[key]
      }
      asyncData.error.value = error
      asyncData.data.value = unref(options.default())
      asyncData.status.value = "error"
    }).finally(() => {
      if (promise.cancelled) {
        return
      }
      asyncData.pending.value = false
      nuxt.payload.data[key] = asyncData.data.value
      if (asyncData.error.value) {
        nuxt.payload._errors[key] = createError(asyncData.error.value)
      }
      delete nuxt._asyncDataPromises[key]

    })
    nuxt._asyncDataPromises[key] = promise

    return nuxt._asyncDataPromises[key]
  }

  const initialFetch = () => asyncData.refresh({ _initial: true })
  const fetchOnServer = options.server !== false && nuxt.payload.serverRendered

  if (process.server && fetchOnServer && options.immediate) {

    const promise = initialFetch()
    if (getCurrentInstance()) {
      onServerPrefetch(() => promise)
    } else {
      nuxt.hook("app:created", () => promise)
    }
  }
  if (process.client) {
    const instance = getCurrentInstance()
    if (instance && !instance._nuxtOnBeforeMountCbs) {
      instance._nuxtOnBeforeMountCbs = []
      const cbs = instance._nuxtOnBeforeMountCbs
      if (instance) {
        onBeforeMount(() => {
          cbs.forEach((cb) => {
            cb()
          })
          cbs.splice(0, cbs.length)
        })
        onUnmounted(() => cbs.splice(0, cbs.length))
      }
    }


    if (fetchOnServer && nuxt.isHydrating && hasCachedData()) {
      asyncData.pending.value = false
      asyncData.status.value = asyncData.error.value ? "error" : "success"
    } else if (instance && (nuxt.payload.serverRendered && nuxt.isHydrating || options.lazy) && options.immediate) {
      instance._nuxtOnBeforeMountCbs.push(initialFetch)
    } else if (options.immediate) {
      initialFetch()
    }
    if (options.watch) {
      watch(options.watch, () => asyncData.refresh())
    }
    const off = nuxt.hook("app:data:refresh", (keys) => {
      if (!keys || keys.includes(key)) {
        return asyncData.refresh()
      }
    })
    if (instance) {
      onUnmounted(off)
    }
  }
  const asyncDataPromise = Promise.resolve(nuxt._asyncDataPromises[key]).then(() => asyncData)
  Object.assign(asyncDataPromise, asyncData)


  return asyncDataPromise
}


/**
 * 
 * @param  {...any} args 
 * @returns 
 */
export function useLazyAsyncData (...args) {
  const autoKey = typeof args[args.length - 1] === "string" ? args.pop() : void 0
  if (typeof args[0] !== "string") {
    args.unshift(autoKey)
  }
  const [key, handler, options] = args
  return useAsyncData(key, handler, { ...options, lazy: true }, null)
}


/**
 * 获取数据
 * @param {*} key 
 * @returns 
 */
export function useNuxtData (key) {
  const nuxt = useNuxtApp()
  if (!(key in nuxt.payload.data)) {
    nuxt.payload.data[key] = null
  }
  return {
    data: toRef(nuxt.payload.data, key)
  }
}


/**
 * 更新数据
 * @param {*} keys 
 * @returns 
 */
export async function refreshNuxtData (keys) {
  if (process.server) {
    return Promise.resolve()
  }
  await new Promise((resolve) => onNuxtReady(resolve))
  const _keys = keys ? Array.isArray(keys) ? keys : [keys] : void 0
  await useNuxtApp().hooks.callHookParallel("app:data:refresh", _keys)
}


/**
 * 设置默认数据
 * @param {*} keys 
 */
export function clearNuxtData (keys) {
  const nuxtApp = useNuxtApp()
  const _allKeys = Object.keys(nuxtApp.payload.data)
  const _keys = !keys ? _allKeys : typeof keys === "function" ? _allKeys.filter(keys) : Array.isArray(keys) ? keys : [keys]
  for (const key of _keys) {
    if (key in nuxtApp.payload.data) {
      nuxtApp.payload.data[key] = void 0
    }
    if (key in nuxtApp.payload._errors) {
      nuxtApp.payload._errors[key] = void 0
    }
    if (nuxtApp._asyncData[key]) {
      nuxtApp._asyncData[key].data.value = void 0
      nuxtApp._asyncData[key].error.value = void 0
      nuxtApp._asyncData[key].pending.value = false
      nuxtApp._asyncData[key].status.value = "idle"
    }
    if (key in nuxtApp._asyncDataPromises) {
      nuxtApp._asyncDataPromises[key] = void 0
    }
  }
}


function pick (obj, keys) {
  const newObj = {}
  for (const key of keys) {
    newObj[key] = obj[key]
  }
  return newObj
}
