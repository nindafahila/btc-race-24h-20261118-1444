# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/nindafahila/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/nindafahila/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A cbBTC range-trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty: it trades Coinbase Wrapped BTC against USDC, minute by minute, on 1-minute on-chain prices with $1,000 of paper money. Mean reversion around a 90-bar (90-minute) moving average — buy dips at least 0.8% below the average, sell when the rip fades back to it, with a stop 0.8% below the entry. On the published 24h dev window it scores +$8.34 net PnL after every fee, slippage and pool impact (3 trades, max drawdown ~1.4%), passing the dev gate.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` on stdin/stdout: one JSON line per minute bar in, one reply per batch out. No network, no clock, no randomness — a pure function of the closes seen so far, so two runs on the same data produce the same orders.

---

<sub>Entered on [make.fun](https://make.fun/?ref=xqemgw87&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
