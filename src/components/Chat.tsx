import { useEffect, useRef, useState } from 'react';
import { play } from '../lib/audio';
import type { ChatMessage } from '../lib/types';

interface Props {
  night: boolean;
  /** Affiche l'onglet de la meute (loup vivant, ou spectateur). */
  showWolfTab: boolean;
  canWritePublic: boolean;
  canWriteWolves: boolean;
  pseudo: string;
  publicMessages: ChatMessage[];
  wolfMessages: ChatMessage[];
  onSend: (channel: 'public' | 'loups', text: string) => void;
}

export function Chat({ night, showWolfTab, canWritePublic, canWriteWolves, pseudo, publicMessages, wolfMessages, onSend }: Props) {
  const [tab, setTab] = useState<'public' | 'loups'>(night && showWolfTab ? 'loups' : 'public');
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTab(night && showWolfTab ? 'loups' : 'public');
  }, [night, showWolfTab]);

  const messages = tab === 'public' ? publicMessages : wolfMessages;
  const canWrite = tab === 'public' ? canWritePublic : canWriteWolves;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, tab]);

  return (
    <section className={`chat panel ${tab === 'loups' ? 'chat--wolves' : ''}`}>
      <div className="chat__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'public'} className={tab === 'public' ? 'is-active' : ''} onClick={() => setTab('public')}>
          Place du village
        </button>
        {showWolfTab && (
          <button role="tab" aria-selected={tab === 'loups'} className={tab === 'loups' ? 'is-active' : ''} onClick={() => setTab('loups')}>
            🐺 Meute {night && <span className="pulse-dot" />}
          </button>
        )}
      </div>
      <div className="chat__list" ref={listRef}>
        {messages.length === 0 && <p className="chat__empty">Aucun message pour l’instant.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.channel} ${m.author === pseudo ? 'msg--me' : ''}`}>
            {m.channel !== 'systeme' && <span className="msg__author">{m.author}</span>}
            <span className="msg__text">{m.text}</span>
          </div>
        ))}
      </div>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || !canWrite) return;
          onSend(tab, text.trim());
          play('message');
          setText('');
        }}
      >
        <input
          className="input"
          value={text}
          disabled={!canWrite}
          maxLength={240}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            canWrite
              ? tab === 'loups'
                ? 'Murmurez à la meute…'
                : 'Parlez au village…'
              : tab === 'public'
                ? night
                  ? 'Le village dort… silence.'
                  : 'Vous ne pouvez plus parler.'
                : 'La meute ne parle que la nuit.'
          }
        />
        <button className="btn btn--primary btn--sm" disabled={!canWrite || !text.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
