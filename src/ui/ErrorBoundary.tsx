/**
 * Round 08: if drawing the model or a panel fails, show what happened and a way back (undo the last
 * change, or reload a preset) instead of a blank page. The design itself is autosaved.
 */
import { Component, type ReactNode } from 'react';
import { APP_LABEL } from './persist';
import { useStore } from './store';

interface Props { children: ReactNode; area: string; className?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { console.error(`[MANICAI] ${this.props.area} failed`, error); }
  private retry = (fix?: () => void) => { fix?.(); this.setState({ error: null }); };
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const st = useStore.getState();
    return (
      <div className={`crash glass ${this.props.className ?? ''}`} role="alert">
        <b>The {this.props.area} stopped working.</b>
        <p className="small muted">{error.message}</p>
        <div className="crash-actions">
          <button className="btn-sm" onClick={() => this.retry()}>Try again</button>
          {st.past.length > 0 && <button className="btn-sm" onClick={() => this.retry(() => useStore.getState().undo())}>Undo last change</button>}
          <button className="btn-sm" onClick={() => this.retry(() => useStore.getState().loadPreset(useStore.getState().project.presetId ?? 'generic-soccer'))}>Reload the preset</button>
        </div>
        <p className="small muted mono">{APP_LABEL}</p>
      </div>
    );
  }
}
