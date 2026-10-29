import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from '../../hooks/useTranslations';
import { createGame, type Action, type GameHandle, type HudState } from './engine';

// Оболочка мини-игры: канвас, HUD, клавиатура (только когда игра в фокусе), тач-джойстик.

type Props = { onExit: () => void; fullscreen: boolean };

const MONO = 'var(--font-mono, ui-monospace, monospace)';
const DISPLAY = 'var(--font-display, system-ui, sans-serif)';

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const ACTIONS: Record<string, Action> = {
  KeyJ: 'attack', KeyK: 'jump', Space: 'jump', KeyL: 'roll', ShiftLeft: 'roll', ShiftRight: 'roll', Semicolon: 'roll', KeyE: 'roll',
};

const Heart = ({ full }: { full: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] drop-shadow" aria-hidden="true">
    <path
      d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
      fill={full ? 'var(--site-accent)' : 'transparent'}
      stroke={full ? 'var(--site-bg)' : 'rgba(255,255,255,0.35)'}
      strokeWidth="1.6"
    />
  </svg>
);

export default function MiniGame({ onExit, fullscreen }: Props) {
  const { t } = useTranslations();
  const g = t.game;
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const held = useRef(new Set<string>());
  const [hud, setHud] = useState<HudState | null>(null);
  const [focused, setFocused] = useState(true);
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const touchRef = useRef(touch);
  touchRef.current = touch;

  useEffect(() => {
    const host = hostRef.current;
    const root = rootRef.current;
    if (!host || !root) return;
    let game: GameHandle | null = null;
    try {
      game = createGame(host, root, setHud);
    } catch {
      setHud({ phase: 'error', hp: 0, maxHp: 0, wave: 0, waves: 0, banner: null, boss: null });
      return;
    }
    gameRef.current = game;
    root.focus({ preventScroll: true });
    return () => {
      game?.dispose();
      gameRef.current = null;
    };
  }, []);

  const syncAxis = () => {
    let x = 0, y = 0;
    held.current.forEach((c) => { const m = MOVE[c]; if (m) { x += m[0]; y += m[1]; } });
    gameRef.current?.setAxis('kb', Math.sign(x), Math.sign(y));
  };

  const ended = hud?.phase === 'victory' || hud?.phase === 'gameover';

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const c = e.code;
    if (MOVE[c]) {
      e.preventDefault();
      held.current.add(c);
      syncAxis();
      return;
    }
    const a = ACTIONS[c];
    if (a) {
      e.preventDefault();
      if (!e.repeat) gameRef.current?.press(a);
      return;
    }
    if ((c === 'KeyR' || c === 'Enter') && ended && !e.repeat) {
      e.preventDefault();
      gameRef.current?.restart();
    }
  };
  const onKeyUp = (e: ReactKeyboardEvent) => {
    if (held.current.delete(e.code)) syncAxis();
  };

  const onFocus = () => {
    setFocused(true);
    gameRef.current?.setPaused(false);
  };
  const onBlur = (e: ReactFocusEvent) => {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    held.current.clear();
    syncAxis();
    setFocused(false);
    // на тач-устройствах фокус ненадёжен — там не ставим на паузу
    if (!touchRef.current) gameRef.current?.setPaused(true);
  };

  const onStagePointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') { setTouch(true); return; }
    if (e.button !== 0) return;
    const wasFocused = document.activeElement === rootRef.current;
    rootRef.current?.focus({ preventScroll: true });
    if (wasFocused) gameRef.current?.press('attack');
  };

  // --- джойстик ---
  const stickBase = useRef<HTMLDivElement>(null);
  const stickKnob = useRef<HTMLDivElement>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const STICK_R = 44;
  const placeStick = (bx: number | null, by: number | null, kx = 0, ky = 0) => {
    const b = stickBase.current, k = stickKnob.current;
    if (!b || !k) return;
    if (bx === null || by === null) {
      b.style.left = '';
      b.style.top = '';
      b.style.opacity = '0.55';
    } else {
      b.style.left = `${bx - 44}px`;
      b.style.top = `${by - 44}px`;
      b.style.opacity = '1';
    }
    k.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  };
  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setTouch(true);
    if (stick.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* синтетические события */ }
    placeStick(stick.current.x, stick.current.y);
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - r.left - s.x, dy = e.clientY - r.top - s.y;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
    placeStick(s.x, s.y, dx, dy);
    gameRef.current?.setAxis('stick', dx / STICK_R, -dy / STICK_R);
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    placeStick(null, null);
    gameRef.current?.setAxis('stick', 0, 0);
  };

  const pressBtn = useCallback((a: Action) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    gameRef.current?.press(a);
  }, []);

  const showPause = !focused && !touch && hud && hud.phase !== 'loading' && hud.phase !== 'error' && !ended;
  const banner =
    hud?.banner === 'round' ? g.round
      : hud?.banner === 'wave' ? g.wave.replace('{n}', String(hud.wave))
        : null;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`flex w-full flex-col outline-none ${fullscreen ? 'min-h-0 flex-1' : ''}`}
      aria-label={g.playLabel}
      role="application"
    >
      <div
        className={`relative w-full select-none overflow-hidden ${fullscreen ? 'min-h-0 flex-1' : 'aspect-[4/3.1]'}`}
        onPointerDown={onStagePointerDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={hostRef} className="absolute inset-0" style={{ touchAction: touch ? 'none' : 'pan-y' }} />

        {/* HUD */}
        {hud && hud.phase !== 'loading' && hud.phase !== 'error' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
            <div className="flex gap-0.5" aria-label={`${g.hp}: ${hud.hp}/${hud.maxHp}`}>
              {Array.from({ length: hud.maxHp }, (_, i) => <Heart key={i} full={i < hud.hp} />)}
            </div>
            {hud.boss !== null && (
              <div className="mt-0.5 min-w-0 flex-1 px-2 sm:max-w-[45%]">
                <div className="truncate text-center text-[10px] uppercase tracking-[.14em] text-white/70" style={{ fontFamily: MONO }}>{g.boss}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${hud.boss * 100}%`, background: 'var(--site-key)' }} />
                </div>
              </div>
            )}
            {hud.wave > 0 && (
              <span className="rounded-md bg-black/30 px-2 py-1 text-[11px] tracking-[.06em] text-white/80" style={{ fontFamily: MONO }}>
                {g.waveCounter.replace('{n}', String(hud.wave)).replace('{total}', String(hud.waves))}
              </span>
            )}
          </div>
        )}

        {banner && (
          <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center">
            <div
              key={banner}
              className="text-3xl tracking-wide text-[color:var(--site-accent)] drop-shadow-[0_2px_0_var(--site-bg)] sm:text-5xl"
              style={{ fontFamily: DISPLAY, animation: 'mg-pop .45s cubic-bezier(.2,1.4,.4,1) both' }}
            >
              {banner}
            </div>
          </div>
        )}

        {(!hud || hud.phase === 'loading' || hud.phase === 'error') && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-white/55" style={{ fontFamily: MONO }}>
            {hud?.phase === 'error' ? g.error : g.loading}
          </div>
        )}

        {showPause && (
          // не кнопка: фокус должен попасть на корень игры (его ставит onPointerDown сцены), а не на исчезающий элемент
          <div
            className="absolute inset-0 grid cursor-pointer place-items-center bg-[color:color-mix(in_srgb,var(--site-bg)_45%,transparent)] text-sm text-white"
            style={{ fontFamily: MONO }}
          >
            <span className="rounded-lg border border-white/15 bg-black/40 px-4 py-2">▶ {g.resume}</span>
          </div>
        )}

        {ended && hud && (
          // панель снизу, чтобы танец и сундук оставались видны
          <div
            className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-10 sm:pb-4"
            style={{
              animation: 'mg-fade .5s .8s both',
              background: 'linear-gradient(to top, color-mix(in srgb, var(--site-bg) 88%, transparent) 35%, transparent)',
            }}
          >
            <div className="text-center">
              <div
                className={`text-2xl sm:text-4xl ${hud.phase === 'victory' ? 'text-[color:var(--site-accent)]' : 'text-white'}`}
                style={{ fontFamily: DISPLAY }}
              >
                {hud.phase === 'victory' ? g.victory : g.gameOver}
              </div>
              <p className="mt-1 text-xs text-white/65 sm:text-sm" style={{ fontFamily: MONO }}>
                {hud.phase === 'victory' ? g.victorySub : g.gameOverSub}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { gameRef.current?.restart(); rootRef.current?.focus({ preventScroll: true }); }}
                  className="theme-accent-bg rounded-lg px-4 py-2 text-sm font-bold"
                >
                  ↻ {g.restart}
                </button>
                <button type="button" onClick={onExit} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">
                  {g.back}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* тач-управление */}
        {touch && !ended && (
          <>
            <div
              className="absolute bottom-0 left-0 h-[62%] w-1/2"
              style={{ touchAction: 'none' }}
              onPointerDown={onStickDown}
              onPointerMove={onStickMove}
              onPointerUp={onStickUp}
              onPointerCancel={onStickUp}
            >
              <div
                ref={stickBase}
                className="pointer-events-none absolute bottom-[18px] left-[18px] h-[88px] w-[88px] rounded-full border border-white/25 bg-white/5"
                style={{ transform: 'translate(0,0)', opacity: 0.55, marginLeft: 0 }}
              >
                <div
                  ref={stickKnob}
                  className="absolute left-1/2 top-1/2 h-9 w-9 rounded-full bg-[color:var(--site-accent)] opacity-80"
                  style={{ transform: 'translate(-50%, -50%)' }}
                />
              </div>
            </div>
            <div className="absolute bottom-2.5 right-2.5 grid grid-cols-[repeat(3,auto)] grid-rows-2 items-center gap-1.5" style={{ touchAction: 'none' }}>
              {([
                ['jump', g.controls.jumpShort, 'col-start-2 row-start-1'],
                ['roll', g.controls.evade, 'col-start-1 row-start-2'],
                ['attack', g.controls.attack, 'col-start-2 col-span-2 row-start-2 h-14 w-14 justify-self-end text-[11px]'],
              ] as Array<[Action, string, string]>).map(([a, label, cls]) => (
                <button
                  key={a}
                  type="button"
                  onPointerDown={pressBtn(a)}
                  className={`grid h-11 w-11 select-none place-items-center rounded-full border text-[9px] font-bold uppercase leading-none tracking-wide ${
                    a === 'attack' ? 'border-transparent bg-[color:var(--site-accent)] text-[color:var(--site-bg)]' : 'border-white/20 bg-black/35 text-white/85'
                  } ${cls}`}
                  style={{ fontFamily: MONO, touchAction: 'none' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* легенда управления (клавиатура) */}
      {!touch && (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 px-3.5 py-2.5 text-[11px] tracking-[.03em] text-white/55"
          style={{ fontFamily: MONO }}
        >
          {([
            ['WASD / ←↑↓→', g.controls.move],
            ['J / LMB', g.controls.attack],
            ['K / Space', g.controls.jump],
            ['Shift / L', g.controls.roll],
          ] as const).map(([k, label]) => (
            <span key={label} className="whitespace-nowrap">
              <span className="text-[color:var(--site-key,#fbbf24)]">{k}</span> {label}
            </span>
          ))}
          <span className="whitespace-nowrap">{g.slamHint}</span>
        </div>
      )}

      <style>{`
        @keyframes mg-pop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }
        @keyframes mg-fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
}
