import random from 'lodash-es/random';

const btn = document.getElementById('gen');
const out = document.getElementById('out');

function show() {
  const n = random(1, 10);
  console.log('random', n);
  out.textContent = 'Random: ' + n;
}

btn?.addEventListener('click', show);
show();