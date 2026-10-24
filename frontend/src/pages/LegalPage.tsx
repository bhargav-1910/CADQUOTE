import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { buildLegalDocuments, LEGAL_NAV, LegalSection, LegalSlug } from '@/legal/content';
import { useLegalInfo } from '@/legal/useLegalInfo';
import LegalFooter from '@/components/LegalFooter';


const VALID_SLUGS = new Set(LEGAL_NAV.map((item) => item.slug));

const Section = ({ section }: { section: LegalSection }) => (
  <section className="scroll-mt-24">
    <h2 className="text-xl text-ink sm:text-2xl">{section.heading}</h2>

    {section.body?.map((paragraph) => (
      <p key={paragraph.slice(0, 60)} className="mt-3 text-[15px] leading-relaxed text-ink-subtle">
        {paragraph}
      </p>
    ))}

    {section.bullets && (
      <ul className="mt-4 space-y-2.5">
        {section.bullets.map((bullet) => (
          <li key={bullet.slice(0, 60)} className="flex gap-3 text-[15px] leading-relaxed text-ink-subtle">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    )}

    {section.table && (
      <div className="mt-5 overflow-x-auto rounded-xl border border-edge">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-surface-muted">
              {section.table.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-b border-edge px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.table.rows.map((row) => (
              <tr key={row.join('|').slice(0, 80)} className="align-top">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-b border-edge px-4 py-3 leading-relaxed text-ink-subtle"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const LegalPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const info = useLegalInfo();

  const isValid = Boolean(slug) && VALID_SLUGS.has(slug as LegalSlug);
  const documents = buildLegalDocuments(info);
  const doc = isValid ? documents[slug as LegalSlug] : null;

  useEffect(() => {
    if (doc) {
      document.title = `${doc.title} — ${info.app_name}`;
    }
    window.scrollTo(0, 0);
  }, [doc, info.app_name]);

  // Unknown slug: send visitors to the privacy policy rather than a dead end.
  if (!isValid) {
    return <Navigate to="/legal/privacy" replace />;
  }
  if (!doc) return null;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-canvas">
      <header className="border-b border-edge bg-surface-muted">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link to="/" className="text-[15px] font-bold tracking-tight text-ink">
            ForgeQuote
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-ink-subtle transition hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1180px] gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[240px_1fr] lg:py-16">
        <nav aria-label="Legal documents" className="lg:sticky lg:top-8 lg:self-start">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
            Legal
          </p>
          <ul className="mt-4 space-y-1">
            {LEGAL_NAV.map((item) => {
              const active = item.slug === doc.slug;
              return (
                <li key={item.slug}>
                  <Link
                    to={`/legal/${item.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                      active ? 'bg-surface-raised text-ink' : 'text-ink-subtle hover:bg-surface-raised hover:text-ink'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 rounded-xl border border-edge p-4 bg-surface">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Report an issue
            </p>
            <a
              href={`mailto:${info.security_email}`}
              className="mt-2 block break-all text-sm text-primary-300 transition hover:text-primary-200"
            >
              {info.security_email}
            </a>
          </div>
        </nav>

        <article>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">
            {info.company_name} · Version {info.policy_version}
          </p>
          <h1 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-subtle">{doc.summary}</p>
          <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-ink-muted">
            LAST UPDATED {info.policy_version.toUpperCase()}
          </p>

          <div className="mt-10 space-y-10">
            {doc.sections.map((section) => (
              <Section key={section.heading} section={section} />
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-edge p-5 bg-surface">
            <p className="text-sm leading-relaxed text-ink-subtle">
              {info.company_name}, {info.company_address}. General enquiries{' '}
              <a href={`mailto:${info.contact_email}`} className="text-primary-300 hover:text-primary-200">
                {info.contact_email}
              </a>
              , privacy{' '}
              <a href={`mailto:${info.privacy_email}`} className="text-primary-300 hover:text-primary-200">
                {info.privacy_email}
              </a>
              .
            </p>
          </div>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
};

export default LegalPage;
