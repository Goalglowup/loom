import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LandingPage from '../LandingPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  it('renders the Loom branding', () => {
    renderPage();
    // Multiple instances of "Loom" expected
    expect(screen.getAllByText(/Loom/i).length).toBeGreaterThan(0);
  });

  it('renders Sign in link to /login', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: /sign in/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/login');
  });

  it('renders Get started free link to /signup', () => {
    renderPage();
    // There are two "Get started free" links; just verify at least one
    const links = screen.getAllByRole('link', { name: /get started free/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/signup');
  });

  it('renders feature cards', () => {
    renderPage();
    expect(screen.getAllByText(/Multi-provider routing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Encrypted trace recording/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Per-tenant API keys/i).length).toBeGreaterThan(0);
  });

  it('renders the hero tagline', () => {
    renderPage();
    expect(screen.getByText(/Provider-agnostic AI gateway/i)).toBeInTheDocument();
  });

  it('renders footer with current year', () => {
    renderPage();
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });
});
