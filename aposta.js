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
    button.innerHTML = '<svg class="clover-shape" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 2.5c4.5 0 7 3.3 6.7 7.1 4.1-3.1 9.7-1.1 10.2 3.7 4.6.4 7 5.8 3.4 9.5 4.1 3.6 2.4 9.7-2.4 10.7.8 5.3-4.8 8.9-9.3 6.2-2 5.3-8.2 7.1-11.6 2.6-4 3.9-10.1 1.7-10.1-3.6-5.4.5-9-5-5.5-9.3-4.3-3.6-2.6-10 2.7-11-1-5.4 3.7-9.9 8.7-7.8 1-5.5 5.3-8.1 7.2-8.1Z"/></svg><span class="clover-number"></span>';
    button.querySelector('.clover-number').textContent = value;
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
  clovers.add(1);
  cloverButtons[0].setAttribute('aria-pressed', 'true');
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
