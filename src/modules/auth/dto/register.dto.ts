import {
  createUserSchema,
  type CreateUserDto,
} from '@/modules/users/dto/create-user.dto';

export const registerSchema = createUserSchema;

export type RegisterDto = CreateUserDto;
