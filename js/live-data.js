/* Render processed CAS holdings in the shared card layouts. */
(() => {
  'use strict';
  const api = window.WealthData;
  if (!api) return;
  const palette = ['#3076ff', '#20b976', '#ffae2b', '#2ec0df', '#a777eb', '#ee65a2', '#7b94bb'];
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR', maximumFractionDigits: 0}).format(number(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const percent = (value, target) => number(target) > 0 ? number(value) / number(target) * 100 : 0;
  const bounded = value => Math.min(100, Math.max(0, number(value)));
  const positive = value => number(value) >= 0 ? 'positive' : 'negative';
  const goals = () => api.config?.education?.goals || [];
  const mainTarget = () => number(api.config?.family?.portfolioTarget);
  function stats(schemes) {
    const invested = schemes.reduce((sum, item) => sum + number(item.invested), 0);
    const current = schemes.reduce((sum, item) => sum + number(item.current), 0);
    return {invested, current, gain: current - invested, return: percent(current - invested, invested)};
  }
  function delta(value) {
    return `<div class="delta ${positive(value.gain)}">${value.gain >= 0 ? '▲' : '▼'} ${money(Math.abs(value.gain))} (${value.return >= 0 ? '+' : '−'}${Math.abs(value.return).toFixed(2)}%)</div>`;
  }
  function metric(label, value, icon = '▤', extraClass = '') {
    return `<div class="card kpi-card"><span class="icon-tile" aria-hidden="true">${icon}</span><div><div class="metric-label">${escape(label)}</div><div class="metric-value ${extraClass}">${escape(value)}</div></div></div>`;
  }
  function dateLabel(dataset) {
    const date = new Date(dataset.valuation_date || dataset.period?.to || '');
    return Number.isNaN(date.getTime()) ? 'Statement date unavailable' : `As of ${new Intl.DateTimeFormat('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}).format(date)}`;
  }
  function heading(title, subtitle, dataset) {
    return `<div class="page-heading"><div><h1>${escape(title)}</h1><p class="subtitle">${escape(subtitle)}</p></div><span class="date-pill">◷ ${escape(dateLabel(dataset))}</span></div>`;
  }
  function progress(current, target) {
    const progress = percent(current, target);
    return `<div class="progress-wrap"><span class="chip">${target > 0 ? `Target ${money(target)} · ${progress.toFixed(0)}%` : 'No target set'}</span><div class="progress"><span style="width:${bounded(progress)}%"></span></div></div>`;
  }
  function table(schemes, category = false) {
    if (!schemes.length) return '<div class="empty-state"><p>No holdings found in this view.</p><a class="mini-link" href="upload.html">Upload another statement →</a></div>';
    const rows = [...schemes].sort((a, b) => number(b.current) - number(a.current)).map((item, index) => {
      const gain = number(item.current) - number(item.invested);
      return `<tr><td><div class="fund-cell"><i class="swatch" style="background:${palette[index % palette.length]}"></i><strong>${escape(item.name || 'Unnamed fund')}</strong></div></td>${category ? `<td><span class="category-tag">${escape(item.category || 'Other')}</span></td>` : ''}<td class="number">${money(item.invested)}</td><td class="number">${money(item.current)}</td><td class="number ${positive(gain)}"><strong>${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))}</strong></td></tr>`;
    }).join('');
    return `<div class="table-responsive" tabindex="0" role="region" aria-label="Holdings table"><table><thead><tr><th scope="col">Fund</th>${category ? '<th scope="col">Category</th>' : ''}<th class="number" scope="col">Invested</th><th class="number" scope="col">Current</th><th class="number" scope="col">Gain</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function people(schemes) {
    const grouped = new Map();
    for (const item of schemes) {
      const owner = item.person?.label || item.owner || 'Unassigned investor';
      if (!grouped.has(owner)) grouped.set(owner, []);
      grouped.get(owner).push(item);
    }
    if (!grouped.size) return '<div class="card card-pad empty-state"><h3>No matching investments</h3><p>Your statement has no holdings assigned to this view.</p></div>';
    return [...grouped].map(([owner, rows]) => {
      const summary = stats(rows);
      return `<article class="card card-pad person-card"><div class="person-header"><div style="display:flex;align-items:center;gap:10px"><span class="icon-tile" aria-hidden="true">👤</span><h3>${escape(owner)}</h3></div><div style="text-align:right"><div class="person-total">${money(summary.current)}</div>${delta(summary)}</div></div><div class="person-meta"><span>Invested <strong>${money(summary.invested)}</strong></span><span>Current <strong>${money(summary.current)}</strong></span></div>${table(rows)}<p class="subtitle" style="margin-top:14px">${rows.length} statement holding${rows.length === 1 ? '' : 's'}</p></article>`;
    }).join('');
  }
  function row(title, icon, schemes, target, url, extra = '') {
    const value = stats(schemes);
    return `<section class="card asset-row"><div class="asset-row-heading"><span class="icon-tile" aria-hidden="true">${icon}</span><span>${escape(title)}</span></div><div><div class="metric-label">Invested</div><div class="metric-value">${money(value.invested)}</div></div><div><div class="metric-label">Current</div><div class="metric-value ${positive(value.gain)}">${money(value.current)}</div>${delta(value)}</div>${progress(value.current, target)}<a href="${url}" class="mini-link arrow" aria-label="Open ${escape(title)}">→</a>${extra}</section>`;
  }
  function renderOverview(dataset, root) {
    const nonLiquid = dataset.schemes.filter(item => !item.liquid);
    const education = nonLiquid.filter(item => item.education);
    const portfolio = nonLiquid.filter(item => !item.education);
    const total = stats(nonLiquid);
    const target = mainTarget() + goals().reduce((sum, goal) => sum + number(goal.target), 0);
    const goalStrip = `<div class="goal-strip" style="grid-column:1/-1">${goals().map(goal => `<a class="chip" href="aditya.html">${escape(goal.icon || '◎')} ${escape(goal.label)} · ${money(goal.target)}</a>`).join('')}</div>`;
    const liquid = stats(dataset.schemes.filter(item => item.liquid));
    root.innerHTML = heading('Total Assets Overview', 'Your statement holdings, grouped by investment purpose', dataset) +
      `<section class="card blue-wash asset-summary" aria-label="Total assets summary"><div class="hero-dark"><span class="icon-tile" style="background:#ffffff2e;color:white" aria-hidden="true">▥</span><div><div class="metric-label">Total assets</div><div class="metric-value">${money(total.current)}</div></div></div><div class="summary-cell"><div class="metric-label">Invested</div><div class="metric-value">${money(total.invested)}</div></div><div class="summary-cell"><div class="metric-label">Current value</div><div class="metric-value">${money(total.current)}</div>${delta(total)}</div><div class="summary-cell"><div class="metric-label">Total gain</div><div class="metric-value ${positive(total.gain)}">${money(total.gain)}</div></div><div class="summary-cell" style="text-align:center"><div class="round-progress" style="--progress:${bounded(percent(total.current, target))}%"><strong>${percent(total.current, target).toFixed(0)}%</strong></div><div class="metric-label">Combined target ${money(target)}</div></div></section><h2 class="section-label">Your wealth at a glance</h2>` +
      row(api.config?.education?.child || 'Aditya', '◎', education, goals().reduce((sum, goal) => sum + number(goal.target), 0), 'aditya.html', goalStrip) +
      row('Portfolio', '▤', portfolio, mainTarget(), 'portfolio.html') +
      `<p class="subtitle" style="margin-top:18px">Total assets combines Portfolio and education holdings. ${liquid.current ? `Liquid reserves of ${money(liquid.current)} are excluded, following your folio configuration.` : 'Liquid reserve folios are excluded.'} Gains are current value minus invested cost.</p>`;
  }
  function renderPortfolio(dataset, root) {
    const rows = dataset.schemes.filter(item => !item.liquid && !item.education);
    const value = stats(rows);
    const names = [...new Set(rows.map(item => item.person?.label || item.owner).filter(Boolean))];
    const allocation = new Map();
    for (const item of rows) {
      const name = item.category || 'Other';
      allocation.set(name, (allocation.get(name) || 0) + Math.max(0, number(item.current)));
    }
    let end = 0;
    const segments = [...allocation].map(([name, current], index) => {
      const start = end;
      end += percent(current, value.current);
      return {name, share: percent(current, value.current), color: palette[index % palette.length], segment: `${palette[index % palette.length]} ${start}% ${end}%`};
    });
    root.innerHTML = heading(names.length ? names.join(' + ') : 'Your Portfolio', `Mutual fund portfolio · ${rows.length} holdings · ${names.length} profiles`, dataset) +
      `<section class="card blue-wash portfolio-top"><div><div class="metric-label">CURRENT PORTFOLIO VALUE</div><div class="metric-value large">${money(value.current)}</div>${delta(value)}</div><span class="chip">Statement portfolio</span></section><section class="kpi-grid portfolio-kpi-grid">${metric('Invested', money(value.invested))}${metric('Current value', money(value.current), '◈')}${metric('Total gain', money(value.gain), '↗', positive(value.gain))}${metric('Overall return', `${value.return >= 0 ? '+' : ''}${value.return.toFixed(2)}%`, '%', positive(value.gain))}</section><section class="portfolio-panel"><div class="card card-pad"><h2 class="card-title">Allocation by category</h2><div class="donut-block"><div class="donut" role="img" aria-label="${escape(segments.map(item => `${item.name} ${item.share.toFixed(1)}%`).join(', ') || 'No allocation data')}" style="background:conic-gradient(${segments.length ? segments.map(item => item.segment).join(',') : '#e6edfa 0% 100%'})"><span class="donut-center">${money(value.current)}<small>Current value</small></span></div><div class="legend">${segments.map(item => `<div class="legend-item"><span><i class="swatch" style="background:${item.color}"></i>${escape(item.name)}</span><strong>${item.share.toFixed(1)}%</strong></div>`).join('') || '<p class="subtitle">No holdings</p>'}</div></div><p class="subtitle" style="margin-top:20px">Allocation uses current values in your CAS statement.</p></div><div class="card card-pad"><h2 class="card-title">All holdings <a class="mini-link" href="#profiles">See profiles →</a></h2>${table(rows, true)}</div></section><h2 id="profiles" class="section-label">Portfolio by profile</h2><section class="people-grid">${people(rows)}</section>`;
  }
  function renderAditya(dataset, root) {
    const education = dataset.schemes.filter(item => !item.liquid && item.education);
    const value = stats(education);
    const target = goals().reduce((sum, goal) => sum + number(goal.target), 0);
    const selected = goals().find(goal => goal.label?.toLowerCase().includes('engineering')) || goals()[0];
    const child = api.config?.education?.child || 'Aditya';
    root.innerHTML = heading(`${child} · Investments & Goals`, 'Track savings, goal allocation and family contributions', dataset) +
      `<section class="aditya-kpis"><div class="card hero-dark"><span class="icon-tile" style="background:#ffffff24;color:#fff" aria-hidden="true">↗</span><div><div class="metric-label">Current value</div><div class="metric-value">${money(value.current)}</div>${delta(value)}</div></div>${metric('Invested', money(value.invested))}${metric('Goal target', money(target), '◎')}<div class="card kpi-card"><div style="width:100%"><div class="metric-label">Overall progress</div><div class="metric-value">${percent(value.current, target).toFixed(0)}%</div><div class="progress"><span style="width:${bounded(percent(value.current, target))}%"></span></div><div class="form-hint">Toward ${money(target)}</div></div></div></section><section class="card card-pad" style="margin-top:19px"><h2 class="card-title">Goal allocation <button type="button" class="mini-link" id="allGoals">View all investments →</button></h2><div class="goal-grid">${goals().map(goal => {
        const summary = stats(education.filter(item => item.goalId === goal.id));
        const active = goal.id === selected?.id;
        return `<button type="button" class="goal-card${active ? ' selected' : ''}" data-goal="${escape(goal.label)}" data-target="${number(goal.target)}" aria-pressed="${active}"><span><span class="metric-label">${escape(goal.icon || '◎')} ${escape(goal.label)}</span><span class="metric-value">${money(goal.target)}</span></span><span class="percent">${percent(summary.current, goal.target).toFixed(0)}%</span></button>`;
      }).join('')}</div><p class="goal-detail" id="goalDetail" role="status"></p></section><h2 id="holdings" class="section-label">Investments by parent</h2><section class="people-grid"></section>`;
    api.selectGoal = name => {
      const goal = goals().find(item => item.label === name);
      const rows = goal ? education.filter(item => item.goalId === goal.id) : education;
      root.querySelector('.people-grid').innerHTML = people(rows);
      const summary = stats(rows);
      root.querySelector('#goalDetail').textContent = goal ? `${goal.label} · ${money(summary.current)} of ${money(goal.target)} · ${rows.length} holdings` : `All education investments · ${money(summary.current)} · ${rows.length} holdings`;
      root.querySelector('#holdings').textContent = goal ? `${goal.label} investments by parent` : 'All education investments by parent';
    };
    root.querySelector('#allGoals').addEventListener('click', () => {
      root.querySelectorAll('.goal-card').forEach(button => {
        button.classList.remove('selected');
        button.setAttribute('aria-pressed', 'false');
      });
      api.selectGoal(null);
    });
    api.selectGoal(selected?.label);
  }
  api.renderPage = dataset => {
    if (!Array.isArray(dataset?.schemes)) return;
    const root = document.querySelector('main.page > .container');
    if (!root) return;
    const path = location.pathname.split('/').pop();
    if (path === 'total-assets.html') renderOverview(dataset, root);
    if (path === 'portfolio.html') renderPortfolio(dataset, root);
    if (path === 'aditya.html') renderAditya(dataset, root);
  };
})();
