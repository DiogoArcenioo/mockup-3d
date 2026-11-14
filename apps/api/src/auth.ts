import { Injectable, UnauthorizedException, ForbiddenException, HttpException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { pool } from './database.js';
import { hashPassword, verifyPassword } from './password.js';
// @ts-expect-error Shared transaction-local audit context.
import { setActor } from '../../../server/actor-pool.mjs';

export type User = { id: string; name: string; login: string; role: 'admin' | 'user' };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = 'forma_auth';
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true', path: '/' };
const tokenFrom = (req: Request) => (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';

@Injectable()
export class AuthService {
  private dummyHash = hashPassword(randomBytes(32).toString('hex'));

  async current(req: Request): Promise<User> {
    const token = tokenFrom(req);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('Entre para continuar.');
    const { rows } = await pool.query(`SELECT u.id,u.name,u.login,u.role FROM forma_auth.sessions s
      JOIN forma_auth.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`, [digest(token)]);
    if (!rows[0]) throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    return rows[0];
  }

  async admin(req: Request) {
    const user = await this.current(req);
    if (user.role !== 'admin') throw new ForbiddenException('Apenas administradores podem gerenciar usuários.');
    return user;
  }

  async login(req: Request, res: Response, body: unknown) {
    const input = body as Record<string, unknown> | undefined;
    if (!input || typeof input.login !== 'string' || typeof input.password !== 'string' || input.login.length > 40 || input.password.length > 256 || typeof input.remember !== 'undefined' && typeof input.remember !== 'boolean') throw new BadRequestException('Informe seu usuário e senha.');
    const login = input.login.trim().toLowerCase();
    // Database-backed counters survive restarts and work across API instances.
    for (const key of ['ip:' + req.ip, 'login:' + login]) {
      const { rows: [attempt] } = await pool.query(`INSERT INTO forma_auth.login_attempts(key_hash) VALUES($1)
        ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN forma_auth.login_attempts.window_start < now()-interval '15 minutes' THEN 1 ELSE forma_auth.login_attempts.count+1 END,
        window_start=CASE WHEN forma_auth.login_attempts.window_start < now()-interval '15 minutes' THEN now() ELSE forma_auth.login_attempts.window_start END RETURNING count`, [digest(key)]);
      if (attempt.count > 15) throw new HttpException('Muitas tentativas. Tente novamente em 15 minutos.', 429);
    }
    const { rows: [user] } = await pool.query('SELECT * FROM forma_auth.users WHERE login=$1 AND active=true', [login]);
    const correct = await verifyPassword(input.password, user?.password_hash || await this.dummyHash);
    if (!user || !correct) throw new UnauthorizedException('Usuário ou senha incorretos.');
    const token = randomBytes(32).toString('hex');
    const duration = input.remember ? 30 * 86400000 : 12 * 3600000;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize sign-in with password changes: an old password cannot create a
      // fresh session after another transaction has already changed that password.
      const locked=(await client.query('SELECT password_hash FROM forma_auth.users WHERE id=$1 AND active=true FOR UPDATE',[user.id])).rows[0];
      if(!locked||locked.password_hash!==user.password_hash)throw new UnauthorizedException('Usuário ou senha incorretos.');
      await client.query('DELETE FROM forma_auth.sessions WHERE token_hash=$1 OR expires_at<=now()', [digest(tokenFrom(req))]);
      await client.query('INSERT INTO forma_auth.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [digest(token), user.id, new Date(Date.now() + duration)]);
      await client.query('DELETE FROM forma_auth.login_attempts WHERE key_hash=$1 OR window_start < now()-interval \'1 day\'', [digest('login:' + login)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    res.cookie(cookieName, token, { ...cookieOptions, ...(input.remember ? { maxAge: duration } : {}) });
    return { user: { id: user.id, name: user.name, login: user.login, role: user.role } };
  }

  async logout(req: Request, res: Response) {
    await pool.query('DELETE FROM forma_auth.sessions WHERE token_hash=$1', [digest(tokenFrom(req))]);
    res.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  }

  async changePassword(req: Request, res: Response, body: unknown) {
    const actor=await this.current(req);
    const input=body as Record<string,unknown>|undefined;
    if(!input||typeof input.currentPassword!=='string'||!input.currentPassword||input.currentPassword.length>256||typeof input.newPassword!=='string'||input.newPassword.length<8||input.newPassword.length>256||!input.newPassword.trim())throw new BadRequestException('Informe sua senha atual e uma nova senha de 8 a 256 caracteres.');
    if(typeof input.confirmPassword!=='string'||input.confirmPassword!==input.newPassword)throw new BadRequestException('A confirmação deve ser igual à nova senha.');
    const rawTargetId=input.userId===undefined?actor.id:input.userId;
    if(typeof rawTargetId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTargetId))throw new BadRequestException('Selecione um usuário válido.');
    const targetId=rawTargetId.toLowerCase();
    if(targetId!==actor.id&&actor.role!=='admin')throw new ForbiddenException('Você pode alterar apenas a própria senha.');
    const attemptKey=digest('password:'+actor.id);
    const {rows:[attempt]}=await pool.query(`INSERT INTO forma_auth.login_attempts(key_hash) VALUES($1)
      ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN forma_auth.login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE forma_auth.login_attempts.count+1 END,
      window_start=CASE WHEN forma_auth.login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE forma_auth.login_attempts.window_start END RETURNING count`,[attemptKey]);
    if(attempt.count>10)throw new HttpException('Muitas tentativas. Tente novamente em 15 minutos.',429);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      // Stable ordering also prevents two administrators from deadlocking when
      // they change each other's passwords at the same time.
      const {rows}=await client.query('SELECT id,name,login,role,active,password_hash FROM forma_auth.users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[actor.id,targetId]]);
      const currentActor=rows.find(user=>user.id===actor.id),target=rows.find(user=>user.id===targetId);
      const validSession=await client.query('SELECT 1 FROM forma_auth.sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()',[digest(tokenFrom(req)),actor.id]);
      if(!currentActor?.active||!validSession.rowCount)throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
      if(targetId!==actor.id&&currentActor.role!=='admin')throw new ForbiddenException('Você pode alterar apenas a própria senha.');
      if(!target?.active)throw new NotFoundException('Usuário não encontrado ou inativo.');
      if(!await verifyPassword(input.currentPassword,currentActor.password_hash))throw new BadRequestException('Sua senha atual está incorreta.');
      if(await verifyPassword(input.newPassword,target.password_hash))throw new BadRequestException('Escolha uma senha diferente da senha atual dessa conta.');
      await setActor(client,actor);
      await client.query('UPDATE forma_auth.users SET password_hash=$2 WHERE id=$1',[targetId,await hashPassword(input.newPassword)]);
      await client.query('DELETE FROM forma_auth.sessions WHERE user_id=$1',[targetId]);
      await client.query('DELETE FROM forma_auth.login_attempts WHERE key_hash=ANY($1::text[])',[[attemptKey,digest('login:'+target.login)]]);
      await client.query('COMMIT');
      const relogin=targetId===actor.id;
      if(relogin)res.clearCookie(cookieName,cookieOptions);
      return {ok:true,relogin};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async list(req: Request) {
    await this.admin(req);
    return { users: (await pool.query('SELECT id,name,login,role,active,created_at FROM forma_auth.users ORDER BY created_at')).rows };
  }

  async create(req: Request, body: unknown) {
    const actor=await this.admin(req);
    const input = body as Record<string, unknown> | undefined;
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100 || typeof input.login !== 'string' || !/^[a-zA-Z0-9._-]{3,40}$/.test(input.login) || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 256 || !['admin', 'user'].includes(String(input.role))) throw new BadRequestException('Informe nome, usuário de 3 a 40 caracteres e senha de pelo menos 8 caracteres.');
    const passwordHash=await hashPassword(input.password),client=await pool.connect();
    try{
      await client.query('BEGIN');await setActor(client,actor);
      const { rows: [user] } = await client.query(`INSERT INTO forma_auth.users(id,name,login,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,login,role,active,created_at`, [randomUUID(), input.name.trim(), input.login.toLowerCase(), passwordHash, input.role]);
      await client.query('COMMIT');return {user};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
