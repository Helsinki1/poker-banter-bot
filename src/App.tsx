import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OpponentId } from './game/types';
import { useMatch } from './state/useMatch';
import { useConversation } from './state/useConversation';
import { setActivePokerPersona } from './game/personas';
import CharacterPicker from './components/CharacterPicker';
import PokerRoom from './components/PokerRoom';
import { activeScene } from './scenes';
import './app.css';

type View =
  | { kind: 'picker' }
  | { kind: 'entering'; opponentId: OpponentId }
  | { kind: 'room'; opponentId: OpponentId };

export default function App() {
  // Dev-only deterministic scenes for visual review (?scene=name).
  const scene = useMemo(() => activeScene(), []);

  const [view, setView] = useState<View>(() => {
    if (scene?.config.view === 'room' && scene.config.opponentId) {
      return { kind: 'room', opponentId: scene.config.opponentId };
    }
    return { kind: 'picker' };
  });

  const opponentId = view.kind === 'room' || view.kind === 'entering' ? view.opponentId : null;
  const match = useMatch(view.kind === 'room' ? opponentId : null, scene?.config.scenario);
  const convo = useConversation(view.kind === 'room' ? opponentId : null, match.snapshot);

  // The chosen voice also selects the opponent's poker persona (one-way:
  // the conversation layer itself never touches the poker engine).
  useEffect(() => {
    setActivePokerPersona(convo.npcVoice);
  }, [convo.npcVoice]);

  // Cinematic transition: fade the picker away, then reveal the room.
  const handleStart = useCallback((id: OpponentId) => {
    setView({ kind: 'entering', opponentId: id });
  }, []);

  useEffect(() => {
    if (view.kind !== 'entering') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setView({ kind: 'room', opponentId: view.opponentId }), reduced ? 50 : 750);
    return () => clearTimeout(t);
  }, [view]);

  // Scene auto-begin: skip the intro beat and run the scripted hand.
  const phase = match.snapshot?.phase;
  useEffect(() => {
    if (scene?.config.autoBegin && phase === 'introduction') match.begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, phase]);

  const handleLeave = useCallback(() => {
    convo.disableVoice();
    setView({ kind: 'picker' });
  }, [convo]);

  return (
    <div className="app-shell">
      {view.kind === 'picker' && (
        <CharacterPicker initialSelected={scene?.config.pickerSelected} onStart={handleStart} />
      )}
      {view.kind === 'entering' && <div className="enter-curtain" aria-hidden="true" />}
      {view.kind === 'room' && opponentId && (
        <PokerRoom
          opponentId={opponentId}
          match={match}
          convo={convo}
          voiceDemo={scene?.config.voiceDemo}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
}
