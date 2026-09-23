import { Logger, Module } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AuthController } from './auth.controller.js';
import { AUTH_SECRET, AuthService } from './auth.service.js';
import { IdentityGuard } from './identity.guard.js';
import { ConsoleMailer, DisabledMailer, Mailer, ResendMailer } from './mailer.js';
import { TokenService } from './tokens.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    IdentityGuard,
    {
      provide: AUTH_SECRET,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        if (config.jwtSecret) return config.jwtSecret;
        new Logger('Auth').warn('JWT_SECRET not set: using a random secret, so sessions end when the server restarts.');
        return randomBytes(32).toString('hex');
      },
    },
    { provide: TokenService, inject: [AUTH_SECRET], useFactory: (secret: string) => new TokenService(secret) },
    {
      provide: Mailer,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        if (config.mail.resendApiKey) return new ResendMailer(config.mail.resendApiKey, config.mail.from);
        if (config.env !== 'production') return new ConsoleMailer();
        new Logger('Auth').warn('RESEND_API_KEY not set: email sign-in is disabled.');
        return new DisabledMailer();
      },
    },
  ],
  exports: [AuthService, IdentityGuard, TokenService],
})
export class AuthModule {}
