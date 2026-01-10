/**
 * Fetch latest block of a batch blockchain
 * Used by distributor, pharmacy, admin, and verification flows
 */
async function getLastBlock(batchId) {
  try {
    const snapshot = await db
      .collection("batches")
      .doc(batchId)
      .collection("logs")
      .orderBy("index", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error(`No data found for batch ${batchId}`);
    }

    let lastBlock = null;
    snapshot.forEach((doc) => {
      lastBlock = doc.data();
    });

    return lastBlock;
  } catch (error) {
    console.error("Error fetching last event block data:", error.message);
    throw error;
  }
}

/**
 * Append new block to a batch blockchain (append-only)
 * Document ID = block.index (string)
 */
async function appendBlock(batchId, block) {
  try {
    const docId = block.index.toString();

    await db
      .collection("batches")
      .doc(batchId)
      .collection("logs")
      .doc(docId)
      .set(block); // (append-only)

    return true;
  } catch (err) {
    console.error("event block append failed:", err.message);
    throw err;
  }
}
