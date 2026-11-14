import { ValidationError } from './finance.mjs';

export function validateProductPhoto(content, mime) {
  if (!Buffer.isBuffer(content) || !content.length) throw new ValidationError('Selecione uma foto JPG, PNG ou WebP.');
  if (content.length>3*1024*1024) throw new ValidationError('A foto deve ter até 3 MB.',413);
  const valid = mime==='image/jpeg' ? content.length>=3&&content[0]===255&&content[1]===216&&content[2]===255
    : mime==='image/png' ? content.length>=8&&content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime==='image/webp' ? content.length>=12&&content.toString('ascii',0,4)==='RIFF'&&content.toString('ascii',8,12)==='WEBP' : false;
  if (!valid) throw new ValidationError('Formato de foto inválido. Use JPG, PNG ou WebP.');
  return content;
}
