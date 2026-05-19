import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('UI render error:', error, info)
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    const msg = this.state.error?.message || String(this.state.error)
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full bg-surface border border-border rounded-xl px-6 py-8">
          <p className="font-display font-semibold text-text-primary mb-1">Something went wrong rendering this view</p>
          <p className="text-text-muted text-[12px] mb-4">
            The rest of ORDOBOOK is still working — only this screen failed. Try going back to a different
            tab, or refresh if it persists.
          </p>
          <pre className="bg-bg border border-border rounded-md p-3 text-[11px] text-text-secondary overflow-auto max-h-48 whitespace-pre-wrap font-mono">
            {msg}
          </pre>
          <button
            onClick={this.reset}
            className="mt-4 px-3 py-1.5 rounded-md border border-border text-text-secondary text-sm hover:border-accent/40 hover:text-text-primary transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
