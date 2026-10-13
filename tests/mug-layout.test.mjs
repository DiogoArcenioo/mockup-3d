import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMugPoses } from '../src/mug-layout.ts';

test('frente e verso usam o mesmo tamanho, a mesma altura e a mesma profundidade', () => {
  const [front, back] = getMugPoses('duo');
  assert.equal(front.scale, 1);
  assert.equal(back.scale, front.scale);
  assert.equal(front.position[1], back.position[1]);
  assert.equal(front.position[2], back.position[2]);
  assert.equal(front.position[0], -back.position[0]);
});

test('as duas vistas continuam separadas por 180° durante todo o giro', () => {
  for (const degrees of [-180, -90, -1, 0, 1, 90, 180]) {
    const [front, back] = getMugPoses('duo', degrees);
    assert.ok(Math.abs(front.rotationY - back.rotationY - Math.PI) < 1e-10);
  }
});

test('girar 180° troca exatamente os lados visíveis da mesma textura', () => {
  const initial = getMugPoses('duo');
  const rotated = getMugPoses('duo', 180);
  const frontU = angle => ((-angle - Math.PI / 2) / (2 * Math.PI) % 1 + 1) % 1;
  assert.equal(frontU(initial[0].rotationY), 0.25);
  assert.equal(frontU(initial[1].rotationY), 0.75);
  assert.equal(frontU(rotated[0].rotationY), frontU(initial[1].rotationY));
  assert.equal(frontU(rotated[1].rotationY), frontU(initial[0].rotationY));
});

test('trocar o enquadramento conserva a escala real do modelo', () => {
  for (const view of ['duo', 'single', 'detail']) {
    const poses = getMugPoses(view);
    assert.ok(poses.every(pose => pose.scale === 1));
    assert.equal(poses[1].visible, view === 'duo');
  }
});

test('as alças voltadas para o centro têm espaço para girar sem se atravessar', () => {
  for (const degrees of [-180, -150, -120, 120, 150, 180]) {
    const [front, back] = getMugPoses('duo', degrees);
    const extent = Math.max(1, 1.63 * Math.max(0, -Math.cos(degrees * Math.PI / 180)) + 0.135);
    assert.ok(back.position[0] - front.position[0] >= 2 * extent + 0.119999999);
    assert.equal(front.scale, back.scale);
    assert.equal(front.position[2], back.position[2]);
  }
});
