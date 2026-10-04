/**
 * Harness router seats as the Claude and Codex quota cards.
 *
 * When OPENCHAMBER_ROUTER_STATUS_URL is set, the Claude and Codex providers read
 * the harness router's status JSON instead of one local login: every account
 * (seat) the router can use, its weekly and five-hour use, when its week
 * resets, and which seat auto/best would pick right now. The provider ids stay
 * `claude` and `codex` so clients that only know the built-in list (the
 * Android build) show the cards without an update.
 */

import { buildResult, toUsageWindow } from '../utils/index.js';

const WEEK_SECONDS = 7 * 24 * 3600;
const FIVE_HOURS_SECONDS = 5 * 3600;

export const routerStatusUrl = () => {
  const url = process.env.OPENCHAMBER_ROUTER_STATUS_URL;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
};

const CARDS = {
  claude: { providerId: 'claude', providerName: 'Claude', pool: 'claude' },
  codex: { providerId: 'codex', providerName: 'Codex', pool: 'gpt' },
};

const left = (used) => (typeof used === 'number' ? Math.max(0, 100 - used) : null);

const seatLabel = (seat) => {
  if (seat.coolingDown) return 'cooling down';
  const week = left(seat.week);
  const fiveHour = left(seat.fiveHour);
  return fiveHour === null ? `${week}% left` : `${week}% left · 5h ${fiveHour}%`;
};

const pickLabel = (status, pool) => {
  const picks = status.picks ?? {};
  const auto = picks.auto;
  const best = picks.best;
  const parts = [];
  if (auto) parts.push(`auto → ${auto.id}${auto.provider === pool ? '' : ` (${auto.model})`}`);
  if (best && best.id !== auto?.id && best.provider === pool) parts.push(`best → ${best.id}`);
  return parts.join(' · ') || null;
};

export const toRouterQuota = (status, card) => {
  const seats = (status.seats ?? [])
    .filter((seat) => seat.provider === card.pool)
    .sort((a, b) => (Number(a.coolingDown) - Number(b.coolingDown)) || ((b.score ?? 0) - (a.score ?? 0)));
  if (seats.length === 0) {
    return buildResult({ ...card, ok: false, configured: true, error: 'The router has no accounts for this provider' });
  }

  // The headline rows are the seat a request to this provider gets now.
  const top = seats[0];
  const windows = {
    '5h': toUsageWindow({ usedPercent: top.fiveHour ?? null, windowSeconds: FIVE_HOURS_SECONDS, resetAt: null }),
    '7d': toUsageWindow({ usedPercent: top.week, windowSeconds: WEEK_SECONDS, resetAt: top.resetsAt ?? null }),
  };
  if (top.fiveHour === null || top.fiveHour === undefined) delete windows['5h'];

  const models = {};
  for (const seat of seats) {
    models[seat.id] = {
      windows: {
        '7d': toUsageWindow({
          usedPercent: seat.week,
          windowSeconds: WEEK_SECONDS,
          resetAt: seat.resetsAt ?? null,
          valueLabel: seatLabel(seat),
        }),
      },
    };
  }

  return buildResult({
    ...card,
    ok: true,
    configured: true,
    planLabel: pickLabel(status, card.pool) ?? top.id,
    usage: { windows, models },
  });
};

const fetchRouterStatus = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Router status answered ${response.status}`);
  return response.json();
};

const routerCard = (key) => {
  const card = CARDS[key];
  return {
    providerId: card.providerId,
    providerName: card.providerName,
    isConfigured: () => true,
    fetchQuota: async () => {
      try {
        return toRouterQuota(await fetchRouterStatus(routerStatusUrl()), card);
      } catch (error) {
        return buildResult({ ...card, ok: false, configured: true, error: error instanceof Error ? error.message : 'Router status failed' });
      }
    },
  };
};

export const routerRegistryEntries = () => (routerStatusUrl() ? { claude: routerCard('claude'), codex: routerCard('codex') } : {});
