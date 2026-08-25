import { redirect } from "next/navigation";

export default function AutomationLegacyRedirect() {
  redirect("/automations/approvals");
}
