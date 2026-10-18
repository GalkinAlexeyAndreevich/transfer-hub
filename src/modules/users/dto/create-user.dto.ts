export class CreateUserDto {
  login!: string;
  email!: string;
  password!: string;
  birth_date!: string;
  about?: string | null;
}
