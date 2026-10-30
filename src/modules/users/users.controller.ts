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
  ParseIntPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { updateUserSchema, type UpdateUserDto } from './dto/update-user.dto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import {
  findUsersQuerySchema,
  type FindUsersQueryDto,
} from './dto/find-users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  findAll(@Query({ schema: findUsersQuerySchema }) query: FindUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.usersService.me(request.user.id);
  }

  @Get(':id')
  @UseGuards(AccessTokenGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne(id);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body({ schema: updateUserSchema }) dto: UpdateUserDto,
  ) {
    if (request.user.id !== id) {
      throw new ForbiddenException('Нельзя изменять чужой профиль');
    }

    return this.usersService.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(AccessTokenGuard)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.user.id !== id) {
      throw new ForbiddenException('Нельзя удалять чужой профиль');
    }

    return this.usersService.remove(+id);
  }
}
