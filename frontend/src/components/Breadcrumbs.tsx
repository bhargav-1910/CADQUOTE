import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

/** "Dashboard › … › current page". The last crumb is the current page and is never a link. */
const Breadcrumbs = ({ items }: { items: Crumb[] }) => (
  <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
    <Link to="/dashboard" className="flex shrink-0 items-center gap-1 transition-colors hover:text-ink">
      <Home className="h-3.5 w-3.5" />
      Dashboard
    </Link>
    {items.map((item, index) => (
      <Fragment key={`${item.label}-${index}`}>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {item.to && index < items.length - 1 ? (
          <Link to={item.to} className="shrink-0 transition-colors hover:text-ink">{item.label}</Link>
        ) : (
          <span className="truncate font-medium text-ink" aria-current={index === items.length - 1 ? 'page' : undefined}>
            {item.label}
          </span>
        )}
      </Fragment>
    ))}
  </nav>
);

export default Breadcrumbs;
