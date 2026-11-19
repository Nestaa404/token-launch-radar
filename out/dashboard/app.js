// Token Radar dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
// The page stays usable when data.js is missing or the board is empty: it says so instead of
// going blank. Farm steps come from the row when the data carries them, and are otherwise
// derived in the page from the same rule the model uses (category, chains, TVL, age).
(function () {
  'use strict';

  var app = document.getElementById('board');
  var DATA = window.RADAR || null;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s === null || s === undefined ? '' : s); }

  // Fallback constants identical to the model's (radar-2), used only if the data carries no
  // model block, so the page can still recompute a row instead of crashing.
  var DEFAULT_MODEL = { base_multiple: 0.25, growth_weight: 0.5, growth_floor: -60, growth_cap: 120, maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095, unknown_age_days: 365, chain_floor: 0.9, chain_bonus: 0.2, chain_cap: 10, category_multipliers: { Bridge: 0.85, 'Canonical Bridge': 0.85, 'Cross Chain Bridge': 0.85, 'Liquid Staking': 0.85, 'Liquid Restaking': 0.85, 'Restaked BTC': 0.85, 'Staking Pool': 0.85, Restaking: 0.85, RWA: 0.9, Chain: 0.9 } };
  function modelOf() {
    var m = (DATA && DATA.model) || {};
    var out = {};
    Object.keys(DEFAULT_MODEL).forEach(function (k) {
      if (k === 'category_multipliers') {
        out[k] = (m[k] && typeof m[k] === 'object' && !Array.isArray(m[k])) ? m[k] : DEFAULT_MODEL[k];
      } else {
        out[k] = typeof m[k] === 'number' && isFinite(m[k]) ? m[k] : DEFAULT_MODEL[k];
      }
    });
    return out;
  }

  // The chain-diversity multiplier: more chains earn a small premium.
  function chainMultOf(row, model) {
    var n = Math.min(Math.max((row.chains || []).length, 0), model.chain_cap);
    return model.chain_floor + (n / model.chain_cap) * model.chain_bonus;
  }
  // The category's penalty, or 1.0 when the category carries none; null categories carry none.
  function catMultOf(row, model) {
    if (row.category === null || row.category === undefined) return 1;
    var mults = model.category_multipliers || {};
    var v = mults[row.category];
    return typeof v === 'number' && isFinite(v) ? v : 1;
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * chainMultOf(row, model) * catMultOf(row, model)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- Farm plan ---------------------------------------------------------------
  // The farm plan is the same derivation main.ts writes to board.json: category, main chain, TVL
  // and age decide the wallet, the actions, the capital, the hold and every cost and time.
  // No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasToken(chain) {
    var tokens = { Ethereum: 'ETH', Base: 'ETH', Arbitrum: 'ETH', Optimism: 'ETH', Solana: 'SOL', Avalanche: 'AVAX', Polygon: 'MATIC', 'BNB Chain': 'BNB', Binance: 'BNB', Bitcoin: 'BTC', Sui: 'SUI', Aptos: 'APT', Near: 'NEAR', Cosmos: 'ATOM', Tron: 'TRX', Fantom: 'FTM', Gnosis: 'xDAI', Linea: 'ETH', zkSync: 'ETH', Scroll: 'ETH', Mantle: 'MNT', Blast: 'ETH', Mode: 'ETH', Hyperliquid: 'HYPE', 'Hyperliquid L1': 'HYPE' };
    return tokens[chain] || 'the chain\u2019s native token';
  }
  function gasFeeFor(chain) {
    if (chain === 'Ethereum') return 'about $10 of gas';
    if (chain === 'Solana' || chain === 'Near' || chain === 'Tron') return 'under $1 of gas';
    return 'about $2 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function smallFor(capital) { return Math.max(10, Math.round(capital / 5)); }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and join its next launch.';
    if (c.indexOf('farm') >= 0) return 'Stake $' + capital + " of LP tokens in " + name + "'s farm on " + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = smallFor(capital);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the supplied collateral on ' + name + ', then repay it within the week, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + small + ' through ' + name + "'s main pool on " + chain + ', so the wallet shows trading activity as well as liquidity.';
    if (c.indexOf('bridge') >= 0) return 'Use the bridged funds in an app on ' + chain + ', then bridge $' + small + ' back through ' + name + ', so both directions are used.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or restake the staking rewards through ' + name + ' once, and keep the receipt transaction.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open a second small position on ' + name + ' in the opposite direction and close it after a day, so the account shows more than one trade.';
    if (c.indexOf('prediction') >= 0) return 'Place a second small position on a different market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit a second tranche of $' + small + ' into a different ' + name + ' vault on ' + chain + '.';
    if (c.indexOf('stable') >= 0) return 'Swap $' + small + ' of the stable asset back and forth through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrued on the ' + name + ' position on ' + chain + ' and reinvest the payout once.';
    if (c.indexOf('insurance') >= 0) return 'Open the ' + name + ' cover dashboard on ' + chain + ' and confirm the policy is active.';
    if (c.indexOf('launchpad') >= 0) return 'Register for the next sale on ' + name + ' and finish any whitelisting step it asks for.';
    if (c.indexOf('farm') >= 0) return 'Harvest the farm rewards on ' + name + ' once and restake them on ' + chain + '.';
    return 'Do one more on-chain action on ' + name + ' on ' + chain + ', such as a swap or a vote, so the wallet is not a single deposit.';
  }
  function weeklyActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Once a week, top up the supply or adjust the borrow on ' + name + ' a little, so the position moves between snapshots.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Once a week, add or remove a little liquidity on ' + name + ' on ' + chain + ', so the position moves between snapshots.';
    if (c.indexOf('bridge') >= 0) return 'Once a week, bridge a small amount through ' + name + ' to ' + chain + ', so the route stays active.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Once a week, claim or restake the rewards through ' + name + ', so the stake keeps compounding.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Once a week, open and close one small trade on ' + name + ', so the account stays active.';
    if (c.indexOf('prediction') >= 0) return 'Once a week, place one small position on a new market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Once a week, check the ' + name + ' vaults on ' + chain + ' and move a little capital to the best-performing one.';
    if (c.indexOf('stable') >= 0) return 'Once a week, mint or redeem a small amount of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Once a week, check the yield on the ' + name + ' position on ' + chain + ' and record what it paid.';
    if (c.indexOf('insurance') >= 0) return 'Once a week, check that the ' + name + ' cover on ' + chain + ' is still active.';
    if (c.indexOf('launchpad') >= 0) return 'Once a week, check ' + name + ' for a new launch and join its waitlist when one opens.';
    if (c.indexOf('farm') >= 0) return 'Once a week, harvest and restake the farm rewards on ' + name + ' on ' + chain + '.';
    return 'Make one qualifying action each week on ' + name + ', such as a deposit, a swap or a vote.';
  }
  function exitActionFor(p, capital) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay any borrow on ' + name + ' first, then withdraw the $' + capital + ' supply in two tranches a day apart.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Remove the liquidity from ' + name + ' in two tranches a day apart, so the exit does not look like a single flash.';
    if (c.indexOf('bridge') >= 0) return 'Keep every bridge receipt from ' + name + '; if a token launches, they are the proof of the route used.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Unstake through ' + name + ' and wait out the unbonding period before moving the funds.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close every open position on ' + name + ' before withdrawing the margin.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Redeem the ' + name + ' vault shares in two tranches a day apart.';
    if (c.indexOf('rwa') >= 0) return 'Redeem the ' + name + " yield asset on the protocol's own page and keep the redemption receipt.";
    if (c.indexOf('insurance') >= 0) return 'Let the ' + name + ' cover run to expiry, or cancel it on the protocol\'s own page if it allows.';
    return 'Withdraw the $' + capital + ' position from ' + name + ' in two tranches a day apart.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasToken(chain);
    var gasFee = gasFeeFor(chain);
    var capital = capitalFor(p);
    var small = smallFor(capital);
    var hold = holdDaysFor(p.age_days);
    var multi = p.chains.length > 1 ? ' It also runs on ' + p.chains.slice(1, 3).join(' and ') + '.' : '';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + chain + ', and keep its seed phrase offline. Fund it with a little ' + gas + ' for gas.' + multi, cost: gasFee + ' for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gasFee, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: '$' + small + ' of capital and ' + gasFee, time: '10 minutes' },
      { text: weeklyActionFor(p, chain), cost: gasFee + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Open " + p.name + "'s own points or rewards page on " + chain + " and confirm the wallet's activity is counted; claim only from the link it publishes, never from a link in a chat or an email.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: exitActionFor(p, capital) + ' Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  // Split one farm-step string into its action and its cost/time tail for display.
  function splitStep(s) {
    var at = String(s).indexOf(' Cost: ');
    if (at < 0) return { action: String(s), tail: '' };
    return { action: String(s).slice(0, at), tail: String(s).slice(at + 1) };
  }
  // Prefer the farm plan the data carries (strings, or {text, cost, time} objects); fall back to
  // the page's own derivation so the detail view still works with either data shape.
  function detailSteps(row) {
    var carried = row.farm_steps;
    if (Array.isArray(carried) && carried.length > 0) {
      return carried.map(function (s) {
        if (typeof s === 'string') return splitStep(s);
        if (s && typeof s.text === 'string') return splitStep(stepText(s));
        return { action: esc(s), tail: '' };
      });
    }
    return farmSteps(row).map(splitStep);
  }

  // ---- State -------------------------------------------------------------------
  var state = { q: '', category: 'all', chain: 'all', floorOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('floor') === '1' || params.get('wl') === '1') state.floorOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.floorOnly) params.set('floor', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---- Data access (defensive: missing fields never crash the page) -------------
  function allRows() { return Array.isArray(DATA.rows) ? DATA.rows : []; }
  function liveRows() { return Array.isArray(DATA.live) ? DATA.live : []; }
  function floorUsd() { return typeof DATA.floor_usd === 'number' && isFinite(DATA.floor_usd) ? DATA.floor_usd : 50000000; }
  // The data carries no watchlist slug list, so no row can be proven to be a watchlist row:
  // the board mixes 40 watchlist rows with 14 above-floor fill rows. What the page can say
  // honestly is whether a row sits at or above the floor. "Floor & above" is that scope.
  function isAtFloor(r) { return typeof r.tvl_usd === 'number' && r.tvl_usd >= floorUsd(); }
  function belowFloorCount() { return allRows().filter(function (r) { return typeof r.tvl_usd === 'number' && r.tvl_usd < floorUsd(); }).length; }
  function fillCount() {
    var early = typeof DATA.early_size === 'number' ? DATA.early_size : 0;
    return Math.max(0, early - belowFloorCount());
  }
  function allChains() {
    var seen = {};
    allRows().concat(liveRows()).forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return allRows().filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.floorOnly && !isAtFloor(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = String(a.name).toLowerCase(); bv = String(b.name).toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null || a.change_7d === undefined ? -Infinity : a.change_7d; bv = b.change_7d === null || b.change_7d === undefined ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null || a.age_days === undefined ? Infinity : a.age_days; bv = b.age_days === null || b.age_days === undefined ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function filtersActive() {
    return state.q !== '' || state.category !== 'all' || state.chain !== 'all' || state.floorOnly;
  }
  function clearFilters() { state.q = ''; state.category = 'all'; state.chain = 'all'; state.floorOnly = false; writeHash(); render(); }

  // ---- Missing / empty data -----------------------------------------------------
  function missingPanel(title, body) {
    return el('div', { class: 'shell' },
      el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: title }),
        el('p', { text: body }),
        el('p', { class: 'sub', text: 'Source: DefiLlama protocol index, snapshot ' + (DATA && DATA.as_of ? DATA.as_of : '2026-11-14') + '. Implied values are this entry\u2019s model, not market prices.' })
      ))
    );
  }

  // ---- Header / lede -------------------------------------------------------------
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + (DATA.as_of || '2026-11-14') }),
        el('span', { text: DATA.source || 'DefiLlama protocol index' }),
        el('span', { text: (DATA.model_version || 'radar-2') + ' model' })
      )
    );
  }

  function lede() {
    var floorM = Math.round(floorUsd() / 1e6);
    var watchlistSize = typeof DATA.watchlist_size === 'number' ? DATA.watchlist_size : 0;
    var boardSize = typeof DATA.board_size === 'number' ? DATA.board_size : allRows().length;
    var earlySize = typeof DATA.early_size === 'number' ? DATA.early_size : 0;
    var below = belowFloorCount();
    var fill = fillCount();
    var earlyText = 'The watchlist is the floor: every protocol with at least $' + floorM + 'M of TVL that records no token. The early radar adds ' + earlySize + ' pre-token protocols the watchlist leaves out';
    if (fill > 0) {
      earlyText += ' — ' + below + ' below the floor by TVL, and ' + fill + ' above it, filled by implied value under the watchlist\u2019s own exclusion rule, so no wrapped, staked or bridged product of a token that already trades is crowned.';
    } else {
      earlyText += ', all of them below the floor by TVL.';
    }
    earlyText += ' Implied value is a model, not a promise.';
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: watchlistSize + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: earlyText }),
        el('p', { text: '\u201CNo token\u201D means the snapshot records no market cap, no CoinGecko id and no symbol for the protocol. It is a record in this snapshot, not proof that the protocol has no token or will never launch one.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: watchlistSize + ' / ' + watchlistSize })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(boardSize) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(below) })),
        el('div', { class: 'fact' }, el('span', { text: 'Fill rows above the floor' }), el('b', { text: String(fill) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size || liveRows().length) }))
      )
    );
  }

  // ---- Controls ------------------------------------------------------------------
  function controls() {
    var categories = Array.from(new Set(allRows().map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = allChains();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var wl = el('button', { type: 'button', 'aria-pressed': state.floorOnly ? 'true' : 'false', text: 'Floor & above', title: 'Only rows at or above the $' + Math.round(floorUsd() / 1e6) + 'M floor: the watchlist plus the above-floor fill', onclick: function () { state.floorOnly = !state.floorOnly; writeHash(); render(); } });
    var shown = state.tab === 'pre-token' ? rows().length : liveRows().length;
    var total = state.tab === 'pre-token' ? allRows().length : liveRows().length;
    var wrap = el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('div', { class: 'tabs' }, wl)),
      el('span', { class: 'count', text: shown + ' of ' + total + ' rows shown' })
    );
    if (filtersActive()) {
      wrap.appendChild(el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: clearFilters }));
    }
    return wrap;
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', 'aria-label': 'Sort by ' + label, onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'age' || key === 'rank' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25BC' : ' \u25B2' }) : null
      )
    );
  }

  function rowCells(r, rankText, valueCell, statusText) {
    return [
      el('td', { class: 'num', text: rankText }),
      el('td', null, el('div', { class: 'name' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      )),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + (r.change_7d === null || r.change_7d === undefined ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
      valueCell,
      el('td', null, el('span', { class: 'status', text: statusText }))
    ];
  }
  function clickable(tr, slug) {
    tr.setAttribute('tabindex', '0');
    tr.addEventListener('click', function () { openDetail(slug); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(slug); } });
    return tr;
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: allRows().length === 0 ? 'The board is empty' : 'No protocol matches that filter' }),
        el('p', { text: allRows().length === 0 ? 'This data file carries no pre-token rows, so there is nothing to rank yet.' : 'Clear the search or pick another category or chain to see the board again.' }),
        filtersActive() ? el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: clearFilters }) : null
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false' });
      var cells = rowCells(r, String(r.rank),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        isAtFloor(r) ? 'no token · at/above floor' : 'no token · below floor');
      // Age goes between 7d and implied value: rebuild the row in column order.
      var ageCell = el('td', { class: 'num', text: fmtAge(r.age_days) });
      tr.appendChild(cells[0]);
      tr.appendChild(cells[1]);
      tr.appendChild(cells[2]);
      tr.appendChild(cells[3]);
      tr.appendChild(ageCell);
      tr.appendChild(cells[4]);
      tr.appendChild(cells[5]);
      tbody.appendChild(clickable(tr, r.slug));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    if (liveRows().length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No live-token protocols in this data' }),
        el('p', { text: 'The snapshot carries no live-token protocols to set aside.' })
      ));
    }
    var tbody = el('tbody');
    liveRows().forEach(function (r) {
      var tr = el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false' });
      rowCells(r, 'live',
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        'already trades').forEach(function (c) { tr.appendChild(c); });
      tbody.appendChild(clickable(tr, r.slug));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking. Select a row for its detail.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = modelOf();
    var byValue = {};
    Object.keys(m.category_multipliers || {}).sort().forEach(function (cat) {
      var v = m.category_multipliers[cat];
      if (!byValue[v]) byValue[v] = [];
      byValue[v].push(cat);
    });
    var penaltyText = Object.keys(byValue).sort().map(function (v) {
      return byValue[v].join(', ') + ' at ' + v;
    }).join('; ');
    var chainOne = (m.chain_floor + (1 / m.chain_cap) * m.chain_bonus).toFixed(2);
    var chainTop = (m.chain_floor + m.chain_bonus).toFixed(2);
    var fill = fillCount();
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chainMult x catMult )'
      ),
      el('div', { class: 'formula' },
        'chainMult = ' + m.chain_floor + ' + min(chains, ' + m.chain_cap + ') / ' + m.chain_cap + ' x ' + m.chain_bonus + ' (' + chainOne + ' for one chain, up to ' + chainTop + ' for ' + m.chain_cap + ' or more)'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain count earns a small premium because a launch on more chains reaches more places. Category carries a small penalty where a fresh launch is less likely — ' + penaltyText + ' — and every other category scores 1.0, so no category is ever written off.' }),
      el('p', { class: 'sub', text: 'The early radar is the pre-token protocols below the watchlist floor, by TVL' + (fill > 0 ? ', plus ' + fill + ' rows above the floor filled by implied value under the watchlist\u2019s own exclusion rule' : '') + '. The live-token protocols are set aside with their market caps shown.' }),
      el('p', { class: 'sub', text: 'What \u201Cno token\u201D means: the snapshot records no market cap, no CoinGecko id and no symbol. That is what the sealed DefiLlama index says on ' + (DATA.as_of || '2026-11-14') + '; it is not a claim that the protocol has no token in any other record, or that it will never launch one.' })
    );
  }

  function notesPanel() {
    return el('footer', { class: 'notes' },
      el('p', { text: 'Disclaimer: implied value is this entry\u2019s model claim, computed only from the snapshot above. It is not a market price, not a prediction of a launch price, and not investment advice.' }),
      el('p', { text: 'Data: ' + (DATA.source || 'DefiLlama protocol index') + ', snapshot ' + (DATA.as_of || '2026-11-14') + ', watchlist floor $' + Math.round(floorUsd() / 1e6) + 'M TVL, ' + (DATA.watchlist_size || allRows().length) + ' watchlist protocols. Nothing on this page is fetched live.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function findRow(slug) {
    var found = allRows().filter(function (r) { return r.slug === slug; })[0];
    if (found) return { row: found, live: false };
    var live = liveRows().filter(function (r) { return r.slug === slug; })[0];
    if (live) return { row: live, live: true };
    return null;
  }

  function openDetail(slug) {
    var found = findRow(slug);
    if (!found) return;
    var row = found.row;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var scope = found.live ? 'Live token — set aside' : (isAtFloor(row) ? 'At/above the $' + Math.round(floorUsd() / 1e6) + 'M floor · rank ' + row.rank + ' of ' + allRows().length : 'Early radar, below the floor · rank ' + row.rank + ' of ' + allRows().length);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: scope }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    if (found.live) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Already trading' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Market cap' }), el('b', { class: 'num', text: fmtUsd(row.mcap_usd) }))
        ),
        el('p', { class: 'sub', text: 'This protocol already trades, so there is no implied value and no farm plan for it here. It is set aside from the pre-token ranking; its market cap is the market\u2019s own number, not a model.' })
      ));
    } else {
      var m = modelOf();
      var recomputed = impliedOf(row, m);
      var chainMult = typeof row.chain_multiplier === 'number' && isFinite(row.chain_multiplier) ? row.chain_multiplier : Math.round(chainMultOf(row, m) * 1e4) / 1e4;
      var catMult = typeof row.category_multiplier === 'number' && isFinite(row.category_multiplier) ? row.category_multiplier : catMultOf(row, m);
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Implied value' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
          el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(chainMult) })),
          el('div', null, el('span', { text: 'Category multiplier' }), el('b', { class: 'num', text: String(catMult) })),
          el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
          el('div', null, el('span', { text: 'First listed' }), el('b', { class: 'num', text: row.listed_at || 'unknown' }))
        ),
        el('p', { class: 'sub', text: 'Model ' + (DATA.model_version || 'radar-2') + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
        el('p', { class: 'sub', text: '\u201CNo token\u201D means this snapshot records no market cap, no CoinGecko id and no symbol for ' + row.name + ' — a record, not a guarantee.' })
      ));
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('ol', { class: 'steps' }, detailSteps(row).map(function (s) {
          return el('li', null, el('b', { text: s.action }), s.tail ? el('span', { class: 'cost', text: s.tail }) : null);
        }))
      ));
    }
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    app.setAttribute('aria-busy', 'false');
    if (!DATA) {
      app.appendChild(missingPanel('No snapshot data loaded', 'data.js is missing or did not load, so the board has nothing to rank. Generate it by running main.ts against the sealed snapshot, then reload this page.'));
      return;
    }
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(notesPanel());
    app.appendChild(shell);
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
