import mongoose from 'mongoose';

/**
 * Runs `work(session)` inside a MongoDB multi-document transaction and returns its result.
 *
 * Every read/write that must be atomic has to pass `{ session }`. The driver's withTransaction()
 * automatically RETRIES the whole function when MongoDB reports a transient conflict
 * (e.g. two transactions writing the same document), so `work` must be safe to run more than once:
 * no side effects such as socket broadcasts inside it — do those after this resolves.
 */
export async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

/** True for a unique-index violation (MongoDB error code 11000). */
export function isDuplicateKeyError(err) {
  return err?.code === 11000 || err?.cause?.code === 11000;
}
