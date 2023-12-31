import { getCurrentInstance, hasInjectionContext, reactive } from "vue"
import { createHooks } from "hookable"
import { getContext } from "unctx"
import { $fetch } from 'ofetch'
import { ClientOnly } from './components.js'
import devalue from '@nuxt/devalue'

const nuxtAppCtx = /* @__PURE__ */ getContext("nuxt-app")
export const NuxtPluginIndicator = "__nuxt_plugin"



export function createNuxtApp (options) {
  let hydratingCount = 0

  // 写入状态
  process.client = !options.env.SSR
  process.server = options.env.SSR

  const nuxtApp = {
    provide: void 0,
    globalName: "nuxt",
    client: process.client,
    server: process.server,
    payload: reactive({
      config: {},
      data: {},
      state: {},
      _errors: {},
      ...process.client ? devalue(window.__CESSR__ ?? {}) : { serverRendered: true }
    }),
    static: {
      data: {}
    },
    runWithContext: (fn) => callWithNuxt(nuxtApp, fn),
    isHydrating: process.client,
    deferHydration () {
      if (!nuxtApp.isHydrating) {
        return () => { }
      }
      hydratingCount++

      let called = false
      return () => {
        if (called) {
          return
        }
        called = true
        hydratingCount--
        if (hydratingCount === 0) {
          nuxtApp.isHydrating = false
          return nuxtApp.callHook("app:suspense:resolve")
        }
      }
    },
    _asyncDataPromises: {},
    _asyncData: {},
    _payloadRevivers: {},
    ...options
  }

  // 注册请求
  if (!globalThis.$fetch) {
    globalThis.$fetch = $fetch.create({
      baseURL: options.baseURL
    })
  }


  // 模板组件注册
  if (options.vueApp) {
    options.vueApp.component(ClientOnly.name, ClientOnly)
  }


  nuxtApp.hooks = createHooks()
  nuxtApp.hook = nuxtApp.hooks.hook

  if (nuxtApp.server) {
    async function contextCaller (hooks, args) {
      for (const hook of hooks) {
        await nuxtApp.runWithContext(() => hook(...args))
      }
    }
    nuxtApp.hooks.callHook = (name, ...args) => nuxtApp.hooks.callHookWith(contextCaller, name, ...args)
  }


  nuxtApp.callHook = nuxtApp.hooks.callHook
  nuxtApp.provide = (name, value) => {
    const $name = "$" + name
    defineGetter(nuxtApp, $name, value)
    defineGetter(nuxtApp.vueApp.config.globalProperties, $name, value)
  }

  defineGetter(nuxtApp.vueApp, "$nuxt", nuxtApp)
  defineGetter(nuxtApp.vueApp.config.globalProperties, "$nuxt", nuxtApp)



  if (nuxtApp.server) {
    if (nuxtApp.ssrContext) {
      nuxtApp.ssrContext.nuxt = nuxtApp
      nuxtApp.ssrContext._payloadReducers = {}
      nuxtApp.payload.path = nuxtApp.ssrContext.url
    }
    nuxtApp.ssrContext = nuxtApp.ssrContext || {}
    if (nuxtApp.ssrContext.payload) {
      Object.assign(nuxtApp.payload, nuxtApp.ssrContext.payload)
    }
    nuxtApp.ssrContext.payload = nuxtApp.payload
    nuxtApp.ssrContext.config = {
      public: {},// options.ssrContext.runtimeConfig.public,
      app: {} //options.ssrContext.runtimeConfig.app
    }
  }

  if (nuxtApp.client) {
    window.addEventListener("nuxt.preloadError", (event) => {
      nuxtApp.callHook("app:chunkError", { error: event.payload })
    })
    window.useNuxtApp = window.useNuxtApp || useNuxtApp
    const unreg = nuxtApp.hook("app:error", (...args) => {
      console.error("[nuxt] error caught during app initialization", ...args)
    })
    nuxtApp.hook("app:mounted", unreg)
  }
  const runtimeConfig = nuxtApp.server ? options.ssrContext.runtimeConfig : reactive(nuxtApp.payload.config)
  nuxtApp.provide("config", runtimeConfig)

  return nuxtApp
}


export async function applyPlugin (nuxtApp, plugin) {
  if (plugin.hooks) {
    nuxtApp.hooks.addHooks(plugin.hooks)
  }
  if (typeof plugin === "function") {
    const { provide } = await nuxtApp.runWithContext(() => plugin(nuxtApp)) || {}
    if (provide && typeof provide === "object") {
      for (const key in provide) {
        nuxtApp.provide(key, provide[key])
      }
    }
  }
}

export async function applyPlugins (nuxtApp, plugins) {
  const parallels = []
  const errors = []
  for (const plugin of plugins) {
    const promise = applyPlugin(nuxtApp, plugin)
    if (plugin.parallel) {
      parallels.push(promise.catch((e) => errors.push(e)))
    } else {
      await promise
    }
  }
  await Promise.all(parallels)
  if (errors.length) {
    throw errors[0]
  }
}


/*! @__NO_SIDE_EFFECTS__ */
export function defineNuxtPlugin (plugin) {
  if (typeof plugin === "function") {
    return plugin
  }
  delete plugin.name
  return Object.assign(plugin.setup || (() => {
  }), plugin, { [NuxtPluginIndicator]: true })
}

/*! @__NO_SIDE_EFFECTS__ */
export const definePayloadPlugin = defineNuxtPlugin
export function isNuxtPlugin (plugin) {
  return typeof plugin === "function" && NuxtPluginIndicator in plugin
}


export function callWithNuxt (nuxt, setup, args) {
  const fn = () => args ? setup(...args) : setup()
  if (nuxt.server) {
    return nuxt.vueApp.runWithContext(() => nuxtAppCtx.callAsync(nuxt, fn))
  } else {
    nuxtAppCtx.set(nuxt)
    return nuxt.vueApp.runWithContext(fn)
  }
}


export function useNuxtApp () {
  let nuxtAppInstance

  // 检查是否可以使用inject()的工具
  if (hasInjectionContext()) {
    nuxtAppInstance = getCurrentInstance()?.appContext.app.$nuxt
  }
  nuxtAppInstance = nuxtAppInstance || nuxtAppCtx.tryUse()
  let dev = process.env.NODE_ENV !== 'production'
  if (!nuxtAppInstance) {
    if (dev) {
      throw new Error("[nuxt] A composable that requires access to the Nuxt instance was called outside of a plugin, Nuxt hook, Nuxt middleware, or Vue setup function. This is probably not a Nuxt bug. Find out more at `https://nuxt.com/docs/guide/concepts/auto-imports#using-vue-and-nuxt-composables`.")
    } else {
      throw new Error("[nuxt] instance unavailable")
    }
  }
  return nuxtAppInstance
}


export function useRuntimeConfig () {
  return useNuxtApp().$config
}


function defineGetter (obj, key, val) {
  Object.defineProperty(obj, key, { get: () => val })
}


export function defineAppConfig (config) {
  return config
}
