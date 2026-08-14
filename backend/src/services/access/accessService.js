const { supabase } = require("../../config/database");

async function grantFromVerifiedPayment(payment) {
  const { data, error } = await supabase
    .from("access_grants")
    .upsert({
      payment_id: payment.id,
      file_id: payment.file_id || null,
      document_id: payment.document_id || null,
      customer_ref: payment.customer_ref,
      access_type: payment.access_type,
      service: payment.service,
      expires_at:
        payment.access_type === "seven_day"
          ? payment.access_expires_at
          : null
    }, { onConflict: "payment_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function hasFileAccess({
  fileId = null,
  documentId = null,
  service,
  customerRef = null
}) {
  if (!service) return false;

  // A local/service payment is attached to the exact processed file
  // or exact searchable document.

  if ((fileId || documentId) && !customerRef) {
  return false;
}
  if (fileId || documentId) {
    let query = supabase
      .from("access_grants")
      .select("id, access_type, expires_at");

    if (fileId) {
      query = query.eq("file_id", fileId);
    } else {
      query = query.eq("document_id", documentId);
    }

    query = query
  .eq("service", service)
  .eq("customer_ref", customerRef);

const { data: grants, error } = await query;
    if (error) throw error;

    if ((grants || []).some(grant => {
      if (grant.access_type === "service") return true;
      return (
        grant.expires_at &&
        new Date(grant.expires_at).getTime() > Date.now()
      );
    })) {
      return true;
    }
  }

  // International 7-day access is customer/account based and can be
  // reused for the same service while it is still active.
  if (!customerRef) return false;

  const { data: customerGrants, error: customerError } = await supabase
    .from("access_grants")
    .select("id, access_type, service, expires_at")
    .eq("customer_ref", customerRef)
    .eq("access_type", "seven_day")
    .eq("service", service);

  if (customerError) throw customerError;

  return (customerGrants || []).some(grant =>
    grant.expires_at &&
    new Date(grant.expires_at).getTime() > Date.now()
  );
}

module.exports = { grantFromVerifiedPayment, hasFileAccess };
