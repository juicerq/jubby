import { Component, ReactNode } from 'react'
import { toast } from 'sonner'

interface Props {
  children: ReactNode
  onError: () => void
  pluginName: string
}

interface State {
  hasError: boolean
}

class PluginErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    toast.error(`Erro no plugin ${this.props.pluginName}: ${error.message}`)
    this.props.onError()
  }

  render() {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}

export { PluginErrorBoundary }
