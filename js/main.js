/* Shared interactions for the Wealth Dashboard. No PDF passwords or raw PDFs are stored. */
(() => {
  'use strict';
  const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const money = value => rupees.format(Number(value) || 0);
  const compact = value => {
    const amount = Number(value) || 0;
    return amount >= 1e7 ? `₹${(amount / 1e7).toFixed(2)} Cr` : amount >= 1e5 ? `₹${(amount / 1e5).toFixed(2)} L` : money(amount);
  };
  const defaults = { currentAge: 33, retirementAge: 45, horizon: 80, monthlyExpense: 30000, inflation: 6, corpus: 30000000, expectedReturn: 10 };
  const assumptionsKey = 'wealth-retirement-assumptions-v1';

  function project(input) {
    const a = { ...defaults, ...input };
    const rate = a.expectedReturn / 100;
    const inflation = a.inflation / 100;
    let corpus = a.corpus;
    let depletionAge = null;
    const points = [{ age: a.currentAge, corpus }];
    for (let age = a.currentAge + 1; age <= a.horizon; age++) {
      const previousAge = age - 1;
      const withdrawal = previousAge >= a.retirementAge
        ? a.monthlyExpense * 12 * Math.pow(1 + inflation, previousAge - a.currentAge) : 0;
      if (withdrawal > corpus && depletionAge === null) depletionAge = previousAge;
      corpus = Math.max(0, corpus - withdrawal) * (1 + rate);
      points.push({ age, corpus });
    }
    return {
      points,
      retirementCorpus: a.corpus * Math.pow(1 + rate, a.retirementAge - a.currentAge),
      retirementExpense: a.monthlyExpense * Math.pow(1 + inflation, a.retirementAge - a.currentAge),
      finalCorpus: corpus,
      depletionAge
    };
  }
  window.WealthPlanner = { project };

  function showDataMode(dataset) {
    const main = document.querySelector('main .container');
    if (!main || document.querySelector('#uploadForm')) return;
    const banner = document.createElement('aside');
    banner.className = `data-mode notice ${dataset ? 'data-mode-live' : 'data-mode-demo'}`;
    banner.setAttribute('aria-label', 'Data source');
    const text = document.createElement('span');
    const isPlanner = Boolean(document.querySelector('#projectedCorpus'));
    text.textContent = isPlanner
      ? 'Planning assumptions · Edit these values for your situation. The corpus is entered manually and is independent of your CAS.'
      : dataset
        ? 'Your imported CAS · Available in this browser session only.'
        : 'Sample data · These figures show the design. Upload your CAS to see your investments.';
    const link = document.createElement('a');
    link.href = 'upload.html';
    link.className = 'mini-link';
    link.textContent = dataset ? 'Upload new CAS →' : 'Upload CAS →';
    banner.append(text, link);
    if (dataset) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'text-button';
      clear.textContent = 'Clear session';
      clear.addEventListener('click', () => {
        if (typeof window.WealthData?.clear === 'function') window.WealthData.clear();
        else sessionStorage.removeItem('wealth-cas-data-v1');
        window.location.reload();
      });
      banner.append(clear);
    }
    main.prepend(banner);
  }

  function setupUpload() {
    const form = document.querySelector('#uploadForm');
    if (!form) return;
    const files = document.querySelector('#casFiles');
    const password = document.querySelector('#pdfPassword');
    const toggle = document.querySelector('#togglePassword');
    const output = document.querySelector('#formResult');
    const submit = form.querySelector('[type="submit"]');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} PDF password`);
      toggle.setAttribute('aria-pressed', String(show));
    });
    files.addEventListener('change', () => {
      const names = Array.from(files.files, file => file.name);
      const filename = document.querySelector('#fileName');
      filename.textContent = names.length === 1 ? names[0] : names.length ? `${names.length} PDF files selected` : 'No file selected';
      filename.title = names.join(', ');
      output.textContent = '';
      files.removeAttribute('aria-invalid');
    });
    const privacy = form.querySelector('.privacy span:last-child');
    if (privacy) privacy.textContent = 'Your PDFs are read on your device. Only parsed holdings stay in this browser session; your password and PDF files are never saved or uploaded.';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      output.className = 'form-result';
      const selected = Array.from(files.files);
      if (!selected.length || selected.some(file => !/\.pdf$/i.test(file.name))) {
        output.textContent = selected.length ? 'Please choose PDF files only.' : 'Choose at least one CAS PDF to continue.';
        output.classList.add('negative');
        files.setAttribute('aria-invalid', 'true');
        files.focus();
        return;
      }
      if (typeof window.WealthData?.parseFiles !== 'function' || typeof window.WealthData?.save !== 'function') {
        output.textContent = 'The CAS reader could not load. Refresh the page and try again.';
        output.classList.add('negative');
        return;
      }
      const label = submit.textContent;
      const enteredPassword = password.value;
      submit.disabled = true;
      form.setAttribute('aria-busy', 'true');
      output.textContent = 'Reading your CAS on this device…';
      submit.textContent = 'Building dashboard…';
      try {
        const dataset = await window.WealthData.parseFiles(selected, enteredPassword);
        await window.WealthData.save(dataset);
        password.value = '';
        window.location.assign('total-assets.html');
      } catch (error) {
        let message = error?.message || 'The CAS could not be read. Check the PDF format and password, then try again.';
        if (enteredPassword) message = message.split(enteredPassword).join('[hidden]');
        output.textContent = message;
        output.classList.add('negative');
      } finally {
        password.value = '';
        password.type = 'password';
        toggle.textContent = 'Show';
        toggle.setAttribute('aria-label', 'Show PDF password');
        toggle.setAttribute('aria-pressed', 'false');
        submit.disabled = false;
        submit.textContent = label;
        form.removeAttribute('aria-busy');
      }
    });
  }

  function setupGoals() {
    const goals = Array.from(document.querySelectorAll('[data-goal]'));
    const detail = document.querySelector('#goalDetail');
    goals.forEach(button => button.addEventListener('click', () => {
      goals.forEach(goal => {
        const selected = goal === button;
        goal.classList.toggle('selected', selected);
        goal.setAttribute('aria-pressed', String(selected));
      });
      if (detail) {
        const value = button.querySelector('.metric-value')?.textContent || '';
        const progress = button.querySelector('.percent')?.textContent || '0%';
        detail.textContent = `${button.dataset.goal} goal selected · Target ${value} · ${progress} funded`;
      }
      if (typeof window.WealthData?.selectGoal === 'function') window.WealthData.selectGoal(button.dataset.goal);
    }));
  }

  function setupRetirement() {
    const projected = document.querySelector('#projectedCorpus');
    if (!projected) return;
    let assumptions = { ...defaults };
    try {
      const stored = JSON.parse(sessionStorage.getItem(assumptionsKey) || 'null');
      if (stored && validAssumptions({ ...assumptions, ...stored })) assumptions = { ...assumptions, ...stored };
    } catch { /* Storage is optional. */ }
    const chart = document.querySelector('.chart-svg');
    const panel = projected.closest('.card');
    const outcome = document.createElement('p');
    outcome.className = 'projection-status notice';
    outcome.setAttribute('role', 'status');
    panel.append(outcome);
    const summary = document.createElement('div');
    summary.className = 'projection-summary';
    panel.insertBefore(summary, chart);
    const assumptionsTitle = document.querySelector('.assumptions').previousElementSibling;
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'mini-link text-button';
    editButton.textContent = 'Edit assumptions';
    assumptionsTitle.append(editButton);
    const dialog = document.createElement('dialog');
    dialog.className = 'assumptions-dialog';
    dialog.setAttribute('aria-labelledby', 'assumptionsTitle');
    dialog.innerHTML = `<form id="assumptionsForm" class="assumptions-form" novalidate>
      <div class="card-title"><h2 id="assumptionsTitle">Edit your assumptions</h2><button type="button" class="text-button" data-close aria-label="Close assumptions">✕</button></div>
      <p class="subtitle">Try different ages, expenses and savings. Values stay in this browser session.</p>
      <div class="assumptions-fields">
        <label>Current age<input name="currentAge" type="number" min="18" max="109" step="1" required></label>
        <label>Retirement age<input name="retirementAge" type="number" min="19" max="110" step="1" required></label>
        <label>Plan until age<input name="horizon" type="number" min="20" max="110" step="1" required></label>
        <label>Monthly expenses today (₹)<input name="monthlyExpense" type="number" min="0" max="1000000000" step="100" required></label>
        <label>Annual inflation (%)<input name="inflation" type="number" min="0" max="20" step="0.1" required></label>
        <label>Current corpus (₹)<input name="corpus" type="number" min="0" max="1000000000000" step="100" required></label>
      </div>
      <p class="form-result negative" id="assumptionsError" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="chip" data-close>Cancel</button><button type="submit" class="primary-button">Update projection</button></div>
    </form>`;
    document.body.append(dialog);
    dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    editButton.addEventListener('click', () => {
      for (const [name, value] of Object.entries(assumptions)) {
        const field = dialog.querySelector(`[name="${name}"]`);
        if (field) field.value = value;
      }
      document.querySelector('#assumptionsError').textContent = '';
      dialog.showModal();
    });
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const candidate = { ...assumptions };
      for (const [name, value] of new FormData(event.currentTarget)) candidate[name] = value.trim() === '' ? NaN : Number(value);
      if (!validAssumptions(candidate)) {
        document.querySelector('#assumptionsError').textContent = 'Use whole-number ages from 18–110, with retirement after your current age and the planning age after retirement. Amounts must be zero or greater and inflation 0–20%.';
        return;
      }
      assumptions = candidate;
      draw();
      dialog.close();
    });
    document.querySelectorAll('[data-return]').forEach(button => button.addEventListener('click', () => {
      assumptions.expectedReturn = Number(button.dataset.return);
      draw();
    }));

    function draw() {
      const result = project(assumptions);
      projected.textContent = compact(result.retirementCorpus);
      projected.previousElementSibling.textContent = `Projected at age ${assumptions.retirementAge} (${assumptions.retirementAge - assumptions.currentAge} years)`;
      panel.querySelector('.form-hint').textContent = 'Growth before retirement; inflation-adjusted annual withdrawals afterward.';
      summary.textContent = `Expenses at retirement: ${money(result.retirementExpense)}/month · Corpus at age ${assumptions.horizon}: ${compact(result.finalCorpus)}`;
      outcome.textContent = result.depletionAge === null
        ? `This scenario covers the modeled expenses through age ${assumptions.horizon}.`
        : `Savings run short during age ${result.depletionAge} in this scenario. Try a later retirement, lower expenses or a larger corpus.`;
      outcome.classList.toggle('negative', result.depletionAge !== null);
      const labels = { currentAge: `${assumptions.currentAge} years`, retirementAge: `${assumptions.retirementAge} years`, horizon: `${assumptions.horizon} years`, monthlyExpense: money(assumptions.monthlyExpense), inflation: `${assumptions.inflation}% p.a.`, corpus: money(assumptions.corpus) };
      const kpis = document.querySelectorAll('.retire-kpis .metric-value');
      Object.values(labels).forEach((text, i) => { if (kpis[i]) kpis[i].textContent = text; });
      const assumptionValues = [labels.currentAge, labels.retirementAge, labels.horizon, labels.inflation, `${assumptions.expectedReturn}% p.a.`, labels.corpus, labels.monthlyExpense];
      document.querySelectorAll('.assumptions dd').forEach((dd, i) => { dd.textContent = assumptionValues[i]; });
      document.querySelectorAll('[data-selected-return]').forEach(el => { el.textContent = `${assumptions.expectedReturn}% p.a.`; });
      document.querySelectorAll('[data-return]').forEach(button => {
        const selected = Number(button.dataset.return) === assumptions.expectedReturn;
        button.setAttribute('aria-pressed', String(selected));
        const name = ({ 8: 'Conservative', 10: 'Balanced', 12: 'Optimistic' })[button.dataset.return];
        button.querySelector('strong').textContent = `${selected ? '●' : '○'} ${name}${selected ? ' (selected)' : ''}`;
      });
      drawChart(result.points);
      panel.querySelector('.chart-foot').textContent = `Hypothetical annual model: ${assumptions.expectedReturn}% growth, ${assumptions.inflation}% expense inflation. No contributions before retirement. Annual expenses are withdrawn at the start of each year from age ${assumptions.retirementAge}. Taxes, fees and changing market returns are excluded.`;
      try { sessionStorage.setItem(assumptionsKey, JSON.stringify(assumptions)); } catch { /* The calculator works without storage. */ }
    }
    function drawChart(points) {
      const NS = 'http://www.w3.org/2000/svg';
      const defs = chart.querySelector('defs').cloneNode(true);
      chart.replaceChildren(defs);
      chart.setAttribute('aria-label', `Corpus projection from age ${assumptions.currentAge} to ${assumptions.horizon}, retirement at ${assumptions.retirementAge}`);
      const top = 25, bottom = 230, left = 72, right = 630;
      const max = Math.max(...points.map(p => p.corpus), 1) * 1.12;
      const x = age => left + (age - assumptions.currentAge) / (assumptions.horizon - assumptions.currentAge) * (right - left);
      const y = value => bottom - value / max * (bottom - top);
      function svg(tag, attributes, text) {
        const node = document.createElementNS(NS, tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        if (text !== undefined) node.textContent = text;
        chart.append(node);
        return node;
      }
      for (let i = 0; i <= 4; i++) {
        const value = max * i / 4;
        svg('line', { x1: left, y1: y(value), x2: right, y2: y(value), stroke: '#e2eafb' });
        svg('text', { x: left - 9, y: y(value) + 4, fill: '#607292', 'font-size': 11, 'text-anchor': 'end' }, compact(value));
        const age = Math.round(assumptions.currentAge + (assumptions.horizon - assumptions.currentAge) * i / 4);
        svg('text', { x: x(age), y: 254, fill: '#607292', 'font-size': 12, 'text-anchor': 'middle' }, `Age ${age}`);
      }
      const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(p.age).toFixed(2)} ${y(p.corpus).toFixed(2)}`).join(' ');
      svg('path', { id: 'projectionArea', d: `${path} L ${right} ${bottom} L ${left} ${bottom} Z`, fill: 'url(#chartFill)' });
      svg('path', { id: 'projectionLine', d: path, stroke: '#1668ef', 'stroke-width': 3, fill: 'none', 'stroke-linejoin': 'round' });
      svg('line', { x1: x(assumptions.retirementAge), y1: top, x2: x(assumptions.retirementAge), y2: bottom, stroke: '#8aa8de', 'stroke-dasharray': '5 4' });
      svg('text', { x: x(assumptions.retirementAge) + 6, y: top + 8, fill: '#375684', 'font-size': 11 }, `Retire ${assumptions.retirementAge}`);
      const retirement = points.find(point => point.age === assumptions.retirementAge);
      svg('circle', { cx: x(retirement.age), cy: y(retirement.corpus), r: 5, fill: '#1668ef' });
    }
    draw();
  }

  function validAssumptions(a) {
    return Object.values(a).every(Number.isFinite)
      && [a.currentAge, a.retirementAge, a.horizon].every(Number.isInteger)
      && a.currentAge >= 18 && a.currentAge < a.retirementAge && a.retirementAge < a.horizon && a.horizon <= 110
      && a.corpus >= 0 && a.corpus <= 1e12 && a.monthlyExpense >= 0 && a.monthlyExpense <= 1e9
      && a.inflation >= 0 && a.inflation <= 20 && a.expectedReturn >= 0 && a.expectedReturn <= 30;
  }

  async function ready() {
    let dataset = null;
    try {
      dataset = window.WealthData?.load?.() || null;
      if (dataset && typeof window.WealthData?.renderPage === 'function') await window.WealthData.renderPage(dataset);
    } catch {
      dataset = null;
    }
    showDataMode(dataset);
    setupUpload();
    setupGoals();
    setupRetirement();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
