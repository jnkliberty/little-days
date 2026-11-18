// The bunny's idle motion and its save reaction, in plain JavaScript (DESIGN.md: Bunny, Motion).
// Breathing and blinking are CSS animations that only run while the bunny has `.is-visible`.
// This file decides when that is: on screen, page visible, and no request for reduced motion.
// It also plays the rare ear twitch, the hop with a wiggle when a record saves, and the hop and ear wiggle when the person taps the header bunny. All move `transform` only.
const LittleDaysBunny = (() => {
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  let timer = null;

  // One drawing for every place the bunny lives. Ears and eyes are separate groups so they can move on their own.
  const svg = cls => `<svg class="bunny ${cls}" data-idle viewBox="0 0 80 80" aria-hidden="true" focusable="false"><g class="bunny-breathe" fill="#FFF8E9" stroke="#7966AF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><g class="bunny-ear bunny-ear-l"><path d="M23 43C12 30 13 8 21 6c8-2 12 18 13 30"/><path fill="#ABA0E7" stroke="none" d="M24 33C19 22 18 13 21 12c4 0 7 13 8 21"/></g><g class="bunny-ear bunny-ear-r"><path d="M46 36C48 16 56 4 62 9c7 6-1 26-9 35"/><path fill="#ABA0E7" stroke="none" d="M51 33c3-12 8-21 10-19 2 3-3 15-6 21"/></g><path d="M17 47c0-13 10-19 23-19s24 7 24 20c0 14-10 22-24 22S17 61 17 47Z"/><g class="bunny-eyes" fill="#2F2E33" stroke="none"><ellipse cx="30" cy="47" rx="2.6" ry="3"/><ellipse cx="50" cy="47" rx="2.6" ry="3"/></g><path fill="#2F2E33" stroke="none" d="M36 54q4-3 8 0l-4 4Z"/></g></svg>`;

  const live = () => [...document.querySelectorAll('.bunny.is-visible')].filter(el => el.isConnected);
  const allowed = () => !document.hidden && !reduced.matches;

  function play(el, frames, options, id) {
    if (!allowed() || !el?.classList.contains('is-visible') && !el?.closest('.bunny.is-visible')) return null;
    // The curve belongs to each step, so the whole move is not squeezed into its first moments.
    const animation = el.animate(frames.map((frame, i) => i < frames.length - 1 ? {...frame, easing: EASE} : frame), {easing: 'linear', ...options});
    animation.id = id;
    return animation;
  }

  // The right ear flicks. One small turn, under 300 ms.
  function twitch() {
    const bunnies = live();
    if (!allowed() || !bunnies.length) return;
    const bunny = bunnies[Math.floor(Math.random() * bunnies.length)];
    play(bunny.querySelector('.bunny-ear-r'), [{transform: 'rotate(0deg)'}, {transform: 'rotate(-9deg)'}, {transform: 'rotate(2deg)'}, {transform: 'rotate(0deg)'}], {duration: 280}, 'bunny-twitch');
  }

  // A record saved: the bunny on screen hops once and wiggles (a happy turn each way). Under 300 ms.
  function react() {
    const bunny = live()[0];
    if (bunny && !bunny.getAnimations().some(a => a.id === 'bunny-react' && a.playState === 'running')) play(bunny, [{transform: 'translateY(0) rotate(0deg)'}, {transform: 'translateY(-6px) rotate(-7deg)'}, {transform: 'translateY(-2px) rotate(6deg)'}, {transform: 'translateY(0) rotate(0deg)'}], {duration: 280}, 'bunny-react');
  }

  // The person taps the header bunny: one hop and a wiggle of both ears. Same rules as the other moves: transform only, under 300 ms, nothing under reduced motion.
  function tap(button) {
    const bunny = button?.querySelector('.bunny.is-visible');
    if (!bunny || !allowed() || bunny.getAnimations({subtree: true}).some(a => a.id === 'bunny-tap' && a.playState === 'running')) return;
    play(bunny, [{transform: 'translateY(0)'}, {transform: 'translateY(-6px)'}, {transform: 'translateY(0)'}], {duration: 260}, 'bunny-tap');
    play(bunny.querySelector('.bunny-ear-l'), [{transform: 'rotate(0deg)'}, {transform: 'rotate(9deg)'}, {transform: 'rotate(-3deg)'}, {transform: 'rotate(0deg)'}], {duration: 280}, 'bunny-tap');
    play(bunny.querySelector('.bunny-ear-r'), [{transform: 'rotate(0deg)'}, {transform: 'rotate(-9deg)'}, {transform: 'rotate(3deg)'}, {transform: 'rotate(0deg)'}], {duration: 280}, 'bunny-tap');
  }

  const scheduled = () => timer !== null;
  // One timer for the whole page, so a redraw does not reset the wait. It runs only while a bunny can be seen.
  function sync() {
    // A hop or a twitch under way stops when motion is no longer allowed.
    if (!allowed()) document.getAnimations().filter(a => a.id === 'bunny-react' || a.id === 'bunny-twitch' || a.id === 'bunny-tap').forEach(a => a.cancel());
    const run = allowed() && live().length > 0;
    if (run && timer === null) timer = setTimeout(function again() { twitch(); timer = setTimeout(again, 5000 + Math.random() * 5000); }, 3000 + Math.random() * 3000);
    if (!run && timer !== null) { clearTimeout(timer); timer = null; }
  }

  const observer = new IntersectionObserver(entries => { entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting && entry.target.isConnected)); sync(); });
  // Call after each redraw: new bunnies start watching, bunnies that left the page stop.
  function scan(root = document) { root.querySelectorAll('.bunny[data-idle]').forEach(el => observer.observe(el)); sync(); }
  // Call before each redraw: the old bunnies are about to be replaced.
  function release() { observer.disconnect(); sync(); }

  reduced.addEventListener('change', sync);
  document.addEventListener('click', event => { const button = event.target.closest?.('.bunny-btn'); if (button) tap(button); });
  return {svg, scan, release, sync, twitch, react, tap, scheduled};
})();
