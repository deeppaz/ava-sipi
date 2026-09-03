import { LAYER_IDS, Story } from '@ava-sipi/schema'
import { describe, expect, it } from 'vitest'
import { dictionaryKeys } from '@/i18n'
import { stories, storyById } from '@/stories'

/**
 * The stories are plain data at runtime so zod stays out of the first chunk; the contract is
 * enforced here instead.
 */
describe('stories', () => {
  it('every story satisfies the Story schema', () => {
    for (const story of stories) {
      const parsed = Story.safeParse(story)
      expect(parsed.success ? null : { id: story.id, issues: parsed.error.issues }).toBeNull()
    }
  })

  it('uses known layer ids and resolvable text keys', () => {
    const keys = new Set(dictionaryKeys('en'))
    for (const story of stories) {
      expect(keys.has(story.titleKey), story.titleKey).toBe(true)
      expect(keys.has(story.subtitleKey), story.subtitleKey).toBe(true)
      for (const step of story.steps) {
        expect(keys.has(step.text), step.text).toBe(true)
        for (const layer of step.layers) expect(LAYER_IDS).toContain(layer)
      }
    }
  })

  it('has the four stories the spec names, each lookupable by id', () => {
    expect(stories.map((s) => s.id)).toEqual(['euphrates-tigris', 'aral', 'colorado', 'alps'])
    expect(storyById('aral')?.steps.length).toBeGreaterThan(2)
    expect(storyById('nope')).toBeUndefined()
  })
})
