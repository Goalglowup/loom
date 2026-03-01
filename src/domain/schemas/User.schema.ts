import { EntitySchema } from '@mikro-orm/core';
import { User } from '../entities/User.js';
import { Tenant } from '../entities/Tenant.js';

export const UserSchema = new EntitySchema<User>({
  class: User,
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    email: { type: 'string', columnType: 'varchar(255)', unique: true },
    passwordHash: { type: 'string', columnType: 'varchar(255)', fieldName: 'password_hash' },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
    lastLogin: { type: 'Date', fieldName: 'last_login', nullable: true },
    tenant: { entity: () => Tenant, persist: false, nullable: true },
  },
});
