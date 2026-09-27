import { HttpException, HttpStatus } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Db } from './postgres.stores.js';
import * as schema from './schema.js';

export const learnerErased = () =>
  new HttpException({ statusCode: HttpStatus.GONE, message: 'Learner data was erased', code: 'learner_erased' }, HttpStatus.GONE);

export const learnerMoved = () =>
  new HttpException(
    { statusCode: HttpStatus.GONE, message: 'Learner data was moved to an account', code: 'learner_moved' },
    HttpStatus.GONE,
  );

export const retiredLearner = (mergedInto: string | null) => (mergedInto ? learnerMoved() : learnerErased());

export async function retirementDestination(db: Db, learnerId: string): Promise<string | null | undefined> {
  const [row] = await db
    .select({ mergedInto: schema.erasedLearners.mergedInto })
    .from(schema.erasedLearners)
    .where(eq(schema.erasedLearners.learnerId, learnerId));
  return row?.mergedInto;
}
