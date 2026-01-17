export type CaptureMode = 'fullscreen' | 'window' | 'region'
export type AudioMode = 'none' | 'system' | 'microphone' | 'both'
export type QualityMode = 'light' | 'high'

export interface QuickClipSettings {
  captureMode: CaptureMode
  audioMode: AudioMode
  qualityMode: QualityMode
  hotkey: string
}

export const DEFAULT_SETTINGS: QuickClipSettings = {
  captureMode: 'fullscreen',
  audioMode: 'none',
  qualityMode: 'light',
  hotkey: 'Ctrl+Shift+R',
}

export interface Recording {
  id: string
  filename: string
  thumbnailPath: string
  duration: number
  timestamp: number
  settings: Pick<QuickClipSettings, 'captureMode' | 'audioMode' | 'qualityMode'>
}

export interface QuickClipData {
  recordings: Recording[]
  settings: QuickClipSettings
}
