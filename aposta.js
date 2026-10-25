(() => {
  const numberGrid = document.querySelector('#number-grid');
  const cloverGrid = document.querySelector('#clover-grid');
  const numbers = new Set();
  const clovers = new Set();

  function updateSummary(selection, output, noun) {
    output.value = selection.size ? [...selection].sort((a, b) => a - b).map(n => String(n).padStart(2, '0')).join(' ') : '';
  }

  for (let value = 1; value <= 50; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'number-button';
    button.textContent = String(value).padStart(2, '0');
    button.setAttribute('aria-label', `Número ${value}`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (numbers.has(value)) numbers.delete(value);
      else if (numbers.size < 6) numbers.add(value);
      button.setAttribute('aria-pressed', String(numbers.has(value)));
      updateSummary(numbers, document.querySelector('#number-summary'), 'números');
    });
    numberGrid.append(button);
  }

  for (let value = 1; value <= 6; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clover-button';
    button.setAttribute('aria-label', `Trevo ${value}`);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<svg class="clover-shape" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="12" r="9.5"/><circle cx="36" cy="24" r="9.5"/><circle cx="24" cy="36" r="9.5"/><circle cx="12" cy="24" r="9.5"/><circle cx="24" cy="24" r="9.5"/><path d="M25 25c-1 6-3 11-8 17" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>';
    button.addEventListener('click', () => {
      if (clovers.has(value)) clovers.delete(value);
      else if (clovers.size < 6) clovers.add(value);
      button.setAttribute('aria-pressed', String(clovers.has(value)));
      updateSummary(clovers, document.querySelector('#clover-summary'), 'trevos');
    });
    cloverGrid.append(button);
  }

  function fill(selection, buttons, targetCount) {
    while (selection.size < targetCount) {
      const remaining = Array.from({ length: buttons.length }, (_, i) => i + 1).filter(value => !selection.has(value));
      selection.add(remaining[Math.floor(Math.random() * remaining.length)]);
    }
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(selection.has(i + 1))));
  }

  const numberButtons = [...numberGrid.children];
  const cloverButtons = [...cloverGrid.children];
  clovers.add(2);
  clovers.add(5);
  cloverButtons[1].setAttribute('aria-pressed', 'true');
  cloverButtons[4].setAttribute('aria-pressed', 'true');
  updateSummary(clovers, document.querySelector('#clover-summary'), 'trevos');
  document.querySelector('#complete-game').addEventListener('click', () => {
    fill(numbers, numberButtons, 6);
    updateSummary(numbers, document.querySelector('#number-summary'), 'números');
  });
  document.querySelector('#clear-game').addEventListener('click', () => {
    numbers.clear();
    numberButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    updateSummary(numbers, document.querySelector('#number-summary'), 'números');
  });
  document.querySelector('#complete-clovers').addEventListener('click', () => {
    fill(clovers, cloverButtons, 2);
    updateSummary(clovers, document.querySelector('#clover-summary'), 'trevos');
  });
  document.querySelector('#clear-clovers').addEventListener('click', () => {
    clovers.clear();
    cloverButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    updateSummary(clovers, document.querySelector('#clover-summary'), 'trevos');
  });
})();
