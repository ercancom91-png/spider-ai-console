import { searchKnockIndex } from "../knockIndex.js";

export async function searchLocalIndex(subject, options = {}) {
  const results = searchKnockIndex(subject, options);

  return {
    results,
    diagnostics: {
      mode: "self-hosted-index",
      resultCount: results.length,
      reason:
        "SPIDER Index, bu makinedeki lokal SQLite/FTS index içinde arama yaptı. Index büyüdükçe sonuç kapsamı büyür."
    }
  };
}
