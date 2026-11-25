import {describe, expect, test} from 'vitest'

import {
  DEFAULT_LAST_PUBLISHED_QUERY,
  DEFAULT_MENU,
  DEFAULT_PRIMARY_ACTION,
  resolveOptions,
} from './options'

describe('resolveOptions', () => {
  test('generic defaults', () => {
    const options = resolveOptions()
    expect(options.title).toBe('Overview')
    expect(options.primaryAction).toEqual(DEFAULT_PRIMARY_ACTION)
    expect(options.cardAction).toEqual(DEFAULT_PRIMARY_ACTION)
    expect(options.menu).toEqual(DEFAULT_MENU)
    expect(options.lastPublishedQuery).toBe(DEFAULT_LAST_PUBLISHED_QUERY)
    expect(JSON.stringify(options)).not.toMatch(/store|shop/i)
  })

  test('the card click follows primaryAction unless set', () => {
    const tool = {type: 'tool', title: 'Edit', tool: 'visual-editor'} as const
    expect(resolveOptions({primaryAction: tool}).cardAction).toEqual(tool)
    expect(resolveOptions({primaryAction: false}).cardAction).toBe(false)
    const link = {type: 'link', title: 'Open', href: '/'} as const
    expect(resolveOptions({primaryAction: tool, cardAction: link}).cardAction).toEqual(link)
    expect(resolveOptions({cardAction: false}).cardAction).toBe(false)
  })

  test('labels merge over the notice defaults', () => {
    const {labels} = resolveOptions({
      labels: {sampleNotice: 'Demo', metrics: {sessions: {description: 'Visits'}}},
    })
    expect(labels.sampleNotice).toBe('Demo')
    expect(labels.errorNotice).toBe('Web Vitals could not be loaded.')
    expect(labels.metrics?.sessions?.description).toBe('Visits')
  })
})
