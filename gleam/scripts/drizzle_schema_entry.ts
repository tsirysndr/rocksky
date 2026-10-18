import schema from '../../apps/api/src/schema';
import googleDriveTokens from '../../apps/api/src/schema/google-drive-tokens';
const completeSchema = {...schema, googleDriveTokens};
import { getTableName } from 'drizzle-orm';
export const tables = Object.fromEntries(Object.values(completeSchema).map(table => [getTableName(table), table]));
