import React from 'react';

// Keeps one broken subtree from white-screening the whole app (Q10).
//
// React unmounts the entire tree on an uncaught render/lifecycle error, so
// before this a single bad datum reaching the D3 scene took the page down to a
// blank background with the story only in the console. Wrapping the chart means
// a Timeline throw leaves the header, filters and footer (privacy notice
// included) standing, and offers a retry — the render is a pure function of the
// current filters, so remounting after changing them genuinely can succeed.
//
// A class is not a style choice here: error boundaries have no hook equivalent.
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.retry = () => this.setState({ error: null });
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Nothing phones home (D17: no analytics, no requests after load), so
        // the console is the whole diagnostic channel.
        console.error('Caught by ErrorBoundary:', error, info?.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="error-fallback" role="alert">
                <h2>{this.props.title ?? 'Something went wrong'}</h2>
                <p>{this.props.hint ?? 'Try again, or adjust the filters.'}</p>
                <p className="error-detail">{String(this.state.error?.message ?? this.state.error)}</p>
                <button onClick={this.retry}>Try again</button>
            </div>
        );
    }
}
