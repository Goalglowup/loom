import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LandingPage from '../LandingPage';

async function renderPage() {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
  // Flush the useEffect fetch (fails in test env) so the state update doesn't fire after the test
  await act(async () => {});
}

describe('LandingPage', () => {
  it('renders the Arachne branding', async () => {
    await renderPage();
    // Multiple instances of "Arachne" expected
    expect(screen.getAllByText(/Arachne/i).length).toBeGreaterThan(0);
  });

  it('renders Sign in link to /login', async () => {
    await renderPage();
    const links = screen.getAllByRole('link', { name: /sign in/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/login');
  });

  it('renders Join the Beta link when signups are disabled', async () => {
    await renderPage();
    const links = screen.getAllByRole('link', { name: /join the beta/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '#beta-signup');
  });

  it('renders feature sections', async () => {
    await renderPage();
    expect(screen.getByText(/A Spec for Agents \+ Knowledge/i)).toBeInTheDocument();
    expect(screen.getByText(/Build AI Agents Like Containers/i)).toBeInTheDocument();
  });

  it('renders the hero tagline', async () => {
    await renderPage();
    expect(screen.getByText(/Docker for AI Agents/i)).toBeInTheDocument();
  });

  it('renders footer with current year', async () => {
    await renderPage();
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });
});
