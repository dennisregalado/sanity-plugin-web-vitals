/**
 * Puts a component in the Structure tool's empty pane: opening the tool with nothing selected
 * navigates to a pane with `paneId`, and the root list resolves that id to the component.
 *
 * Adapted from `structureHomeLandingPlugin` in sanity-plugin-blank-space (MIT, Jordan Lawrence,
 * github.com/jordanl17/sanity-plugin-blank-space), inlined because that package's peer range stops
 * at Sanity 5.
 */
import {type ReactNode, useEffect, useMemo} from 'react'
import {type ActiveToolLayoutProps, definePlugin} from 'sanity'
import {useRouter, useRouterState} from 'sanity/router'
import {
  type ChildResolver,
  ListBuilder,
  type StructureResolver,
  type UserComponent,
} from 'sanity/structure'

export interface LandingPaneOptions {
  component: UserComponent
  paneId: string
  title: string
}

/** The parent list as `ChildResolverOptions` passes it (typed `unknown` there). */
type ParentList = {items?: {type: string; id?: string; child?: ReturnType<ChildResolver>}[]}

function withLandingPane(
  original: StructureResolver | undefined,
  {component, paneId, title}: LandingPaneOptions,
): StructureResolver {
  return (S, context) => {
    const root = original ? original(S, context) : S.defaults()
    if (!(root instanceof ListBuilder)) return root

    const existingChild = root.getChild()
    const resolve: ChildResolver = (itemId, options) => {
      if (itemId === paneId) return S.component(component).id(paneId).title(title)
      if (typeof existingChild === 'function') return existingChild(itemId, options)
      // No custom child resolver: resolve the list item's own child, as Structure would.
      const target = ((options.parent as ParentList).items ?? []).find(
        (item) => item.type === 'listItem' && item.id === itemId,
      )
      if (!target) return undefined
      const child = target.child
      return typeof child === 'function' ? (child as ChildResolver)(itemId, options) : child
    }
    return root.child(resolve)
  }
}

/** Opens the landing pane when the Structure tool has no panes and is not resolving an intent. */
function LandingRedirect({
  children,
  toolName,
  paneId,
}: {
  children: ReactNode
  toolName: string
  paneId: string
}) {
  const {navigate} = useRouter()
  const state = useRouterState() as {panes?: unknown[]; intent?: unknown} | undefined
  const hasPanes = Boolean(state?.panes && state.panes.length > 0)
  const isStructure = toolName === 'structure'
  const resolvingIntent = typeof state?.intent === 'string'

  useEffect(() => {
    if (isStructure && !hasPanes && !resolvingIntent) {
      navigate({panes: [[{id: paneId}]]}, {replace: true})
    }
  }, [isStructure, hasPanes, resolvingIntent, navigate, paneId])

  return <>{children}</>
}

export const landingPane = definePlugin<LandingPaneOptions>((options) => {
  function ActiveToolLayout(props: ActiveToolLayoutProps) {
    const {renderDefault, activeTool} = props
    const isStructure = activeTool.name === 'structure'
    const original = isStructure
      ? (activeTool.options as {structure?: StructureResolver} | undefined)?.structure
      : undefined

    const tool = useMemo(
      () =>
        isStructure
          ? {
              ...activeTool,
              options: {...activeTool.options, structure: withLandingPane(original, options)},
            }
          : activeTool,
      [activeTool, isStructure, original],
    )

    return (
      <LandingRedirect toolName={activeTool.name} paneId={options.paneId}>
        {renderDefault({...props, activeTool: tool})}
      </LandingRedirect>
    )
  }

  return {
    name: 'sanity-plugin-web-vitals/landing',
    studio: {components: {activeToolLayout: ActiveToolLayout}},
  }
})
