'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * A rendering failure inside the 3D viewer must never take down the page. The surrounding player
 * and equipment information stays usable; only the viewer area shows the fallback.
 */
export class ViewerErrorBoundary extends Component<
  {
    fallback: ReactNode;
    onError?: (error: Error) => void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
