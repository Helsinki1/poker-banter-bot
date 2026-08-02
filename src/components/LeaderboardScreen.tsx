import { useEffect, useState } from 'react';
import { CHARACTER_MAP } from '../characters/data';
import { loadLeaderboard, type LeaderboardEntry } from '../state/leaderboard';
import './leaderboard.css';

// Home screen: the arcade leaderboard. Every session likely belongs to a
// different player, so the board — not a lobby — is what greets them.

interface Props {
  onPlay: () => void;
  /** Entry to spotlight (the score the player just cashed out). */
  highlight?: { name: string; score: number };
}

export default function LeaderboardScreen({ onPlay, highlight }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    void loadLeaderboard().then((list) => { if (live) setEntries(list); });
    return () => { live = false; };
  }, []);

  // Spotlight only the best-ranked row matching the fresh entry.
  const highlightIndex = highlight
    ? entries?.findIndex((e) => e.name === highlight.name && e.score === highlight.score) ?? -1
    : -1;

  return (
    <div className="lobby">
      <header className="lobby-head">
        <h1 className="lobby-title">Poker Banter</h1>
        <p className="lobby-sub">Heads-up hold&rsquo;em, play-money only. Run it up, cash out, make the board.</p>
      </header>

      <div className="board-frame" data-testid="leaderboard">
        <div className="board-row board-row-head" aria-hidden="true">
          <span className="col-rank">#</span>
          <span className="col-name">Player</span>
          <span className="col-opp">Opponent</span>
          <span className="col-score">Chips</span>
        </div>
        <ol className="board-list">
          {entries === null && <li className="board-empty">Reading the books…</li>}
          {entries?.length === 0 && (
            <li className="board-empty">No scores yet — be the first name on the board.</li>
          )}
          {entries?.map((e, i) => {
            const ch = CHARACTER_MAP[e.opponentId];
            return (
              <li
                key={`${e.at}-${e.name}-${i}`}
                className={`board-row${i === highlightIndex ? ' fresh' : ''}${i < 3 ? ` top-${i + 1}` : ''}`}
              >
                <span className="col-rank">{i + 1}</span>
                <span className="col-name">{e.name}</span>
                <span className="col-opp" style={{ color: ch.accent }}>{ch.shortName}</span>
                <span className="col-score">{e.score.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <footer className="lobby-foot">
        <button className="start-btn" onClick={onPlay} data-testid="play">
          Play
        </button>
      </footer>
    </div>
  );
}
