import 'reflect-metadata';
import { Controller, Get, Post, Body, Req, Res, Module, Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.js';
import { migrate, pool } from './database.js';
// Preserve the existing, tested finance transactions while moving the entry point to Nest.
// @ts-expect-error Existing JavaScript finance module.
import { createApp } from '../../../server/app.mjs';

@Controller('api')
class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('auth/login') login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) { return this.auth.login(req, res, body); }
  @Get('auth/me') async me(@Req() req: Request) { return { user: await this.auth.current(req) }; }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.auth.logout(req, res); }
  @Post('auth/password') changePassword(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) { return this.auth.changePassword(req,res,body); }
  @Get('users') list(@Req() req: Request) { return this.auth.list(req); }
  @Post('users') create(@Req() req: Request, @Body() body: unknown) { return this.auth.create(req, body); }
}

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) return res.status(error.getStatus()).json({ error: error.message });
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'Este usuário já existe. Escolha outro login.' });
    console.error('Falha na API:', (error as { code?: string }).code || 'internal_error');
    res.status(503).json({ error: 'Não foi possível acessar o servidor. Tente novamente em instantes.' });
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
class AppModule {}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'true') throw new Error('Configure HTTPS e COOKIE_SECURE=true em produção.');
  await migrate();
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  // Trust only the local Next proxy, never arbitrary client forwarded headers.
  express.set('trust proxy', 'loopback');
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Acesso não permitido.' });
      const origin = req.headers.origin;
      const expected = process.env.APP_ORIGIN || 'http://localhost:5173';
      if (origin && ![expected, 'http://127.0.0.1:5173'].includes(origin)) return res.status(403).json({ error: 'Origem não permitida.' });
      const photoUpload=req.method==='PUT'&&/^\/products\/[^/]+\/photo\/?$/.test(req.path);
      if (photoUpload ? !req.is(['image/jpeg','image/png','image/webp']) : !req.is('application/json')) return res.status(415).json({ error: photoUpload?'Use uma foto JPG, PNG ou WebP.':'Envie os dados em JSON.' });
    }
    next();
  });
  const auth = app.get(AuthService);
  const finance = createApp(pool, { password: '', externalAuth: true, static: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!/^\/api\/(finance|products|colors|brands|entries|sales|movements|summary|health)(\/|\?|$)/.test(req.originalUrl)) return next();
    void auth.current(req).then(user => { Object.assign(req,{actor:user}); finance(req, res, next); }).catch(error => {
      const status = error instanceof HttpException ? error.getStatus() : 503;
      res.status(status).json({ error: status === 401 ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível acessar o servidor.' });
    });
  });
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT || 3001), process.env.API_HOST || '127.0.0.1');
}
bootstrap().catch(async error => { console.error('Não foi possível iniciar a API. Confira o .env. Código:', error.code || error.message); await pool.end(); process.exitCode = 1; });
