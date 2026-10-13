import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlacement, TEXTURE_WIDTH, TEXTURE_HEIGHT, MUG_HEIGHT, MUG_RADIUS,
} from '../src/artwork.ts';

test('preserva a proporção física de artes quadradas, retratos e panorâmicas', () => {
  for (const [width, height] of [[1000, 1000], [800, 1200], [2400, 1000], [4000, 300]]) {
    for (const layout of ['wrap', 'repeat']) {
      for (const scale of [0.25, 1, 2]) {
        const print = calculatePlacement(width, height, { layout, scale, x: 0, y: 0 });
        const physicalWidth = print.width / TEXTURE_WIDTH * 2 * Math.PI * MUG_RADIUS;
        const physicalHeight = print.height / TEXTURE_HEIGHT * MUG_HEIGHT;
        assert.ok(Math.abs(physicalWidth / physicalHeight - width / height) < 1e-10,
          `${width} × ${height}, ${layout}, escala ${scale}: proporção alterada`);
      }
    }
  }
});

test('encaixa a arte sem cortar na escala inicial, com margens para borda e alça', () => {
  for (const [width, height] of [[1, 1], [300, 3000], [10000, 200], [2400, 1000]]) {
    for (const layout of ['wrap', 'repeat']) {
      const print = calculatePlacement(width, height, { layout, scale: 1, x: 0, y: 0 });
      assert.ok(print.height <= TEXTURE_HEIGHT * (layout === 'repeat' ? 0.87 : 0.89) + 1e-8);
      for (const center of print.centers) {
        assert.ok(center * TEXTURE_WIDTH - print.width / 2 >= TEXTURE_WIDTH * 0.035 - 1e-8);
        assert.ok(center * TEXTURE_WIDTH + print.width / 2 <= TEXTURE_WIDTH * 0.965 + 1e-8);
      }
    }
  }
});

test('deslocar a arte não altera seu tamanho ou sua proporção', () => {
  const original = calculatePlacement(2400, 1000, { layout: 'wrap', scale: 1, x: 0, y: 0 });
  const moved = calculatePlacement(2400, 1000, { layout: 'wrap', scale: 1, x: 75, y: 50 });
  assert.equal(moved.width, original.width);
  assert.equal(moved.height, original.height);
  assert.ok(moved.offsetX > original.offsetX);
  assert.ok(moved.offsetY < original.offsetY, 'posição vertical positiva deve mover a arte para cima');
});

test('a frente e o verso ficam em lados opostos da mesma superfície', () => {
  const repeated = calculatePlacement(1000, 1000, { layout: 'repeat', scale: 1, x: 0, y: 0 });
  assert.equal(repeated.centers.length, 2);
  assert.equal(Math.abs(repeated.centers[1] - repeated.centers[0]), 0.5);
});
