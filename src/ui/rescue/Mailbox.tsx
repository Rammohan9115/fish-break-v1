// Dr. Fisher's mailbox (his letters stay readable forever) and the little journal.
import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, EmptyState, Sheet, Tabs } from '../kit';
import { DrFisher } from './CareIcon';

type MailTab = 'letters' | 'journal';

export function Mailbox() {
  const panel = useGameStore((s) => s.panel);
  const mail = useGameStore((s) => s.game.mail);
  const journal = useGameStore((s) => s.game.journal);
  const readLetter = useGameStore((s) => s.readLetter);
  const openPanel = useGameStore((s) => s.openPanel);
  const openRescue = useGameStore((s) => s.openRescue);
  const [tab, setTab] = useState<MailTab>('letters');
  const [openId, setOpenId] = useState<string | null>(null);
  if (panel !== 'mail') return null;
  const letter = mail.find((l) => l.id === openId);
  const sorted = [...mail].sort((a, b) => b.at - a.at);
  return (
    <Sheet
      title="📬 Mailbox"
      onClose={() => {
        setOpenId(null);
        openPanel(null);
      }}
      className="mailbox"
      scrollKey={`${tab}:${openId}`}
      tabs={<Tabs<MailTab> ariaLabel="Mailbox" value={tab} onChange={(t) => { setTab(t); setOpenId(null); }} items={[{ id: 'letters', label: '✉️ Letters' }, { id: 'journal', label: '📖 Journal' }]} />}
    >
      {tab === 'journal' ? (
        journal.length === 0 ? (
          <EmptyState icon="📖" title="Nothing here yet" body="Rescued animals leave a note in your journal." />
        ) : (
          <ul className="mail-list">
            {journal.map((j) => (
              <li className="tile" key={j.id}>
                <span className="meta">{new Date(j.at).toLocaleDateString()}</span>
                <p>{j.text}</p>
              </li>
            ))}
          </ul>
        )
      ) : letter ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
            ← All letters
          </Button>
          <div className="rescue-file">
            <DrFisher size={72} />
            <strong>{letter.title}</strong>
          </div>
          <div className="letter">
            <p>{letter.body}</p>
          </div>
          {letter.action === 'rescueBoard' && (
            <Button variant="primary" block onClick={() => openRescue(null)}>
              Open the Rescue Board 🩺
            </Button>
          )}
        </>
      ) : sorted.length === 0 ? (
        <EmptyState icon="📬" title="No letters yet" body="Dr. Fisher’s letters arrive here." />
      ) : (
        <ul className="mail-list">
          {sorted.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="tile mail-row"
                onClick={() => {
                  setOpenId(l.id);
                  readLetter(l.id);
                }}
              >
                <DrFisher size={40} />
                <span className="mail-main">
                  <strong>{l.title}</strong>
                  <span className="meta">{new Date(l.at).toLocaleDateString()}</span>
                </span>
                {!l.read && <Badge tone="love">New</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
