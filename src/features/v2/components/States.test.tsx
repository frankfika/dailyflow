/**
 * Smoke tests for the v2 shared UI components.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState, ErrorBanner, Spinner, StateView, Button, Badge, Card } from './States';

describe('v2/States', () => {
  it('EmptyState renders title and body', () => {
    render(<EmptyState title="No items" body="Try later" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Try later')).toBeInTheDocument();
  });

  it('ErrorBanner shows code and message', () => {
    render(<ErrorBanner error={{ code: 'http', message: 'failed' }} />);
    expect(screen.getByText('http')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('Spinner renders', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('span[aria-label="loading"]')).toBeInTheDocument();
  });

  it('StateView: loading', () => {
    render(<StateView loading><span>child</span></StateView>);
    expect(screen.getByText(/加载中/)).toBeInTheDocument();
  });

  it('StateView: error', () => {
    render(<StateView error={{ message: 'bad' }}><span>child</span></StateView>);
    expect(screen.getByText('bad')).toBeInTheDocument();
  });

  it('StateView: empty', () => {
    render(<StateView empty emptyTitle="empty"><span>child</span></StateView>);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('StateView: children', () => {
    render(<StateView><span>real-content</span></StateView>);
    expect(screen.getByText('real-content')).toBeInTheDocument();
  });

  it('Button renders and is clickable', () => {
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click me</Button>);
    screen.getByText('Click me').click();
    expect(clicked).toBe(true);
  });

  it('Badge renders children', () => {
    render(<Badge tone="success">OK</Badge>);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('Card renders children', () => {
    render(<Card><span>in-card</span></Card>);
    expect(screen.getByText('in-card')).toBeInTheDocument();
  });
});
