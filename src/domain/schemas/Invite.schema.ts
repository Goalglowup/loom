import { EntitySchema } from '@mikro-orm/core';
import { Invite } from '../entities/Invite.js';
import { Tenant } from '../entities/Tenant.js';
import { User } from '../entities/User.js';

export const InviteSchema = new EntitySchema<Invite>({
  class: Invite,
  tableName: 'invites',
  properties: {
    id: { type: 'uuid', primary: true },
    tenant: { kind: 'm:1', entity: () => Tenant, fieldName: 'tenant_id' },
    token: { type: 'string', columnType: 'varchar(64)', unique: true },
    createdByUser: { kind: 'm:1', entity: () => User, fieldName: 'created_by' },
    maxUses: { type: 'integer', fieldName: 'max_uses', nullable: true },
    useCount: { type: 'integer', fieldName: 'use_count', default: 0 },
    expiresAt: { type: 'Date', fieldName: 'expires_at' },
    revokedAt: { type: 'Date', fieldName: 'revoked_at', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
