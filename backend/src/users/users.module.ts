import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileController } from './profile.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [UsersService],
  controllers: [UsersController, ProfileController],
  exports: [UsersService],
})
export class UsersModule {}
