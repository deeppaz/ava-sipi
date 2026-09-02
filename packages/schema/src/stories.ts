import { z } from 'zod'
import { LayerId } from './common.js'

export const StoryCamera = z.object({
  lon: z.number(),
  lat: z.number(),
  zoom: z.number().min(0).max(22),
  bearing: z.number().default(0),
  pitch: z.number().min(0).max(85).default(0),
})
export type StoryCamera = z.infer<typeof StoryCamera>

export const StoryStep = z.object({
  id: z.string(),
  camera: StoryCamera,
  layers: z.array(LayerId),
  /** 'live' | ISO day | 'forecast+N' */
  time: z.string().default('live'),
  /** i18n key for the step text */
  text: z.string(),
  /** milliseconds for auto-play */
  duration: z.number().int().positive().default(8000),
  /** optional object to select and show in the panel: '<layer>:<id>' */
  select: z.string().optional(),
})
export type StoryStep = z.infer<typeof StoryStep>

export const Story = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  titleKey: z.string(),
  subtitleKey: z.string(),
  steps: z.array(StoryStep).min(1),
})
export type Story = z.infer<typeof Story>
export type StoryInput = z.input<typeof Story>
