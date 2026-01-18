export type BitrateMode = 'light' | 'high'
export type ResolutionScale = '1080p' | '720p' | '480p' | 'native'
export type AudioMode = 'none' | 'system' | 'mic' | 'both'
export type Framerate = '30' | '60' | '120'

export interface QuickClipSettings {
  bitrateMode: BitrateMode
  resolution: ResolutionScale
  audioMode: AudioMode
  framerate: Framerate
  hotkey: string
}

export const DEFAULT_SETTINGS: QuickClipSettings = {
  bitrateMode: 'light',
  resolution: '720p',
  audioMode: 'none',
  framerate: '30',
  hotkey: 'Ctrl+Shift+R',
}

export interface RecordingSettings {
  audioMode: AudioMode
  bitrateMode: BitrateMode
}

export interface Recording {
  id: string
  videoPath: string
  thumbnailPath: string
  duration: number
  timestamp: number
  settings: RecordingSettings
}
