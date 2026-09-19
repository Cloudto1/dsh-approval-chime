/**
 * r13v (independent verifier, task t3) — the adversarial product mutations, shared by the
 * generator (r13v-make-adversarial-probes.mjs) and the style checker
 * (r13v-adv-bell-checker.mjs), so the two can never drift apart.
 *
 * `from` is the LITERAL text of lib/client.js (verified to occur exactly once by the
 * generator); probe-18's driver and the checker both do plain string substitution.
 */
export const ADVERSARIAL_MUTATIONS = [
  {
    name: 'adv-muted-bell-filled',
    what: 'rev-14 break: the blue fill moves from the AUDIBLE state to the plain .dacBell class, so a MUTED session is filled blue too',
    from: "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    to: "'.dacBell{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
  },
  {
    name: 'adv-bell-hover-dropped',
    what: 'rev-14 break: the filled bell loses its own :hover rule (the generic .dacBell:hover then wipes the blue under the pointer)',
    from: "'.dacBell[data-muted=\"false\"]:hover{background:' + BELL_ON_BG_HOVER + ';}',",
    to: '',
  },
  {
    name: 'adv-bell-token-hardcoded',
    what: 'rev-14 break: the fill copies the hex value instead of using the switch/slider design token',
    from: "'.dacBell[data-muted=\"false\"]{background:' + BELL_ON_BG + ';color:' + BELL_ON_FG + ';}'",
    to: "'.dacBell[data-muted=\"false\"]{background:#2563eb;color:#fff;}'",
  },
  {
    name: 'adv-muted-bell-recolored',
    what: 'rev-14 break: the muted bell stops using the caption-grey token',
    from: "'.dacBell[data-muted=\"true\"]{color:var(--dsw-alias-label-caption,#71717a);}',",
    to: "'.dacBell[data-muted=\"true\"]{color:#000;}',",
  },
];
