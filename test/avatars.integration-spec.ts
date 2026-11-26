import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@/database/database.types';
import { AvatarsRepository } from '@/modules/avatars/avatars.repository';
import { MAX_AVATAR_SIZE } from '@/modules/avatars/constants/avatar.constants';
import { AvatarFilePipe } from '@/modules/avatars/pipes/avatar-file.pipe';
import { UsersRepository } from '@/modules/users/users.repository';
import { FilesService } from '@/providers/files/files.service';
import type { Avatar, PublicUser, UserProfile } from './support/api.types';
import { register, type RegisteredUser } from './support/auth.helpers';
import { createTestApp, type TestApp } from './support/test-app';

describe('Avatars (PostgreSQL)', () => {
  let context: TestApp | undefined;
  let app: NestFastifyApplication;
  let database: Kysely<Database>;

  beforeAll(async () => {
    context = await createTestApp();
    ({ app, database } = context);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await context?.close();
  });

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7p8AAAAASUVORK5CYII=',
    'base64',
  );
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAf/2Q==',
    'base64',
  );
  let owner: RegisteredUser;
  let userId: number;
  let objects: Map<string, Buffer>;
  let upload: jest.SpyInstance<Promise<void>, [string, Buffer, string]>;

  beforeEach(async () => {
    owner = await register(app);
    const user = await database
      .selectFrom('users')
      .select('id')
      .where('login', '=', owner.user.login)
      .executeTakeFirstOrThrow();
    userId = user.id;
    objects = new Map();
    upload = jest
      .spyOn(app.get(FilesService), 'upload')
      .mockImplementation((key, body) => {
        objects.set(key, body);
        return Promise.resolve();
      });
    jest.spyOn(app.get(FilesService), 'remove').mockImplementation((key) => {
      objects.delete(key);
      return Promise.resolve();
    });
  });

  function uploadAvatar(
    buffer: Buffer,
    options: {
      authenticated?: boolean;
      copies?: number;
      filename?: string;
      contentType?: string;
    } = {},
  ) {
    const boundary = `avatar-${randomUUID()}`;
    const part = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename ?? 'untrusted.txt'}"\r\nContent-Type: ${options.contentType ?? 'application/octet-stream'}\r\n\r\n`,
      ),
      buffer,
      Buffer.from('\r\n'),
    ]);
    const payload = Buffer.concat([
      ...Array.from({ length: options.copies ?? 1 }, () => part),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    return app.inject({
      method: 'POST',
      url: '/users/me/avatar',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        ...(options.authenticated === false
          ? {}
          : { authorization: `Bearer ${owner.tokens.access_token}` }),
      },
      payload,
    });
  }

  function storedAvatars() {
    return database
      .selectFrom('avatars')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('id', 'asc')
      .execute();
  }

  function removeAvatar(
    avatarId: number,
    accessToken = owner.tokens.access_token,
  ) {
    return app.inject({
      method: 'DELETE',
      url: `/users/me/avatars/${avatarId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  it.each([
    { format: 'PNG', data: png, contentType: 'image/png', extension: 'png' },
    {
      format: 'JPEG',
      data: jpeg,
      contentType: 'image/jpeg',
      extension: 'jpg',
    },
  ])(
    'определяет $format по содержимому и сохраняет ключ',
    async ({ data, contentType, extension }) => {
      const response = await uploadAvatar(data);
      expect(response.statusCode).toBe(201);
      const avatar = response.json<Avatar>();
      const uploadedAt = new Date(avatar.uploadedAt);
      expect(avatar.uploadedAt).toBe(uploadedAt.toISOString());
      expect(avatar.avatarKey).toMatch(
        new RegExp(`^avatars/${userId}/[\\da-f-]+\\.${extension}$`),
      );
      expect(await storedAvatars()).toEqual([
        {
          id: avatar.id,
          user_id: userId,
          object_key: avatar.avatarKey,
          uploaded_at: uploadedAt,
          deleted_at: null,
        },
      ]);
      expect(upload).toHaveBeenCalledWith(avatar.avatarKey, data, contentType);
      const profile = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
      });
      expect(profile.json<UserProfile>().avatars).toEqual([avatar]);
      const user = await app.get(UsersRepository).findProfile(userId);
      expect(user?.avatars).toEqual([{ ...avatar, uploadedAt }]);
    },
  );

  it('отклоняет текстовый файл', async () => {
    const response = await uploadAvatar(Buffer.from('not an image'), {
      filename: 'avatar.png',
      contentType: 'image/png',
    });
    expect(response.statusCode).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(await storedAvatars()).toEqual([]);
  });

  it('принимает ровно 10 МиБ', async () => {
    const data = Buffer.alloc(MAX_AVATAR_SIZE);
    png.copy(data);
    const response = await uploadAvatar(data);
    expect(response.statusCode).toBe(201);
  });

  it('отклоняет файл больше 10 МиБ до pipe и обращения к хранилищу', async () => {
    const pipe = jest.spyOn(AvatarFilePipe.prototype, 'transform');
    const response = await uploadAvatar(Buffer.alloc(MAX_AVATAR_SIZE + 1));
    expect(response.statusCode).toBe(413);
    expect(pipe).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(await storedAvatars()).toEqual([]);
  });

  it('требует файл и запрещает несколько файлов', async () => {
    const missing = await uploadAvatar(png, { copies: 0 });
    const multiple = await uploadAvatar(png, { copies: 2 });
    expect(missing.statusCode).toBe(400);
    expect(multiple.statusCode).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('требует авторизацию', async () => {
    const response = await uploadAvatar(png, { authenticated: false });
    expect(response.statusCode).toBe(401);
    expect(upload).not.toHaveBeenCalled();
  });

  it('сохраняет ранее загруженные аватары при сбое хранилища', async () => {
    const first = await uploadAvatar(png);
    const { avatarKey } = first.json<Avatar>();
    upload.mockRejectedValueOnce(new Error('Storage failure'));
    const response = await uploadAvatar(jpeg);
    expect(response.statusCode).toBe(503);
    expect((await storedAvatars()).map((avatar) => avatar.object_key)).toEqual([
      avatarKey,
    ]);
    expect([...objects.keys()]).toEqual([avatarKey]);
  });

  it('очищает новую загрузку и откатывает изменение при ошибке БД', async () => {
    const first = await uploadAvatar(png);
    const { avatarKey } = first.json<Avatar>();
    jest
      .spyOn(app.get(AvatarsRepository), 'create')
      .mockRejectedValueOnce(new Error('Database failure'));
    const response = await uploadAvatar(jpeg);
    expect(response.statusCode).toBe(500);
    expect((await storedAvatars()).map((avatar) => avatar.object_key)).toEqual([
      avatarKey,
    ]);
    expect([...objects.keys()]).toEqual([avatarKey]);
  });

  it('ограничивает число активных аватаров при параллельных загрузках', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => uploadAvatar(png)),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 201, 201, 201, 201, 409,
    ]);
    const keys = responses
      .filter((response) => response.statusCode === 201)
      .map((response) => response.json<Avatar>().avatarKey)
      .sort();
    expect(
      (await storedAvatars()).map((avatar) => avatar.object_key).sort(),
    ).toEqual(keys);
    expect([...objects.keys()].sort()).toEqual(keys);
    upload.mockClear();
    expect((await uploadAvatar(jpeg)).statusCode).toBe(409);
    expect(upload).not.toHaveBeenCalled();
  });

  it('разрешает только владельцу удалить аватар и освобождает место для загрузки', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => uploadAvatar(png)),
    );
    expect(responses.map((response) => response.statusCode)).toEqual(
      Array(5).fill(201),
    );
    const avatar = responses[0].json<Avatar>();
    const otherUser = await register(app);

    expect(
      (await removeAvatar(avatar.id, otherUser.tokens.access_token)).statusCode,
    ).toBe(404);
    expect(
      (await storedAvatars()).find(({ id }) => id === avatar.id)?.deleted_at,
    ).toBeNull();
    expect((await removeAvatar(avatar.id)).statusCode).toBe(204);
    expect((await removeAvatar(avatar.id)).statusCode).toBe(404);
    const replacement = await uploadAvatar(jpeg);
    expect(replacement.statusCode).toBe(201);

    const rows = await storedAvatars();
    expect(rows).toHaveLength(6);
    expect(rows.find(({ id }) => id === avatar.id)?.deleted_at).toBeInstanceOf(
      Date,
    );
    expect(rows.filter(({ deleted_at }) => deleted_at === null)).toHaveLength(
      5,
    );
    expect(objects.has(avatar.avatarKey)).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/users',
      query: { login: owner.user.login },
      headers: { authorization: `Bearer ${owner.tokens.access_token}` },
    });
    const [user] = list.json<{ items: PublicUser[] }>().items;
    expect(user.avatars).toHaveLength(5);
    expect(user.avatars[0]).toEqual(replacement.json<Avatar>());
    expect(user.avatars).not.toContainEqual(avatar);
  });
});
