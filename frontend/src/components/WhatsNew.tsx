import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CHANGELOG, LATEST_CHANGELOG_ID } from '@/content/changelog';
import { Button, Dialog } from '@/components/ui';

const SEEN_KEY = 'fq-changelog-seen';

const readSeen = () => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return LATEST_CHANGELOG_ID; }
};

/** Unread flag plus a setter that marks the latest entry as seen. */
export const useWhatsNew = () => {
  const [unread, setUnread] = useState(() => readSeen() !== LATEST_CHANGELOG_ID);
  const markSeen = () => {
    setUnread(false);
    try { localStorage.setItem(SEEN_KEY, LATEST_CHANGELOG_ID); } catch { /* private mode */ }
  };
  return { unread, markSeen };
};

export const WhatsNewDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} labelledBy="whats-new-title" className="max-w-lg">
    <div className="p-6">
      <h2 id="whats-new-title" className="text-lg font-semibold text-ink">What’s new</h2>
      <div className="mt-4 max-h-[60vh] space-y-6 overflow-y-auto pr-1">
        {CHANGELOG.map((entry) => (
          <section key={entry.id}>
            <p className="text-xs font-medium text-ink-muted">{entry.date}</p>
            <h3 className="mt-0.5 font-semibold text-ink">{entry.title}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-secondary marker:text-ink-subtle">
              {entry.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {entry.help && (
              <Link to={entry.help} onClick={onClose} className="mt-2 inline-block text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                Learn more
              </Link>
            )}
          </section>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Got it</Button>
      </div>
    </div>
  </Dialog>
);
