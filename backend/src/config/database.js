const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkDatabase() {
  const { error } = await supabase
    .from("files")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Supabase database check failed:", error.message);
    throw error;
  }

  console.log("Supabase PostgreSQL connected successfully");
}

module.exports = { supabase, checkDatabase };
