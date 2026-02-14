import { homepageStyles } from '../styles';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { QuickOnboarding } from './QuickOnboarding';
import { SupportedTools } from './SupportedTools';
import { Footer } from './Footer';

export function Homepage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <title>tickmcp &mdash; TickTick MCP Server</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: homepageStyles }} />
      </head>
      <body>
        <a href="#main" className="skip">Skip to Main Content</a>
        <Nav />
        <Hero />
        <main id="main">
          <QuickOnboarding />
          <SupportedTools />
        </main>
        <Footer />
      </body>
    </html>
  );
}
