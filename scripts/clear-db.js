/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearDB() {
  console.log("Truncating clients, buildings, units, rooms, windows CASCADE...");
  // Note: the supabase-js delete requires a criteria.
  // Delete all from clients will cascade to buildings, units, rooms, windows, media_uploads, etc.
  
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .neq("id", "something_that_does_not_exist");
    
  if (error) {
    console.error("Error clearing DB:", error);
  } else {
    console.log("Successfully cleared clients (and cascaded downward).");
  }
}

clearDB();
