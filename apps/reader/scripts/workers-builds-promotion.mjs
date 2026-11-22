const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function acquireLock(store, owner, { retries = 24, delay = wait } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const state = await store.read();
    if (state?.owner?.execution === owner.execution) return state.etag;
    if (!state?.owner) {
      try {
        const etag = await store.write({ owner }, state?.etag);
        if (etag) return etag;
      } catch (error) {
        const observed = await store.read();
        if (observed?.owner?.execution === owner.execution) return observed.etag;
        throw error;
      }
    }
    if (attempt < retries) await delay(2500);
  }
  throw new Error("Reader promotion is locked by another execution");
}

export async function releaseLock(store, owner, etag) {
  let error;
  try {
    if (await store.write({ owner: null, released: owner.execution }, etag)) return;
  } catch (failure) {
    error = failure;
  }
  const observed = await store.read();
  if (observed?.owner === null && observed.released === owner.execution) return;
  throw new Error("Promotion lock release was not confirmed", { cause: error });
}

export async function promoteCandidate(candidate, operations) {
  const { currentMain, currentVersion, deploy, verify, acquire, release, receipt } = operations;
  const etag = await acquire(candidate);
  let canRelease = true;
  try {
    if (await currentMain() !== candidate.sha) {
      receipt({ ...candidate, outcome: "superseded", finalVersion: await currentVersion() });
      return;
    }

    const previous = await currentVersion();
    if (previous === candidate.version) {
      await verify(previous);
      receipt({ ...candidate, previous, finalVersion: previous, outcome: "already-live" });
      return;
    }

    receipt({ ...candidate, previous, outcome: "promoting" });
    if (await currentMain() !== candidate.sha) {
      receipt({ ...candidate, previous, finalVersion: await currentVersion(), outcome: "superseded" });
      return;
    }

    // Keep the lock if a write or its readback is inconclusive.
    canRelease = false;
    await deploy(candidate.version);
    if (await currentVersion() !== candidate.version) {
      throw new Error("Could not confirm the candidate is serving production");
    }

    try {
      await verify(candidate.version);
    } catch (error) {
      if (await currentVersion() !== candidate.version) {
        throw new Error("Production version changed after promotion; inspect before unlocking", { cause: error });
      }
      await deploy(previous);
      if (await currentVersion() !== previous) throw new Error("Could not confirm rollback");
      await verify(previous);
      if (await currentVersion() !== previous) throw new Error("Production changed during rollback verification");
      canRelease = true;
      receipt({ ...candidate, previous, finalVersion: previous, outcome: "rolled-back" });
      throw new Error("Production smoke check failed; previous Reader version restored", { cause: error });
    }

    if (await currentVersion() !== candidate.version) {
      throw new Error("Production changed during candidate verification");
    }
    canRelease = true;
    receipt({ ...candidate, previous, finalVersion: candidate.version, outcome: "live" });
  } finally {
    if (canRelease) await release(candidate, etag);
    else receipt({ ...candidate, outcome: "lock-retained" });
  }
}
