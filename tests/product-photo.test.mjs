import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProductPhoto } from '../server/product-photo.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0OYAAAAASUVORK5CYII=','base64');
test('fotos validam formato e limite sem aceitar SVG ou conteúdo arbitrário',()=>{
  assert.equal(validateProductPhoto(png,'image/png'),png);
  assert.throws(()=>validateProductPhoto(png,'image/jpeg'));
  assert.throws(()=>validateProductPhoto(Buffer.from('<svg onload="alert(1)"/>'),'image/svg+xml'));
  assert.throws(()=>validateProductPhoto(Buffer.from('not a photo'),'image/png'));
  assert.throws(()=>validateProductPhoto(Buffer.alloc(0),'image/png'));
  assert.throws(()=>validateProductPhoto(Buffer.alloc(3*1024*1024+1),'image/png'),error=>error.status===413);
});
