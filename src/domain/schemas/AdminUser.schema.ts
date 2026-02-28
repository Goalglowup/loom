import { EntitySchema } from '@mikro-orm/core';
import { AdminUser } from '../entities/AdminUser.js';

export const AdminUserSchema = new EntitySchema<AdminUser>({
  class: AdminUser,
  tableName: 'admin_users',
  properties: {
    id: { type: 'uuid', primary: true },
    username: { type: 'string', columnType: 'varchar(255)', unique: true },
    passwordHash: { type: 'string', columnType: 'varchar(255)', fieldName: 'password_hash' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
    lastLogin: { type: 'Date', fieldName: 'last_login', nullable: true },
  },
});
