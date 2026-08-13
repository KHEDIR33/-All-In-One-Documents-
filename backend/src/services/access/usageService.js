const { supabase } = require("../../config/database");

const INTERNATIONAL_DAILY_LIMIT = 10;

async function countRecentServices(customerRef) {
  if (!customerRef) throw new Error("customerRef is required");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("customer_ref", customerRef)
    .gte("created_at", since);

  if (error) throw error;
  return count || 0;
}

async function canUseInternationalService(customerRef) {
  return (await countRecentServices(customerRef)) < INTERNATIONAL_DAILY_LIMIT;
}

async function recordServiceUsage({ customerRef, service }) {
  if (!customerRef || !service) throw new Error("customerRef and service are required");

  const allowed = await canUseInternationalService(customerRef);
  if (!allowed) {
    const error = new Error("Daily international service limit reached");
    error.statusCode = 429;
    error.code = "DAILY_SERVICE_LIMIT_REACHED";
    throw error;
  }

  const { data, error } = await supabase
    .from("usage_events")
    .insert({ customer_ref: customerRef, service })
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  INTERNATIONAL_DAILY_LIMIT,
  countRecentServices,
  canUseInternationalService,
  recordServiceUsage
};
