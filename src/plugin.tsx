import {definePlugin} from 'sanity'

import {landingPane} from './landing'
import {resolveOptions, type WebVitalsPluginOptions} from './options'
import {WebVitalsPane} from './WebVitalsPane'

/**
 * Shows Core Web Vitals, sessions by device and a live preview of the site in the Structure tool's
 * empty pane. Add it after `structureTool()`. The numbers come
 * from the route that mounts `createWebVitalsHandler()` from `sanity-plugin-web-vitals/server`.
 */
export const webVitals = definePlugin<WebVitalsPluginOptions | void>((options) => {
  const resolved = resolveOptions(options ?? {})
  const Pane = () => <WebVitalsPane options={resolved} />
  Pane.displayName = 'WebVitalsPane'

  return {
    name: 'sanity-plugin-web-vitals',
    plugins: [
      landingPane({
        component: Pane,
        title: resolved.title,
        paneId: resolved.paneId,
      }),
    ],
  }
})
