import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronRight, Lightbulb, Search } from 'lucide-react';
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle, type HelpBlock } from '@/content/help';
import { useAuth } from '@/components/AuthProvider';
import LegalFooter from '@/components/LegalFooter';
import { Input, buttonClasses } from '@/components/ui';

const searchableText = (blocks: HelpBlock[]) =>
  blocks.map((b) => ('text' in b ? b.text : b.items.join(' '))).join(' ').toLowerCase();

const Block = ({ block }: { block: HelpBlock }) => {
  switch (block.type) {
    case 'h':
      return <h2 className="mt-8 text-lg font-semibold text-ink">{block.text}</h2>;
    case 'p':
      return <p className="mt-3 leading-relaxed text-ink-secondary">{block.text}</p>;
    case 'list':
      return (
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-secondary marker:text-ink-subtle">
          {block.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      );
    case 'steps':
      return (
        <ol className="mt-4 space-y-3">
          {block.items.map((item, index) => (
            <li key={item} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-semibold text-primary-700 dark:text-primary-300">{index + 1}</span>
              <span className="leading-relaxed text-ink-secondary">{item}</span>
            </li>
          ))}
        </ol>
      );
    case 'tip':
      return (
        <p className="mt-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          {block.text}
        </p>
      );
  }
};

/** Public help center: /help (index + search) and /help/:slug (article). */
const HelpPage = () => {
  const { slug } = useParams<{ slug?: string }>();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const article = helpArticle(slug);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return HELP_ARTICLES.filter((a) => `${a.title} ${a.summary} ${searchableText(a.body)}`.toLowerCase().includes(q));
  }, [query]);

  if (slug && !article) return <Navigate to="/help" replace />;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-canvas">
      <header className="border-b border-edge bg-surface-muted">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link to="/help" className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink">
            <BookOpen className="h-5 w-5 text-primary-600 dark:text-primary-300" />
            ForgeQuote Help
          </Link>
          <Link to={user ? '/dashboard' : '/login'} className={buttonClasses('secondary', 'sm')}>
            {user ? 'Open app' : 'Sign in'}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-8 lg:py-14">
        {article ? (
          <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
            <article className="min-w-0 max-w-3xl">
              <Link to="/help" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
                <ArrowLeft className="h-4 w-4" /> All help articles
              </Link>
              <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">{article.category}</p>
              <h1 className="mt-2 text-3xl font-bold text-ink">{article.title}</h1>
              <p className="mt-2 text-lg text-ink-muted">{article.summary}</p>
              <div className="mt-4">
                {article.body.map((block, index) => <Block key={index} block={block} />)}
              </div>
            </article>
            <aside className="lg:sticky lg:top-8 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">More in {article.category}</p>
              <ul className="mt-3 space-y-1">
                {HELP_ARTICLES.filter((a) => a.category === article.category && a.slug !== article.slug).map((a) => (
                  <li key={a.slug}>
                    <Link to={`/help/${a.slug}`} className="block rounded-lg px-3 py-2 text-sm text-ink-secondary hover:bg-surface-raised hover:text-ink">{a.title}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-ink">How can we help?</h1>
            <div className="relative mt-5 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help, e.g. versions, drawings, margin" aria-label="Search help" className="pl-9" autoFocus />
            </div>

            {results ? (
              <section className="mt-8">
                <p className="text-sm text-ink-muted">{results.length} result{results.length === 1 ? '' : 's'}</p>
                <ArticleList articles={results} />
              </section>
            ) : (
              <div className="mt-10 grid gap-8 md:grid-cols-2">
                {HELP_CATEGORIES.map((category) => (
                  <section key={category}>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{category}</h2>
                    <ArticleList articles={HELP_ARTICLES.filter((a) => a.category === category)} />
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <LegalFooter />
    </div>
  );
};

const ArticleList = ({ articles }: { articles: typeof HELP_ARTICLES }) => (
  <ul className="mt-3 divide-y divide-edge overflow-hidden rounded-2xl border border-edge bg-surface">
    {articles.map((a) => (
      <li key={a.slug}>
        <Link to={`/help/${a.slug}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-muted">
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">{a.title}</span>
            <span className="block text-sm text-ink-muted">{a.summary}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle" />
        </Link>
      </li>
    ))}
  </ul>
);

export default HelpPage;
