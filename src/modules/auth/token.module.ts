import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { AccessTokenGuard } from './access-token.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, AccessTokenGuard],
  exports: [TokenService, AccessTokenGuard],
})
export class TokenModule {}
