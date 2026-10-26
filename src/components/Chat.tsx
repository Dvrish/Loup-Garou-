import { useEffect, useRef, useState } from 'react';
import { play } from '../lib/audio';
import type { ChatMessage } from '../lib/types';

interface Props {
  phase: 'nuit' | 'jour' | 'vote';
  isWolf: boolean;
  pseudo: string;
  publicMessages: ChatMessage[];
  wolfMessages: ChatMessage[];
  onSend: (channel: 'public' | 'loups', text: string) => void;
}

export function Chat({ phase, isWolf, pseudo, publicMessages, wolfMessages, onSend }: Props) {
  const night = phase === 'nuit';
  const [tab, setTab] = useState<'public' | 'loups'>(night && isWolf ? 'loups' : 'public');
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTab(night && isWolf ? 'loups' : 'public');
  }, [night, isWolf]);

  const messages = tab === 'public' ? publicMessages : wolfMessages;
  const canWrite = tab === 'public' ? !night : night && isWolf;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, tab]);

  return (
    <section className={`chat panel ${tab === 'loups' ? 'chat--wolves' : ''}`}>
      <div className="chat__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'public'} className={tab === 'public' ? 'is-active' : ''} onClick={() => setTab('public')}>
          Place du village
        </button>
        {isWolf && (
          <button role="tab" aria-selected={tab === 'loups'} className={tab === 'loups' ? 'is-active' : ''} onClick={() => setTab('loups')}>
            🐺 Meute {night && <span className="pulse-dot" />}
          </button>
        )}
      </div>
      <div className="chat__list" ref={listRef}>
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
                ? 'Le village dort… silence.'
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
