const { supabase } = require("../../config/database");

const CARD_FIELDS = [
  "id", "title", "description", "language", "category",
  "file_type", "file_size_bytes", "page_count",
  "publisher", "year", "edition", "is_free", "price_etb"
].join(", ");

/**
 * Main search — top / related / similar buckets (ProjectContext Second).
 * 1. Full-text search on search_vector
 * 2. Trigram fallback on title when FTS < 3 results
 * 3. Related  = same category, not in top
 * 4. Similar  = same language OR same file_type, not in top/related
 */
async function searchDocuments(query, filters = {}) {
  if (!query || query.trim().length === 0) {
    return { top_results: [], related_results: [], similar_documents: [] };
  }

  const q = query.trim();

  // 1. FTS
  let ftsQuery = supabase
    .from("documents")
    .select(CARD_FIELDS)
    .eq("is_active", true)
    .textSearch("search_vector", q, { type: "plain", config: "simple" })
    .limit(20);

  if (filters.language)  ftsQuery = ftsQuery.eq("language", filters.language);
  if (filters.category)  ftsQuery = ftsQuery.eq("category", filters.category);
  if (filters.file_type) ftsQuery = ftsQuery.eq("file_type", filters.file_type);

  const { data: ftsResults, error: ftsError } = await ftsQuery;
  if (ftsError) throw ftsError;

  let topResults = ftsResults || [];

  // 2. Trigram fallback
  if (topResults.length < 3) {
    const { data: trgm, error: trgmError } = await supabase
      .from("documents")
      .select(CARD_FIELDS)
      .eq("is_active", true)
      .ilike("title", `%${q}%`)
      .limit(10);

    if (trgmError) throw trgmError;
    const existingIds = new Set(topResults.map(r => r.id));
    for (const r of (trgm || [])) {
      if (!existingIds.has(r.id)) topResults.push(r);
    }
    topResults = topResults.slice(0, 20);
  }

  const topIds = new Set(topResults.map(r => r.id));

  // 3. Related
  const categories = [...new Set(topResults.map(r => r.category).filter(Boolean))];
  let relatedResults = [];
  if (categories.length > 0) {
    const { data: related, error } = await supabase
      .from("documents")
      .select(CARD_FIELDS)
      .eq("is_active", true)
      .in("category", categories)
      .not("id", "in", `(${[...topIds].join(",")})`)
      .limit(10);
    if (error) throw error;
    relatedResults = related || [];
  }

  const relatedIds = new Set(relatedResults.map(r => r.id));

  // 4. Similar
  const languages = [...new Set(topResults.map(r => r.language).filter(Boolean))];
  const fileTypes = [...new Set(topResults.map(r => r.file_type).filter(Boolean))];
  let similarDocs = [];

  if (languages.length > 0 || fileTypes.length > 0) {
    const excludeIds = [...topIds, ...relatedIds];
    const excludeClause = excludeIds.length > 0
      ? `(${excludeIds.join(",")})`
      : "('00000000-0000-0000-0000-000000000000')";

    const [byLang, byType] = await Promise.all([
      languages.length > 0
        ? supabase.from("documents").select(CARD_FIELDS)
            .eq("is_active", true).in("language", languages)
            .not("id", "in", excludeClause).limit(6)
        : { data: [] },
      fileTypes.length > 0
        ? supabase.from("documents").select(CARD_FIELDS)
            .eq("is_active", true).in("file_type", fileTypes)
            .not("id", "in", excludeClause).limit(6)
        : { data: [] }
    ]);

    const seen = new Set();
    for (const row of [...(byLang.data || []), ...(byType.data || [])]) {
      if (!seen.has(row.id)) { seen.add(row.id); similarDocs.push(row); }
    }
    similarDocs = similarDocs.slice(0, 10);
  }

  return { query: q, top_results: topResults, related_results: relatedResults, similar_documents: similarDocs };
}

async function getDocumentPreview(documentId) {
  const { data, error } = await supabase
    .from("documents")
    .select(CARD_FIELDS)
    .eq("id", documentId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getRelatedDocuments(document) {
  const excludeId = `('${document.id}')`;
  const [related, similar] = await Promise.all([
    document.category
      ? supabase.from("documents").select(CARD_FIELDS)
          .eq("is_active", true).eq("category", document.category)
          .not("id", "in", excludeId).limit(5)
      : { data: [] },
    supabase.from("documents").select(CARD_FIELDS)
      .eq("is_active", true).eq("language", document.language)
      .not("id", "in", excludeId).limit(5)
  ]);
  return { related_documents: related.data || [], similar_documents: similar.data || [] };
}

module.exports = { searchDocuments, getDocumentPreview, getRelatedDocuments };
