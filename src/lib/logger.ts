import { invoke } from '@tauri-apps/api/core'

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

class Logger {
  constructor(private plugin: string) {}

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    // Console log in dev mode
    if (import.meta.env.DEV) {
      const prefix = `[${this.plugin}]`
      const contextStr = context ? ` ${JSON.stringify(context)}` : ''
      switch (level) {
        case 'trace':
        case 'debug':
          console.debug(`${prefix} ${message}${contextStr}`)
          break
        case 'info':
          console.info(`${prefix} ${message}${contextStr}`)
          break
        case 'warn':
          console.warn(`${prefix} ${message}${contextStr}`)
          break
        case 'error':
          console.error(`${prefix} ${message}${contextStr}`)
          break
      }
    }

    // Send to backend (fire and forget)
    invoke('log_from_frontend', {
      plugin: this.plugin,
      level,
      message,
      context: context ?? null,
    }).catch(() => {
      // Silently ignore logging failures
    })
  }

  trace(message: string, context?: Record<string, unknown>) {
    this.log('trace', message, context)
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context)
  }
}

export function createLogger(plugin: string): Logger {
  return new Logger(plugin)
}

export type { Logger, LogLevel }
