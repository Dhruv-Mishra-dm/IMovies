import { Component } from 'react'
import Button from './ui/Button.jsx'
import { EmptyState } from './ui/Feedback.jsx'

const reloadPage = () => window.location.reload()

/**
 * Catches errors thrown while rendering (including a lazy admin chunk that fails to download, e.g. after
 * the site was rebuilt) and shows a friendly message instead of a blank page. The error itself is never
 * shown — React already logs it to the browser console for developers.
 *
 * `resetKey`: when it changes (e.g. the URL), the boundary clears the error and renders its children again.
 * Error boundaries must be class components; React has no hook for this.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  render() {
    if (!this.state.failed) return this.props.children
    const { onReload = reloadPage } = this.props
    return (
      <div className="container page" role="alert">
        <EmptyState
          title="Something went wrong"
          action={
            <div className="cluster" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={onReload}>
                Reload page
              </Button>
              {/* A plain link: it must work even if the router itself is what failed. */}
              <a className="btn" href="/">
                Go to the home page
              </a>
            </div>
          }
        >
          This page couldn&apos;t be displayed. Reloading usually fixes it, and also loads the newest version of
          IMovies if the site was just updated.
        </EmptyState>
      </div>
    )
  }
}
