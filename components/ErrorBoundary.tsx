'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen py-8">
          <div className="max-w-4xl mx-auto px-4">
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              <div className="flex items-center mb-6">
                <svg
                  className="w-12 h-12 text-red-400 mr-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h1 className="text-2xl font-bold text-white">
                  Oops! Something went wrong
                </h1>
              </div>

              <div className="mb-6">
                <p className="text-gray-300 mb-4">
                  We encountered an unexpected error while processing your request.
                  Don't worry, your audio files are safe.
                </p>
                
                <div className="bg-red-900 border border-red-700 rounded-md p-4 mb-4">
                  <h2 className="text-sm font-semibold text-red-300 mb-2">
                    Error Details:
                  </h2>
                  <p className="text-sm text-red-200 font-mono">
                    {this.state.error.message}
                  </p>
                </div>

                {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                  <details className="bg-gray-900 border border-gray-600 rounded-md p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-300 mb-2">
                      Stack Trace (Development Only)
                    </summary>
                    <pre className="text-xs text-gray-400 overflow-auto">
                      {this.state.error.stack}
                      {'\n\nComponent Stack:\n'}
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={this.resetError}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}