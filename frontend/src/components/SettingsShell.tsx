import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import Breadcrumbs from '@/components/Breadcrumbs';

const TABS = [
  { to: '/settings/account', label: 'Account' },
  { to: '/settings/rates', label: 'Cost Master' },
  { to: '/settings/billing', label: 'Billing' },
];

/** Shared frame for /settings/*: breadcrumb plus tabs, so phones can switch sections without the sidebar. */
const SettingsShell = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-5 p-4 sm:p-6 lg:p-8">
    <Breadcrumbs items={[{ label: 'Settings' }, { label: title }]} />
    <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-edge px-4 sm:mx-0 sm:px-0">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
    {children}
  </div>
);

export default SettingsShell;
