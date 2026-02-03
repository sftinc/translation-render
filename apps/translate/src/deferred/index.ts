/**
 * Deferred Translation Module
 * Barrel exports for deferred/skeleton translation functionality
 */

export { isInFlight, setInFlight, deleteInFlight, buildInFlightKey } from './in-flight-store.js'
export { startBackgroundTranslation } from './background-translator.js'
export { startBackgroundPathTranslation } from './background-path-translator.js'
export { injectDeferredAssets, getDeferredScript } from './injector.js'
export { handleTranslateRequest } from './translate-handler.js'
