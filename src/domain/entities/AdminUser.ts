export class AdminUser {
  id!: string;
  username!: string;
  passwordHash!: string;
  createdAt!: Date;
  lastLogin!: Date | null;
}
