import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';
import { UserNotFoundError } from '@/modules/users/errors/user.errors';
import { UsersRepository } from '@/modules/users/users.repository';
import { FilesService } from '@/providers/files/files.service';
import { AvatarsRepository } from './avatars.repository';
import type { AvatarUpload } from './pipes/avatar-file.pipe';
import { MAX_ACTIVE_AVATARS } from './constants/avatar.constants';
import {
  AvatarLimitExceededError,
  AvatarNotFoundError,
  AvatarUploadFailedError,
} from './errors/avatar.errors';

@Injectable()
export class AvatarsService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly avatarsRepository: AvatarsRepository,
    private readonly database: DatabaseService,
    private readonly files: FilesService,
    private readonly logger: PinoLogger,
  ) {}

  async upload(userId: number, file: AvatarUpload) {
    await this.ensureUploadSlot(userId);

    const key = `avatars/${userId}/${randomUUID()}.${file.extension}`;

    try {
      await this.files.upload(key, file.buffer, file.contentType);
    } catch (error: unknown) {
      await this.cleanup(key);
      throw new AvatarUploadFailedError(undefined, { cause: error });
    }

    const avatar = await this.database.db
      .transaction()
      .setIsolationLevel('read committed')
      .execute(async (trx) => {
        await this.lockOwner(userId, trx);

        // Повторная проверка для защиты в случае параллельных запросов
        await this.ensureUploadSlot(userId, trx);

        return this.avatarsRepository.create(userId, key, trx);
      })
      .catch(async (error: unknown) => {
        await this.cleanup(key);
        throw error;
      });

    this.logger.info(
      {
        event: 'avatar.uploaded',
        userId,
        objectKey: key,
        bytes: file.buffer.length,
        contentType: file.contentType,
      },
      'Avatar uploaded',
    );

    return avatar;
  }

  async remove(userId: number, avatarId: number): Promise<void> {
    await this.database.db.transaction().execute(async (trx) => {
      await this.lockOwner(userId, trx);
      const avatar = await this.avatarsRepository.softDelete(
        userId,
        avatarId,
        trx,
      );
      if (!avatar) {
        throw new AvatarNotFoundError();
      }
    });
  }

  private async lockOwner(userId: number, trx: Transaction<Database>) {
    const user = await this.usersRepository.findOneForUpdate(userId, trx);
    if (!user) {
      throw new UserNotFoundError();
    }
  }

  private async ensureUploadSlot(userId: number, trx?: Transaction<Database>) {
    const activeAvatars = await this.avatarsRepository.countActive(userId, trx);
    if (activeAvatars >= MAX_ACTIVE_AVATARS) {
      throw new AvatarLimitExceededError();
    }
  }

  private async cleanup(key: string): Promise<void> {
    try {
      await this.files.remove(key);
      this.logger.info(
        { event: 'avatar.cleaned', objectKey: key },
        'Avatar object deleted',
      );
    } catch {
      this.logger.warn(
        { event: 'avatar.cleanup_failed', objectKey: key },
        'Avatar object cleanup failed',
      );
    }
  }
}
