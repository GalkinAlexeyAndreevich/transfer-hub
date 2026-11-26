import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  PayloadTooLargeException,
  type PipeTransform,
} from '@nestjs/common';
import type { UploadedMultipartFile } from '@nestjs/platform-fastify/multipart';
import { MAX_AVATAR_SIZE } from '../constants/avatar.constants';

export type AvatarUpload = {
  buffer: Buffer;
  contentType: string;
  extension: 'jpg' | 'png';
};

@Injectable()
export class AvatarFilePipe implements PipeTransform<
  UploadedMultipartFile | undefined,
  Promise<AvatarUpload>
> {
  private readonly typeValidator = new FileTypeValidator({
    fileType: /^image\/(jpeg|png)$/,
    overrideMimeType: true,
  });

  async transform(
    file: UploadedMultipartFile | undefined,
  ): Promise<AvatarUpload> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Передай файл аватара в поле file');
    }

    if (file.buffer.length > MAX_AVATAR_SIZE) {
      throw new PayloadTooLargeException(
        'Размер аватара должен быть до 10 МиБ',
      );
    }

    if (!(await this.typeValidator.isValid(file))) {
      throw new BadRequestException(
        'Аватар должен быть в формате JPEG или PNG',
      );
    }

    return {
      buffer: file.buffer,
      contentType: file.mimetype,
      extension: file.mimetype === 'image/png' ? 'png' : 'jpg',
    };
  }
}
