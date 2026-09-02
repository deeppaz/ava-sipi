/** Stories (spec §5.5). Texts live in the i18n dictionaries; content notes in docs/STORIES.md. */
import { Story, type StoryInput } from '@ava-sipi/schema'

const raw: StoryInput[] = [
  {
    id: 'euphrates-tigris',
    titleKey: 'stories.euphrates-tigris.title',
    subtitleKey: 'stories.euphrates-tigris.subtitle',
    steps: [
      {
        id: 'source',
        camera: { lon: 40.2, lat: 39.4, zoom: 6.2, pitch: 30, bearing: -15 },
        layers: ['rivers', 'gauges'],
        text: 'stories.euphrates-tigris.step.1',
        duration: 9000,
      },
      {
        id: 'dams',
        camera: { lon: 38.7, lat: 38.1, zoom: 7.4, pitch: 35, bearing: 10 },
        layers: ['rivers', 'reservoirs'],
        text: 'stories.euphrates-tigris.step.2',
        duration: 9000,
        select: 'reservoirs:name:Atatürk',
      },
      {
        id: 'downstream',
        camera: { lon: 41.5, lat: 35.5, zoom: 5.8, pitch: 20, bearing: 0 },
        layers: ['rivers', 'events'],
        text: 'stories.euphrates-tigris.step.3',
        duration: 9000,
      },
      {
        id: 'grace',
        camera: { lon: 43.5, lat: 33.5, zoom: 4.6, pitch: 0, bearing: 0 },
        layers: ['rivers', 'groundwater'],
        time: 'live',
        text: 'stories.euphrates-tigris.step.4',
        duration: 10000,
      },
      {
        id: 'delta',
        camera: { lon: 47.9, lat: 30.6, zoom: 7.8, pitch: 40, bearing: -25 },
        layers: ['rivers', 'gauges', 'events'],
        text: 'stories.euphrates-tigris.step.5',
        duration: 9000,
      },
    ],
  },
  {
    id: 'aral',
    titleKey: 'stories.aral.title',
    subtitleKey: 'stories.aral.subtitle',
    steps: [
      {
        id: 'overview',
        camera: { lon: 59.5, lat: 45.0, zoom: 5.4, pitch: 0, bearing: 0 },
        layers: ['rivers', 'reservoirs'],
        text: 'stories.aral.step.1',
        duration: 9000,
      },
      {
        id: 'grace-2002',
        camera: { lon: 60.0, lat: 44.0, zoom: 4.6, pitch: 0, bearing: 0 },
        layers: ['groundwater'],
        time: '2003-01-01',
        text: 'stories.aral.step.2',
        duration: 12000,
      },
      {
        id: 'north-sea',
        camera: { lon: 60.3, lat: 46.4, zoom: 7.2, pitch: 25, bearing: 0 },
        layers: ['rivers', 'groundwater'],
        time: 'live',
        text: 'stories.aral.step.3',
        duration: 9000,
      },
      {
        id: 'toktogul',
        camera: { lon: 72.9, lat: 41.75, zoom: 8.2, pitch: 35, bearing: 15 },
        layers: ['rivers', 'reservoirs'],
        text: 'stories.aral.step.4',
        duration: 9000,
        select: 'reservoirs:name:Toktogul',
      },
    ],
  },
  {
    id: 'colorado',
    titleKey: 'stories.colorado.title',
    subtitleKey: 'stories.colorado.subtitle',
    steps: [
      {
        id: 'basin',
        camera: { lon: -111.5, lat: 37.0, zoom: 4.8, pitch: 0, bearing: 0 },
        layers: ['rivers', 'gauges'],
        text: 'stories.colorado.step.1',
        duration: 9000,
      },
      {
        id: 'mead',
        camera: { lon: -114.4, lat: 36.15, zoom: 8.6, pitch: 40, bearing: -20 },
        layers: ['rivers', 'reservoirs'],
        text: 'stories.colorado.step.2',
        duration: 10000,
        select: 'reservoirs:name:Mead',
      },
      {
        id: 'powell',
        camera: { lon: -111.3, lat: 37.05, zoom: 8.4, pitch: 40, bearing: 20 },
        layers: ['rivers', 'reservoirs'],
        text: 'stories.colorado.step.3',
        duration: 9000,
        select: 'reservoirs:name:Powell',
      },
      {
        id: 'drought',
        camera: { lon: -110.0, lat: 37.5, zoom: 5.0, pitch: 0, bearing: 0 },
        layers: ['rivers', 'drought'],
        text: 'stories.colorado.step.4',
        duration: 9000,
      },
      {
        id: 'delta',
        camera: { lon: -114.9, lat: 31.8, zoom: 7.6, pitch: 30, bearing: 0 },
        layers: ['rivers', 'gauges'],
        text: 'stories.colorado.step.5',
        duration: 9000,
      },
    ],
  },
  {
    id: 'alps',
    titleKey: 'stories.alps.title',
    subtitleKey: 'stories.alps.subtitle',
    steps: [
      {
        id: 'overview',
        camera: { lon: 8.6, lat: 46.4, zoom: 6.4, pitch: 30, bearing: 0 },
        layers: ['glaciers', 'rivers'],
        text: 'stories.alps.step.1',
        duration: 9000,
      },
      {
        id: 'aletsch',
        camera: { lon: 8.03, lat: 46.45, zoom: 10.2, pitch: 50, bearing: -30 },
        layers: ['glaciers'],
        text: 'stories.alps.step.2',
        duration: 10000,
      },
      {
        id: 'melt',
        camera: { lon: 10.5, lat: 46.9, zoom: 8.4, pitch: 45, bearing: 20 },
        layers: ['glaciers'],
        text: 'stories.alps.step.3',
        duration: 9000,
      },
      {
        id: 'rivers',
        camera: { lon: 8.4, lat: 46.2, zoom: 6.0, pitch: 20, bearing: 0 },
        layers: ['glaciers', 'rivers', 'gauges'],
        text: 'stories.alps.step.4',
        duration: 9000,
      },
    ],
  },
]

export const stories: Story[] = raw.map((s) => Story.parse(s))

export function storyById(id: string): Story | undefined {
  return stories.find((s) => s.id === id)
}
