/**
 * Shared Blockchain Verification Logic
 * Used by: verify.html, admin-dashboard.js
 */

/**
 * Reconstructs the exact data object used for hashing.
 *
 * Why this is needed:
 * JSON.stringify() is not deterministic regarding key order (e.g., {a,b} vs {b,a}).
 * However, SHA-256 hashes MUST be identical for constant data.
 * Therefore, we manually reconstruct the object with a hardcoded property order
 * to ensure that the hash generated on the client matches the one stored on the chain.
 *
 * @param {Object} block - The block containing the data.
 * @returns {Object} An object with keys strictly ordered for SHA-256 stability.
 * Data stability explanation:
 * If we generated {b:1, a:2} on client and {a:2, b:1} on server, the hashes would differ.
 * This function enforces a single canonical representation.
 */
function reconstructVerificationData(block) {
  if (block.eventType === "GENESIS") {
    return {
      medicineName: block.data.medicineName,
      quantity: Number(block.data.quantity),
      factoryLocation: block.data.factoryLocation,
      productionDate: block.data.productionDate,
      expiryDate: block.data.expiryDate,
      certificateURL: block.data.certificateURL,
    };
  } else if (block.eventType === "SHIPMENT") {
    return {
      sender: block.data.sender,
      originLocation: block.data.originLocation,
      receiver: block.data.receiver,
      destLocation: block.data.destLocation,
      quantity: Number(block.data.quantity),
      departureTime: block.data.departureTime,
      evidenceURL: block.data.evidenceURL,
    };
  } else if (block.eventType === "DELIVERY_CONFIRMATION") {
    return {
      pharmacyLocation: block.data.pharmacyLocation,
      notes: block.data.notes,
      confirmedAt: block.data.confirmedAt,
      proofURL: block.data.proofURL,
    };
  } else if (block.eventType === "RECALL") {
    return {
      action: block.data.action,
      reason: block.data.reason,
      adminUser: block.data.adminUser,
    };
  } else if (
    block.eventType === "RETURN_TRANSIT" ||
    block.eventType === "RETURN_COMPLETED"
  ) {
    return {
      action: block.data.action,
      notes: block.data.notes,
      confirmedBy: block.data.confirmedBy,
    };
  }
  // Fallback: If we don't know the type, we trust the raw data order.
  // Warning: This implies the creator used a different sorting or none at all.
  return block.data;
}

/**
 * Verifies a single block against its previous hash.
 * @param {Object} block - The block to verify
 * @param {String} previousHash - The hash of the previous block
 * @returns {Object} { isValid: boolean, recomputedHash: string }
 */
function verifyBlockIntegrity(block, previousHash) {
  const orderedData = reconstructVerificationData(block);

  // Recompute Hash using CryptoJS (must be loaded globally)
  const recomputedHash = CryptoJS.SHA256(
    block.previousHash + JSON.stringify(orderedData) + block.timestamp
  ).toString();

  const isValid =
    block.hash === recomputedHash && block.previousHash === previousHash;

  return { isValid, recomputedHash };
}

/**
 * Verifies an entire chain of blocks.
 * @param {Array} logs - Array of blocks (logs)
 * @returns {Boolean} - True if chain is valid
 */
function verifyChain(logs) {
  if (!logs || logs.length === 0) return false;

  // Sort by index just in case
  const sorted = [...logs].sort((a, b) => a.index - b.index);
  let previousHash = "0"; // Genesis

  for (const block of sorted) {
    const check = verifyBlockIntegrity(block, previousHash);
    if (!check.isValid) return false;
    previousHash = block.hash;
  }
  return true;
}
