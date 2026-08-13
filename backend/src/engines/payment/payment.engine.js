const LOCAL_PRICE = 3;
const INTERNATIONAL_PRICE = 1;

function createPaymentIntent({ fileId = null, documentId = null, service, market = "local", customerRef = null, provider }) {
  if (!service) throw new Error("service is required");
  if (!["local", "international"].includes(market)) throw new Error("Invalid market");
  if (!provider) throw new Error("provider is required");

  if (market === "local") {
    return {
      amount: LOCAL_PRICE,
      currency: "ETB",
      access_type: "service",
      duration_days: null,
      file_id: fileId,
      document_id: documentId,
      customer_ref: customerRef,
      provider,
      service
    };
  }

  if (!customerRef) throw new Error("customerRef is required for international access");

  return {
    amount: INTERNATIONAL_PRICE,
    currency: "USD",
    access_type: "seven_day",
    duration_days: 7,
    file_id: fileId,
    document_id: documentId,
    customer_ref: customerRef,
    provider,
    service
  };
}

module.exports = {
  LOCAL_PRICE,
  INTERNATIONAL_PRICE,
  createPaymentIntent
};
