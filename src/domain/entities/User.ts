export class User {
  id!: string;
  email!: string;
  passwordHash!: string;
  createdAt!: Date;
  lastLogin!: Date | null;
}
