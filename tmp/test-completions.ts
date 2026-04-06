
import { createClient } from "@/lib/supabase/server";
import { uploadWindowPostBracketingPhoto, uploadWindowInstalledPhoto } from "@/app/actions/fsr-data";

async function testCompletions() {
  const supabase = await createClient();
  
  // Find a window for testing (green status)
  const { data: window } = await supabase
    .from("windows")
    .select("id, room_id, unit_id, label")
    .eq("risk_flag", "green")
    .limit(1)
    .single();

  if (!window) {
    console.error("No green window found for testing.");
    return;
  }

  console.log(`Testing with window: ${window.label} (${window.id})`);

  // 1. Test Bracketing Completion without photo
  const bracketingFd = new FormData();
  bracketingFd.set("unitId", window.unit_id);
  bracketingFd.set("roomId", window.room_id);
  bracketingFd.set("windowId", window.id);
  bracketingFd.set("riskFlag", "green");
  bracketingFd.set("notes", "Testing bracketing completion without photo.");

  console.log("Marking bracketing as complete...");
  const bracketingResult = await uploadWindowPostBracketingPhoto(bracketingFd);
  console.log("Bracketing Result:", bracketingResult);

  // 2. Test Installation Completion without photo
  const installationFd = new FormData();
  installationFd.set("unitId", window.unit_id);
  installationFd.set("roomId", window.room_id);
  installationFd.set("windowId", window.id);
  installationFd.set("riskFlag", "green");
  installationFd.set("notes", "Testing installation completion without photo.");

  console.log("Marking installation as complete...");
  const installationResult = await uploadWindowInstalledPhoto(installationFd);
  console.log("Installation Result:", installationResult);

  // 3. Verify window status in DB
  const { data: updatedWindow } = await supabase
    .from("windows")
    .select("measured, bracketed, installed")
    .eq("id", window.id)
    .single();
  
  console.log("Updated Window Status:", updatedWindow);
}

testCompletions().catch(console.error);
