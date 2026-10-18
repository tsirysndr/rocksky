import schema from '../../apps/api/src/schema';
const completeSchema = {...schema};
import { getTableName } from 'drizzle-orm';
export const tables = Object.fromEntries(Object.values(completeSchema).map(table => [getTableName(table), table]));
