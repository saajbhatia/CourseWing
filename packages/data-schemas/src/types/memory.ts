import type { Types, Document } from 'mongoose';

// Base memory interfaces
export interface IMemoryEntry extends Document {
  userId: Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
  tenantId?: string;
}

export interface IMemoryEntryLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
  __v?: number;
}

// Method parameter interfaces
export interface SetMemoryParams {
  userId: string | Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
}

export interface DeleteMemoryParams {
  userId: string | Types.ObjectId;
  key: string;
}

export interface GetFormattedMemoriesParams {
  userId: string | Types.ObjectId;
  /**
   * Optional trusted clock ceiling for rendered timestamps. Frozen demo tenants
   * pass their per-tenant instant here so memories cannot reveal the host clock.
   */
  displayDateCeiling?: Date | string | null;
}

// Result interfaces
export interface MemoryResult {
  ok: boolean;
}

export interface FormattedMemoriesResult {
  withKeys: string;
  withoutKeys: string;
  totalTokens?: number;
}
