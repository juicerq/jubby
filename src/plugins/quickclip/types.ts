export type CaptureMode = 'fullscreen'
export type AudioMode = 'none' | 'system' | 'microphone' | 'both'
export type QualityMode = 'light' | 'high'
export type ResolutionScale = 'native' | 'p720' | 'p480'

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

export interface RecordingSettings {
  captureMode: CaptureMode
  audioMode: AudioMode
  qualityMode: QualityMode
}

export interface Recording {
  id: string
  videoPath: string
  thumbnailPath: string
  duration: number
  timestamp: number
  settings: RecordingSettings
}
