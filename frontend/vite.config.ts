import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Public, indexable pages. Everything else is behind login or private.
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  ...['privacy', 'terms', 'cookies', 'disclaimer', 'security', 'disclosure'].map((slug) => `/legal/${slug}`),
]

/**
 * Search and link-preview files that depend on the deployed URL.
 * robots.txt is always emitted. With VITE_SITE_URL set (e.g. https://forgequote.app)
 * the build also emits sitemap.xml and the absolute og:url / og:image tags that
 * WhatsApp, LinkedIn and X require. The admin path is deliberately not listed.
 */
const siteMeta = (siteUrl: string): Plugin => ({
  name: 'forgequote-site-meta',
  transformIndexHtml() {
    if (!siteUrl) return []
    return [
      { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}/` }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image', content: `${siteUrl}/og-image.png` }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'twitter:image', content: `${siteUrl}/og-image.png` }, injectTo: 'head' },
    ]
  },
  generateBundle() {
    const robots = [
      'User-agent: *',
      // Customer quote links are private; the app itself is behind login.
      'Disallow: /q/',
      'Disallow: /workspace',
      'Disallow: /quote',
      'Disallow: /customers',
      'Disallow: /billing',
      ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : []),
      '',
    ].join('\n')
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })

    if (siteUrl) {
      const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${siteUrl}${p === '/' ? '/' : p}</loc></url>`).join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })
    }
  },
})

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const siteUrl = (loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL || '').replace(/\/+$/, '')
  return {
    plugins: [react(), siteMeta(siteUrl)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      // Emscripten CJS module: prebundle so dev-server ESM imports work.
      include: ['occt-import-js'],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
