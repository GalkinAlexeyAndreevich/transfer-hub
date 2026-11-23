import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { idSchema } from '@/common/schemas/id.schema';
import { UsersService } from './users.service';
import { updateUserSchema, type UpdateUserDto } from './dto/update-user.dto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '@/modules/auth/guards/access-token.guard';
import {
  findUsersQuerySchema,
  type FindUsersQueryDto,
} from './dto/find-users.dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('users')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query({ schema: findUsersQuerySchema }) query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.usersService.me(request.user.id);
  }

  @Get(':id')
  findOne(@Param('id', { schema: idSchema }) id: number) {
    return this.usersService.findOneOrThrow(id);
  }

  @Patch(':id')
  update(
    @Param('id', { schema: idSchema }) id: number,
    @Req() request: AuthenticatedRequest,
    @Body({ schema: updateUserSchema }) dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto, request.user.id);
  }

  @Delete(':id')
  remove(
    @Param('id', { schema: idSchema }) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.remove(id, request.user.id);
  }
}
