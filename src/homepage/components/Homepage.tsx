import { homepageStyles } from '../styles';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { QuickOnboarding } from './QuickOnboarding';
import { SupportedTools } from './SupportedTools';
import { Footer } from './Footer';

export function Homepage() {
  const BASE_URL = '__BASE_URL__';
  const publishedDate = '2026-02-15';
  const description =
    'tickmcp is a remote multi-user TickTick MCP server on Cloudflare Workers with OAuth, durable auth sessions, and production-ready MCP endpoints.';
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'tickmcp',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    description,
    url: BASE_URL,
    datePublished: publishedDate,
    dateModified: publishedDate,
    sameAs: ['https://github.com/maheshrijal/tickmcp'],
    author: {
      '@type': 'Person',
      name: 'Mahesh Rijal',
    },
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content="#111214" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f8f6ef" media="(prefers-color-scheme: light)" />
        <title>tickmcp | Remote TickTick MCP Server</title>
        <meta name="description" content={description} />
        <meta name="author" content="Mahesh Rijal" />
        <meta property="article:published_time" content={publishedDate} />
        <meta property="article:modified_time" content={publishedDate} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={BASE_URL} />
        <link rel="sitemap" type="application/xml" href={`${BASE_URL}/sitemap.xml`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="tickmcp | Remote TickTick MCP Server" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={BASE_URL} />
        <meta property="og:image" content={`${BASE_URL}/social-card.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="tickmcp | Remote TickTick MCP Server" />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${BASE_URL}/social-card.jpg`} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {/*
          homepageStyles is a static CSS string imported from '../styles' and does not
          contain any user input. Using dangerouslySetInnerHTML here is safe in this
          specific case, but this pattern must not be used with untrusted content.
        */}
        <style dangerouslySetInnerHTML={{ __html: homepageStyles }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
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
