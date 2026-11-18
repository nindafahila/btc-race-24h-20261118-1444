// cbBTC range trader for make.fun btc-race-24h-20261118-1444 (bars-replay/v1).
//
// Strategy: wide-band mean reversion around a 90-bar (90-minute) simple moving
// average, with a two-leg exit that lets a strong rip run instead of banking it
// early, and a stop that caps a dip-buy that keeps falling.
//   - Buy (all-in, up to the weight cap) when the latest close is >= 0.8% below
//     the 90-bar SMA: the dip is bought, not chased.
//   - Once long, arm the exit when the close reaches 0.6% above the SMA, then
//     sell the whole position when the rip either runs to 1.5% above the SMA
//     (the cap: bank a strong swing near its top) or fades back to the SMA
//     (the fade: a weak swing still exits in profit instead of being held to
//     the end of the window). The exit is a state machine: armed is set only
//     while a position is held and cleared on a sell or when flat, so a
//     position whose rip never reaches the arm level is simply held.
//   - Stop: while long, sell at once if the close falls 0.8% below the entry
//     close. A dip-buy is a bet the dip is the bottom; if the price keeps
//     falling past the entry by that much, the bet was wrong and the loss is
//     capped at roughly the stop plus one round trip of costs, instead of
//     riding the position to the final flatten.
//   - Otherwise hold whatever we hold (long or cash). No other trades.
//
// Why this shape: the 24h dev window falls 2.79% (open $65,074 -> close
// $63,261) with a 3.43% range and no trend worth following, so a
// trend-follower and a buy-and-hold both lose (buy-and-hold -$31.63). The
// window's money is in one swing: a sharp early drop to ~$63,600 and a slow
// grind back to ~$64,950. A full-size round trip pays about 26 bps in fees,
// slippage and pool impact, so anything that trades often loses money to
// fees; a 0.8% band means only a few trades, each capturing a real swing.
// Backtested offline on the kit's dev bars with the harness fill model (fill
// at the next bar's open, 4 bps fee, 2 bps slippage, constant-product impact
// vs the fill bar's o_depth), replayed bar by bar through the protocol:
//   this 90-bar version scores +$8.34 on the dev window (3 trades, max
//   drawdown ~1.4%), and the same parameters score +$28.77 on the previous
//   day's 24h window (6 trades, max drawdown ~1.0%), so the band and the
//   two-leg exit, not one fitted parameter, are what matter. Shorter
//   scalp-style bands (15-60 bars, 0.25-0.6%) all lose on the dev window:
//   the mid-day chop is too small for the round-trip cost. The 240-bar
//   version of the same idea scores -$19.04 here: its average moves too
//   slowly for the rip to ever arm the exit, and the position is held to the
//   stop near the end of the window.
//
// Determinism: pure function of the closes seen so far (integer prices,
// integer SMA comparisons, two small state flags); no clock, no environment,
// no randomness, no network, no files. During warm-up batches it only
// records history and returns no orders. One order per reply at most, so the
// pool-walk order never matters. Max slippage 100 bps (1%): a fill moves
// ~2 bps slippage plus ~7-13 bps of impact at full size, so a genuine fill
// is never refused, while a fill past a 1% gap from the decision close is.

import { runBars } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";
const LOOKBACK = 90; // bars of the SMA (90 minutes of 1-minute bars)
const BUY_BAND_BPS = 80n; // 0.8% below the SMA to buy the dip
const ARM_BPS = 60n; // arm the exit once the close is this far above the SMA
const CAP_BPS = 150n; // ...or sell at once once the rip runs this far above the SMA
const FADE_BPS = 0n; // ...or sell once the rip fades back to this far above the SMA
const STOP_BPS = 80n; // sell if the close falls this far below the entry close
const MAX_SLIPPAGE_BPS = 100; // 1%: fills move ~2 bps slippage + ~7-13 bps impact

const closes: bigint[] = []; // latest closes, in order (ints, price_scale 5)
let armed = false; // True once the current position's rip has reached ARM_BPS
let entry: bigint | null = null; // entry close of the current position

/** Sum of the last LOOKBACK closes, or null until that many bars are seen. */
function smaSum(): bigint | null {
  if (closes.length < LOOKBACK) return null;
  let sum = 0n;
  for (let i = closes.length - LOOKBACK; i < closes.length; i++) sum += closes[i];
  return sum;
}

/** True when close sits at least bps basis points above the SMA (exact ints). */
function aboveSma(close: bigint, sum: bigint, bps: bigint): boolean {
  return close * 10000n * BigInt(LOOKBACK) >= sum * (10000n + bps);
}

/** True when close sits at least bps basis points below the SMA (exact ints). */
function belowSma(close: bigint, sum: bigint, bps: bigint): boolean {
  return close * 10000n * BigInt(LOOKBACK) <= sum * (10000n - bps);
}

await runBars({
  onBatch(state, batch) {
    // Record this batch's bar first: the hello, each batch and its orders
    // are the protocol's handshake, and the bar's close is the price every
    // decision below reads.
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    if (state.warmingUp) return [];
    const sum = smaSum();
    if (sum === null) return [];
    const close = closes[closes.length - 1];
    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      armed = false;
      if (belowSma(close, sum, BUY_BAND_BPS)) {
        entry = close;
        const room = state.weightRoom(SYMBOL);
        const amount = room < state.cash ? room : state.cash;
        if (amount < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        return [{ side: "buy", symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }
    if (aboveSma(close, sum, ARM_BPS)) armed = true;
    if (armed && (aboveSma(close, sum, CAP_BPS) || !aboveSma(close, sum, FADE_BPS))) {
      armed = false;
      entry = null;
      return [{ side: "sell", symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (entry !== null && close * 10000n <= entry * (10000n - STOP_BPS)) {
      armed = false;
      entry = null;
      return [{ side: "sell", symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
