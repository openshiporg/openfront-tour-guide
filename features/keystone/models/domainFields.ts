import { list } from '@keystone-6/core';
import { text, integer, select, relationship } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const name = () => text({ validation: { isRequired: true } });
export const money = () => integer({ defaultValue: 0, validation: { min: 0 } });
export const currency = () => text({ defaultValue: 'USD', validation: { match: { regex: /^[A-Z]{3}$/, explanation: 'ISO 4217 currency' } } });
export const state = (values: string[], initial = values[0]) => select({ type: 'enum', options: values.map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: initial, access: { update: () => false } });
export const rel = (ref: string, many = false) => relationship({ ref, many });
export const domainList = (capability: keyof typeof permissions, fields: Record<string, any>, commandOnly = false, hooks?: any) => list({
  access: { operation: { query: permissions[capability], create: commandOnly ? () => false : permissions[capability], update: commandOnly ? () => false : permissions[capability], delete: () => false } },
  fields: { ...fields, ...trackingFields },
  ...(hooks ? { hooks } : {}),
});
