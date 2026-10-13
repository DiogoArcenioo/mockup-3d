import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlacement, fillArtworkHeight, TEXTURE_WIDTH, TEXTURE_HEIGHT, MUG_HEIGHT, MUG_RADIUS,
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

test('ajustar a altura conserva a largura, a posição horizontal e a distância da alça', () => {
  for (const layout of ['wrap', 'repeat']) {
    const original = calculatePlacement(2400, 1000, { layout, scale: 1.3, x: 28, y: 15 });
    for (const heightScale of [0.5, 1.125, 2]) {
      const adjusted = calculatePlacement(2400, 1000, { layout, scale: 1.3, x: 28, y: 15, heightScale });
      assert.equal(adjusted.width, original.width);
      assert.equal(adjusted.offsetX, original.offsetX);
      assert.equal(adjusted.offsetY, original.offsetY);
      assert.deepEqual(adjusted.centers, original.centers);
      assert.ok(Math.abs(adjusted.height - original.height * heightScale) < 1e-8);
    }
  }
});

test('preencher a altura cobre topo e base sem ampliar a estampa na direção da alça', () => {
  for (const [width, height] of [[1000, 1000], [800, 1200], [2400, 1000], [10000, 200]]) {
    for (const layout of ['wrap', 'repeat']) {
      for (const scale of [0.25, 1, 2]) {
        const settings = { layout, scale, x: 24, y: 65, heightScale: 1.7 };
        const original = calculatePlacement(width, height, settings);
        const filledSettings = fillArtworkHeight(width, height, settings);
        const filled = calculatePlacement(width, height, filledSettings);
        assert.ok(Math.abs(filled.height - TEXTURE_HEIGHT) < 1e-8);
        assert.equal(Math.abs(filled.offsetY), 0);
        assert.equal(filled.width, original.width);
        assert.equal(filled.offsetX, original.offsetX);
        assert.deepEqual(filled.centers, original.centers);
        assert.equal(settings.y, 65, 'o ajuste original não deve ser modificado');
      }
    }
  }
});
