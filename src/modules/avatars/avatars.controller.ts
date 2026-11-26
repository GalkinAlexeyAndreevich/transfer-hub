import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-fastify/multipart';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { idSchema } from '@/common/schemas/id.schema';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '@/modules/auth/guards/access-token.guard';
import { AvatarsService } from './avatars.service';
import { MAX_AVATAR_SIZE } from './constants/avatar.constants';
import { AvatarFilePipe, type AvatarUpload } from './pipes/avatar-file.pipe';

@Controller('users/me')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
@ApiTags('Users')
export class AvatarsController {
  constructor(private readonly avatarsService: AvatarsService) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AVATAR_SIZE, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({ operationId: 'UsersController_uploadAvatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile(AvatarFilePipe) file: AvatarUpload,
  ) {
    return this.avatarsService.upload(request.user.id, file);
  }

  @Delete('avatars/:avatarId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'UsersController_removeAvatar' })
  removeAvatar(
    @Req() request: AuthenticatedRequest,
    @Param('avatarId', { schema: idSchema }) avatarId: number,
  ) {
    return this.avatarsService.remove(request.user.id, avatarId);
  }
}
