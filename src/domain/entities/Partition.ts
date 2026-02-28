import type { Tenant } from './Tenant.js';

export class Partition {
  id!: string;
  tenant!: Tenant;
  parentId!: string | null;
  externalId!: string;
  titleEncrypted!: string | null;
  titleIv!: string | null;
  createdAt!: Date;
}
